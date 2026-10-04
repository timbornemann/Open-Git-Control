import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitRunner } from '../GitRunner';
import { RemoteTransferService, type RemoteTransferContext } from '../RemoteTransferService';
import { RemotePreferencesStore } from '../RemotePreferencesStore';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-transfers-'));
  directories.push(root);
  const repo = path.join(root, 'working');
  fs.mkdirSync(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Transfer Test');
  git(repo, 'config', 'user.email', 'transfer@example.invalid');
  git(repo, 'config', 'commit.gpgsign', 'false');
  const commit = (content: string) => {
    fs.writeFileSync(path.join(repo, 'file.txt'), content);
    git(repo, 'add', 'file.txt');
    git(repo, 'commit', '-m', content);
    return git(repo, 'rev-parse', 'HEAD');
  };
  const initial = commit('initial');
  const bare = (name: string) => {
    const target = path.join(root, `${name}.git`);
    fs.mkdirSync(target);
    git(target, 'init', '--bare');
    return target;
  };
  const store = new RemotePreferencesStore(() => path.join(root, 'preferences.json'));
  const service = new RemoteTransferService(new GitRunner(), store);
  const context: RemoteTransferContext = { ownerId: 1, generation: 0, ensureActive: vi.fn(), authorizePush: vi.fn(async () => {}) };
  const ref = (target: string, name = 'refs/heads/main') => git(repo, `--git-dir=${target}`, 'rev-parse', '--verify', name);
  return { root, repo, initial, commit, bare, store, service, context, ref };
}

function olderGitService(f: ReturnType<typeof fixture>) {
  const runner = new GitRunner();
  const runResult = runner.runResult.bind(runner);
  const pushCommands: string[][] = [];
  vi.spyOn(runner, 'runResult').mockImplementation((repo, args, options) => {
    // Emulate a Git installation that does not reset multi-valued pushurl config.
    if (args[0] === 'remote' && options?.envOverrides?.GIT_CONFIG_VALUE_3 === 'https://ogc.invalid/probe-second.git')
      return Promise.resolve({ exitCode: 0, stdout: 'https://ogc.invalid/probe-first.git\nhttps://ogc.invalid/probe-second.git', stderr: '' });
    if (args[0] === 'push') pushCommands.push(args);
    return runResult(repo, args, options);
  });
  return { service: new RemoteTransferService(runner, f.store), pushCommands };
}

describe('RemoteTransferService with real Git', () => {
  it('keeps mixed remote URL lists and branch.pushRemote precedence', async () => {
    const f = fixture();
    git(f.repo, 'remote', 'add', 'forgejo', 'https://forge.example.invalid/team/private.git');
    git(f.repo, 'remote', 'add', 'github', 'git@github.com:team/backup.git');
    git(f.repo, 'config', '--add', 'remote.forgejo.pushurl', 'https://forge.example.invalid/team/private.git');
    git(f.repo, 'config', '--add', 'remote.forgejo.pushurl', 'https://github.com/team/backup.git');
    git(f.repo, 'config', 'branch.main.remote', 'forgejo');
    git(f.repo, 'config', 'branch.main.merge', 'refs/heads/trunk');
    git(f.repo, 'config', 'remote.pushDefault', 'forgejo');
    git(f.repo, 'config', 'branch.main.pushRemote', 'github');
    const snapshot = await f.service.getRemotes(f.repo);
    expect(snapshot.defaultPushRemote).toBe('github');
    expect(snapshot.upstream).toEqual({ remote: 'forgejo', branch: 'trunk' });
    expect(snapshot.remotes.find((remote) => remote.name === 'forgejo')?.pushUrls).toHaveLength(2);
    expect(snapshot.remotes.find((remote) => remote.name === 'github')?.fetchUrls).toEqual(['git@github.com:team/backup.git']);
  });

  it('publishes captured commit and selected tag to isolated URLs while preserving named hooks', async () => {
    const f = fixture();
    const a = f.bare('forgejo');
    const b = f.bare('github');
    git(f.repo, 'remote', 'add', 'origin', a);
    git(f.repo, 'config', '--add', 'remote.origin.pushurl', a);
    git(f.repo, 'config', '--add', 'remote.origin.pushurl', b);
    git(f.repo, 'config', 'push.followTags', 'true');
    git(f.repo, 'config', 'remote.origin.mirror', 'true');
    git(f.repo, 'tag', '-a', 'selected', '-m', 'selected');
    git(f.repo, 'tag', '-a', 'omitted', '-m', 'omitted');
    const tagOid = git(f.repo, 'rev-parse', 'refs/tags/selected');
    const hookOutput = path.join(f.root, 'hooks.txt');
    const quoted = `'${hookOutput.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`;
    const hookPath = path.join(f.repo, '.git', 'hooks', 'pre-push');
    fs.writeFileSync(hookPath, `#!/bin/sh\nprintf '%s\\n' "$1" >> ${quoted}\n`, { mode: 0o755 });
    const plan = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['origin'], tagNames: ['selected'] }, f.context);
    expect(plan.targets).toHaveLength(2);
    f.commit('later commit');
    git(f.repo, 'tag', '-f', 'selected', 'HEAD');
    const result = await f.service.executePush(f.repo, plan.id, f.context);
    expect(result.state).toBe('success');
    expect(f.ref(a)).toBe(f.initial);
    expect(f.ref(b)).toBe(f.initial);
    expect(f.ref(a, 'refs/tags/selected')).toBe(tagOid);
    expect(git(f.repo, `--git-dir=${b}`, 'tag', '--list')).toBe('selected');
    expect(fs.readFileSync(hookOutput, 'utf8').trim().split(/\r?\n/)).toEqual(['origin', 'origin']);
    expect(git(f.repo, 'config', '--get-all', 'remote.origin.pushurl').split(/\r?\n/)).toEqual([a, b]);
    expect(f.context.authorizePush).toHaveBeenCalledWith(plan.secretScanArgs);
    expect(plan.secretScanArgs[1]).toContain(plan.id);
  }, 20_000);

  it('reports partial success and retries only the failed endpoint with the original snapshot', async () => {
    const f = fixture();
    const a = f.bare('available');
    const b = path.join(f.root, 'offline.git');
    git(f.repo, 'remote', 'add', 'primary', a);
    git(f.repo, 'remote', 'add', 'backup', b);
    const plan = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['primary', 'backup'] }, f.context);
    const batch = await f.service.executePush(f.repo, plan.id, f.context);
    expect(batch.state).toBe('partial');
    expect(batch.targets[0].status).toBe('success');
    expect(batch.targets[1].status).toBe('unknown');
    fs.mkdirSync(b);
    git(b, 'init', '--bare');
    f.commit('newer snapshot');
    const retry = await f.service.retryPush(f.repo, batch.id, undefined, f.context);
    expect(retry.state).toBe('success');
    expect(f.ref(a)).toBe(f.initial);
    expect(f.ref(b)).toBe(f.initial);
    expect(retry.targets[0]).toEqual(batch.targets[0]);
  }, 20_000);

  it('captures distinct force leases for each push URL and rejects a later endpoint change', async () => {
    const f = fixture();
    const a = f.bare('a');
    const b = f.bare('b');
    const oldA = f.commit('old a');
    git(f.repo, 'push', a, `${oldA}:refs/heads/main`);
    const oldB = f.commit('old b');
    git(f.repo, 'push', b, `${oldB}:refs/heads/main`);
    git(f.repo, 'reset', '--hard', f.initial);
    git(f.repo, 'remote', 'add', 'both', a);
    git(f.repo, 'config', '--add', 'remote.both.pushurl', a);
    git(f.repo, 'config', '--add', 'remote.both.pushurl', b);
    const plan = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['both'], force: true }, f.context);
    expect(plan.targets.map((target) => target.leaseOid)).toEqual([oldA, oldB]);
    git(f.repo, 'push', '--force', b, `${oldA}:refs/heads/main`);
    const result = await f.service.executePush(f.repo, plan.id, f.context);
    expect(result.state).toBe('partial');
    expect(result.targets.map((target) => target.status)).toEqual(['success', 'rejected']);
    expect(f.ref(a)).toBe(f.initial);
    expect(f.ref(b)).toBe(oldA);
    const retry = await f.service.retryPush(f.repo, result.id, undefined, f.context);
    expect(retry.targets[1].message).toContain('Create a new plan');
    expect(f.ref(b)).toBe(oldA);
  }, 20_000);

  it('binds plans to sender, repository generation, and exact remote configuration', async () => {
    const f = fixture();
    const a = f.bare('a');
    git(f.repo, 'remote', 'add', 'origin', a);
    const plan = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['origin'] }, f.context);
    await expect(f.service.executePush(f.repo, plan.id, { ...f.context, ownerId: 2 })).rejects.toThrow('another repository or window');
    await expect(f.service.executePush(f.repo, plan.id, { ...f.context, generation: 1 })).rejects.toThrow('another repository or window');
    git(f.repo, 'remote', 'set-url', 'origin', f.bare('other'));
    await expect(f.service.executePush(f.repo, plan.id, f.context)).rejects.toThrow('Remote configuration');
    expect(f.context.authorizePush).not.toHaveBeenCalled();
  });

  it('blocks credentials in remote URLs and preserves a corrupt preference file', async () => {
    const f = fixture();
    await expect(f.service.editRemote(f.repo, { action: 'add', name: 'origin', url: 'https://secret@host.invalid/repo.git' }, f.context)).rejects.toThrow(
      'credential-free',
    );
    fs.writeFileSync(path.join(f.root, 'preferences.json'), 'broken');
    expect(() => f.store.write(f.repo, {})).toThrow('preserved');
    expect(fs.readFileSync(path.join(f.root, 'preferences.json'), 'utf8')).toBe('broken');
  });

  it('uses per-remote destination branches and pulls the chosen source without changing the upstream', async () => {
    const f = fixture();
    const a = f.bare('private');
    const b = f.bare('backup');
    git(f.repo, 'remote', 'add', 'forgejo', a);
    git(f.repo, 'remote', 'add', 'github', b);
    const plan = await f.service.planPush(
      f.repo,
      { repoPath: f.repo, remoteNames: ['forgejo', 'github'], targetBranches: { forgejo: 'private-main', github: 'backup-main' } },
      f.context,
    );
    expect(plan.targets.map((target) => target.destinationRef)).toEqual(['refs/heads/private-main', 'refs/heads/backup-main']);
    expect((await f.service.executePush(f.repo, plan.id, f.context)).state).toBe('success');
    expect(f.ref(a, 'refs/heads/private-main')).toBe(f.initial);
    expect(f.ref(b, 'refs/heads/backup-main')).toBe(f.initial);
    const advanced = f.commit('backup changed');
    git(f.repo, 'push', b, `${advanced}:refs/heads/backup-main`);
    git(f.repo, 'reset', '--hard', f.initial);
    git(f.repo, 'config', 'branch.main.remote', 'forgejo');
    git(f.repo, 'config', 'branch.main.merge', 'refs/heads/private-main');
    await f.service.pull(f.repo, { repoPath: f.repo, remote: 'github', branch: 'backup-main', mode: 'ff-only' }, f.context);
    expect(git(f.repo, 'rev-parse', 'HEAD')).toBe(advanced);
    expect(git(f.repo, 'config', '--get', 'branch.main.remote')).toBe('forgejo');
    expect(git(f.repo, 'config', '--get', 'branch.main.merge')).toBe('refs/heads/private-main');
  }, 20_000);

  it('binds each endpoint to its selected account and rejects authentication changes after review', async () => {
    const f = fixture();
    const a = f.bare('account-a');
    const b = f.bare('account-b');
    git(f.repo, 'remote', 'add', 'forgejo', a);
    git(f.repo, 'remote', 'add', 'github', b);
    f.store.write(f.repo, {
      bindings: [
        { remoteName: 'forgejo', url: a, repository: { connectionId: 'forgejo-account', repositoryId: '1', fullPath: 'team/private' } },
        { remoteName: 'github', url: b, repository: { connectionId: 'github-account', repositoryId: '2', fullPath: 'team/backup' } },
      ],
    });
    const generations: Record<string, number> = { 'forgejo-account': 3, 'github-account': 7 };
    const dispose = vi.fn();
    const credentials = vi.fn(
      async (input: { connectionId?: string | null; urls: string[]; expectedGeneration?: number; envOverrides?: NodeJS.ProcessEnv }) => ({
        envOverrides: input.envOverrides ?? {},
        dispose,
      }),
    );
    const service = new RemoteTransferService(new GitRunner(), f.store, credentials, (id) => generations[id]);
    const invalid = await service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['forgejo', 'github'] }, f.context);
    generations['github-account']++;
    await expect(service.executePush(f.repo, invalid.id, f.context)).rejects.toThrow('Hosting authentication changed');
    expect(credentials).not.toHaveBeenCalled();
    const plan = await service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['forgejo', 'github'] }, f.context);
    expect((await service.executePush(f.repo, plan.id, f.context)).state).toBe('success');
    expect(credentials.mock.calls.map(([input]) => [input.connectionId, input.urls, input.expectedGeneration])).toEqual([
      ['forgejo-account', [a], 3],
      ['github-account', [b], 8],
    ]);
    expect(dispose).toHaveBeenCalledTimes(2);
    const preferences = f.store.read(f.repo);
    preferences.bindings![1].credentialMode = 'system';
    await service.setPreferences(f.repo, preferences, f.context);
    const nativePlan = await service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['github'] }, f.context);
    generations['github-account']++;
    generations['forgejo-account']++;
    credentials.mockClear();
    expect((await service.executePush(f.repo, nativePlan.id, f.context)).state).toBe('success');
    expect(credentials).toHaveBeenCalledWith(expect.objectContaining({ connectionId: null, urls: [b], expectedGeneration: undefined }));
    expect(f.store.read(f.repo).bindings![1].repository?.connectionId).toBe('github-account');
  }, 20_000);

  it('reports partial publication within one endpoint and retries only the missing selected ref', async () => {
    const f = fixture();
    const target = f.bare('tag-conflict');
    git(f.repo, 'remote', 'add', 'forgejo', target);
    git(f.repo, 'tag', 'selected');
    git(f.repo, 'push', target, 'refs/tags/selected:refs/tags/selected');
    const captured = f.commit('planned branch and tag');
    git(f.repo, 'tag', '-f', 'selected', 'HEAD');
    const plan = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['forgejo'], tagNames: ['selected'] }, f.context);
    const batch = await f.service.executePush(f.repo, plan.id, f.context);
    expect(batch.state).toBe('partial');
    expect(batch.targets[0].refResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ destinationRef: 'refs/heads/main', sourceOid: captured, status: 'success' }),
        expect.objectContaining({ destinationRef: 'refs/tags/selected', status: 'rejected' }),
      ]),
    );
    expect(f.ref(target)).toBe(captured);
    git(f.repo, `--git-dir=${target}`, 'update-ref', '-d', 'refs/tags/selected');
    f.commit('later branch');
    const retry = await f.service.retryPush(f.repo, batch.id, undefined, f.context);
    expect(retry.state).toBe('success');
    expect(retry.targets[0].refResults).toHaveLength(1);
    expect(retry.targets[0].refResults?.[0].destinationRef).toBe('refs/tags/selected');
    expect(f.ref(target)).toBe(captured);
    expect(f.ref(target, 'refs/tags/selected')).toBe(captured);
  }, 20_000);

  it('keeps normal grouped pushes available without URL isolation and preserves immutable sources', async () => {
    const f = fixture();
    const a = f.bare('group-a');
    const b = f.bare('group-b');
    git(f.repo, 'remote', 'add', 'both', a);
    git(f.repo, 'config', '--add', 'remote.both.pushurl', a);
    git(f.repo, 'config', '--add', 'remote.both.pushurl', b);
    git(f.repo, 'tag', '-a', 'selected', '-m', 'selected');
    const capturedTag = git(f.repo, 'rev-parse', 'refs/tags/selected');
    const { service, pushCommands } = olderGitService(f);
    expect((await service.getRemotes(f.repo)).supportsPushUrlIsolation).toBe(false);
    const plan = await service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['both'], tagNames: ['selected'] }, f.context);
    expect(plan.targets.every((target) => target.grouped)).toBe(true);
    f.commit('after grouped review');
    git(f.repo, 'tag', '-f', 'selected', 'HEAD');
    const result = await service.executePush(f.repo, plan.id, f.context);
    expect(result.state).toBe('success');
    expect(pushCommands).toHaveLength(1);
    for (const target of [a, b]) {
      expect(f.ref(target)).toBe(f.initial);
      expect(f.ref(target, 'refs/tags/selected')).toBe(capturedTag);
    }
    expect(git(f.repo, 'config', '--get-all', 'remote.both.pushurl').split(/\r?\n/)).toEqual([a, b]);
  }, 20_000);

  it('reconciles partial grouped pushes but refuses per-URL force and targeted retries', async () => {
    const f = fixture();
    const a = f.bare('group-available');
    const b = path.join(f.root, 'group-offline.git');
    git(f.repo, 'remote', 'add', 'both', a);
    git(f.repo, 'config', '--add', 'remote.both.pushurl', a);
    git(f.repo, 'config', '--add', 'remote.both.pushurl', b);
    const { service } = olderGitService(f);
    await expect(service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['both'], force: true }, f.context)).rejects.toThrow('Force-with-lease');
    const plan = await service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['both'] }, f.context);
    const result = await service.executePush(f.repo, plan.id, f.context);
    expect(result.state).toBe('partial');
    expect(result.targets.map((target) => target.status)).toEqual(['up-to-date', 'unknown']);
    expect(f.ref(a)).toBe(f.initial);
    await expect(service.retryPush(f.repo, result.id, [result.targets[1].id], f.context)).rejects.toThrow('Targeted retry');
    f.store.write(f.repo, {
      bindings: [
        { remoteName: 'both', url: a, repository: { connectionId: 'account-a', repositoryId: '1', fullPath: 'team/repo' } },
        { remoteName: 'both', url: b, repository: { connectionId: 'account-b', repositoryId: '2', fullPath: 'team/repo' } },
      ],
    });
    await expect(service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['both'] }, f.context)).rejects.toThrow('different hosting accounts');
  }, 20_000);

  it('fetches branches and remote tag tracking separately without moving an existing local tag', async () => {
    const f = fixture();
    const target = f.bare('tag-tracking');
    git(f.repo, 'remote', 'add', 'forgejo', target);
    git(f.repo, 'tag', 'release');
    const advanced = f.commit('remote release');
    git(f.repo, 'push', target, `${advanced}:refs/heads/main`, `${advanced}:refs/tags/release`, `${advanced}:refs/tags/remote-only`);
    git(f.repo, 'reset', '--hard', f.initial);
    await f.service.fetch(f.repo, 'forgejo', f.context);
    expect(git(f.repo, 'rev-parse', 'refs/remotes/forgejo/main')).toBe(advanced);
    expect(git(f.repo, 'rev-parse', 'refs/tags/release')).toBe(f.initial);
    expect(git(f.repo, 'for-each-ref', '--format=%(refname)', 'refs/ogc/remote-tags')).toBe('');
    await f.service.fetch(f.repo, 'forgejo', f.context, true);
    expect(git(f.repo, 'rev-parse', 'refs/ogc/remote-tags/forgejo/release')).toBe(advanced);
    expect(git(f.repo, 'rev-parse', 'refs/ogc/remote-tags/forgejo/remote-only')).toBe(advanced);
    expect(git(f.repo, 'tag', '--list')).toBe('release');
    expect(git(f.repo, 'rev-parse', 'refs/tags/release')).toBe(f.initial);
  }, 20_000);
});
