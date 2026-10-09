import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitLfsService } from '../GitLfsService';
import { RemoteTransferService, type RemoteTransferContext } from '../RemoteTransferService';
import { RemotePreferencesStore } from '../RemotePreferencesStore';
import { lfsEndpoint, lfsTransferEnvironment } from '../GitLfsTransfers';
import { localLfsObject } from '../GitLfsObjects';
import { parseGitLfsPointer } from '../../../src/shared/ipc/gitLfs';
import { GitService } from '../../GitService';
import { SecretScanService } from '../../SecretScanService';
import { GitIntegrationLifecycle } from './gitIntegrationLifecycle';
import { gitConfigurationEnvironment } from '../remoteTransferValidation';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
vi.setConfig({ testTimeout: 30000 });
const roots: string[] = [];
const lifecycles: GitIntegrationLifecycle[] = [];
const integrationTest = (name: string, work: (lifecycle: GitIntegrationLifecycle) => Promise<void>, timeout = 30000) =>
  it(
    name,
    () => {
      const lifecycle = new GitIntegrationLifecycle();
      lifecycles.push(lifecycle);
      return lifecycle.track(Promise.resolve().then(() => work(lifecycle)));
    },
    timeout,
  );
afterEach(async () => {
  await Promise.all(lifecycles.splice(0).map((lifecycle) => lifecycle.close()));
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('ogc-lfs-transfer-')) throw new Error('Unsafe test cleanup');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

async function fixture(lifecycle: GitIntegrationLifecycle, content = 'actual file content\n') {
  const git = lifecycle.git.bind(lifecycle);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-lfs-transfer-'));
  roots.push(root);
  const repo = path.join(root, 'working');
  fs.mkdirSync(repo);
  await git(repo, 'init', '-b', 'main');
  await git(repo, 'config', 'user.name', 'LFS Transfer');
  await git(repo, 'config', 'user.email', 'lfs@example.invalid');
  await git(repo, 'config', 'core.autocrlf', 'false');
  await git(repo, 'config', 'commit.gpgsign', 'false');
  const hook = path.join(repo, '.git', 'hooks', 'pre-push');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(path.join(repo, 'asset.txt'), content);
  const runner = lifecycle.runner;
  const lfs = new GitLfsService(runner);
  const state = (await lfs.getStatus({ repoPath: repo, files: [{ path: 'asset.txt', source: 'unstaged' }] })).files[0];
  await lfs.track({ repoPath: repo, path: 'asset.txt', source: 'unstaged', scope: 'file', expectedVersion: state.version }, () => {}, lifecycle.signal);
  const pointer = parseGitLfsPointer(`${await git(repo, 'show', ':asset.txt')}\n`)!;
  const bare = async (name: string) => {
    const target = path.join(root, `${name}.git`);
    fs.mkdirSync(target);
    await git(target, 'init', '--bare', '-b', 'main');
    await git(repo, 'remote', 'add', name, pathToFileURL(target).href);
    return target;
  };
  const a = await bare('origin'),
    b = await bare('backup');
  await git(repo, 'commit', '-m', 'LFS content');
  const service = new RemoteTransferService(runner, new RemotePreferencesStore(() => path.join(root, 'preferences.json')));
  const context: RemoteTransferContext = {
    ownerId: 1,
    generation: 0,
    signal: lifecycle.signal,
    ensureActive: () => lifecycle.signal.throwIfAborted(),
    authorizePush: vi.fn(async () => {}),
    onProgress: vi.fn(),
  };
  return { root, repo, runner, lfs, service, context, pointer, a, b, content, hook, git };
}

describe('Git LFS transfers with real Git and independent local LFS stores', () => {
  integrationTest('captures and uploads the same objects to both targets before refs, retaining existing hooks and upstream', async (lifecycle) => {
    const f = await fixture(lifecycle);
    const plan = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['origin', 'backup'] }, f.context);
    expect(plan.lfsObjects).toEqual([f.pointer]);
    expect(plan.targets.map((target) => target.lfsEndpoint)).toEqual([pathToFileURL(f.a).href, pathToFileURL(f.b).href]);
    fs.writeFileSync(path.join(f.repo, 'asset.txt'), 'later working and committed content\n');
    await f.git(f.repo, 'add', 'asset.txt');
    await f.git(f.repo, 'commit', '-m', 'after the captured plan');
    const result = await f.service.executePush(f.repo, plan.id, f.context);
    expect(result.state).toBe('success');
    for (const target of [f.a, f.b]) {
      expect(await f.git(target, 'rev-parse', 'refs/heads/main')).toBe(plan.sourceOid);
      const object = await localLfsObject(target, f.pointer, f.runner);
      expect(object && fs.readFileSync(object, 'utf8')).toBe(f.content);
    }
    expect(fs.readFileSync(f.hook, 'utf8')).toBe('#!/bin/sh\nexit 0\n');
    expect(await f.git(f.repo, 'for-each-ref', '--format=%(upstream)', 'refs/heads/main')).toBe('');
    expect(f.context.onProgress).toHaveBeenCalledWith(expect.stringContaining('Uploading Git LFS objects'));
  });

  integrationTest('keeps partial success and retries only the failed LFS destination', async (lifecycle) => {
    const f = await fixture(lifecycle);
    const run = f.runner.streamOutput.bind(f.runner);
    const uploads: string[] = [];
    let failed = false;
    vi.spyOn(f.runner, 'streamOutput').mockImplementation((cwd, args, ...rest) => {
      if (args[0] === 'lfs' && args[1] === 'push') {
        uploads.push(args[3]);
        if (args[3] === 'backup' && !failed) {
          failed = true;
          throw new Error('Simulated LFS network failure');
        }
      }
      return run(cwd, args, ...rest);
    });
    const plan = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['origin', 'backup'] }, f.context);
    const first = await f.service.executePush(f.repo, plan.id, f.context);
    expect(first.state).toBe('partial');
    expect(first.targets.map((target) => target.status)).toEqual(['success', 'failed']);
    expect(await f.git(f.b, 'for-each-ref', '--format=%(refname)')).toBe('');
    const retry = await f.service.retryPush(f.repo, first.id, undefined, f.context);
    expect(retry.state).toBe('success');
    expect(uploads).toEqual(['origin', 'backup', 'backup']);
  });

  integrationTest('rechecks LFS uploads on an unknown retry even when the captured Git refs are already present', async (lifecycle) => {
    const f = await fixture(lifecycle);
    const run = f.runner.runResult.bind(f.runner);
    let interrupted = false;
    vi.spyOn(f.runner, 'runResult').mockImplementation(async (cwd, args, options) => {
      const result = await run(cwd, args, options);
      if (args[0] === 'push' && !interrupted) {
        interrupted = true;
        return { exitCode: 1, stdout: '', stderr: 'Network connection closed after publication' };
      }
      return result;
    });
    const uploads = vi.spyOn(f.runner, 'streamOutput');
    const plan = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['origin'] }, f.context);
    const first = await f.service.executePush(f.repo, plan.id, f.context);
    expect(first.targets[0].status).toBe('unknown');
    expect(await f.git(f.a, 'rev-parse', 'refs/heads/main')).toBe(plan.sourceOid);
    const retry = await f.service.retryPush(f.repo, first.id, undefined, f.context);
    expect(retry.targets[0].status).toBe('up-to-date');
    expect(uploads.mock.calls.filter((call) => call[1][0] === 'lfs' && call[1][1] === 'push')).toHaveLength(2);
  });

  // Two push plans, three real LFS uploads, a smudging clone and a pull start
  // many Git/LFS processes. Allow for Windows CI load without changing the
  // budget of the other tests; cleanup still aborts and drains owned work.
  integrationTest(
    'clones and pulls actual LFS content from the selected source while preserving tracking',
    async (lifecycle) => {
      const f = await fixture(lifecycle);
      const plan = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['origin', 'backup'] }, f.context);
      expect((await f.service.executePush(f.repo, plan.id, f.context)).state).toBe('success');
      const clone = path.join(f.root, 'clone');
      const cloned = await f.runner.cloneWithProgress(pathToFileURL(f.a).href, clone, vi.fn(), {
        envOverrides: gitConfigurationEnvironment([
          ['filter.lfs.process', 'git-lfs filter-process'],
          ['filter.lfs.required', 'true'],
        ]),
        signal: f.context.signal,
      });
      expect(cloned.success, cloned.error).toBe(true);
      expect(fs.readFileSync(path.join(clone, 'asset.txt'), 'utf8')).toBe(f.content);
      await f.git(clone, 'remote', 'add', 'backup', pathToFileURL(f.b).href);
      fs.writeFileSync(path.join(f.repo, 'asset.txt'), 'content from backup\n');
      await f.git(f.repo, 'add', 'asset.txt');
      await f.git(f.repo, 'commit', '-m', 'backup only');
      const next = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['backup'] }, f.context);
      expect((await f.service.executePush(f.repo, next.id, f.context)).state).toBe('success');
      await f.service.pull(clone, { repoPath: clone, remote: 'backup', branch: 'main', mode: 'ff-only' }, f.context);
      expect(fs.readFileSync(path.join(clone, 'asset.txt'), 'utf8')).toBe('content from backup\n');
      expect(await f.git(clone, 'config', 'branch.main.remote')).toBe('origin');
    },
    90000,
  );

  integrationTest('keeps SSH authentication and rejects credentials embedded in configured LFS endpoints', async (lifecycle) => {
    const f = await fixture(lifecycle);
    const env = lfsTransferEnvironment({}, 'origin', 'https://forge.test/team/repo.git/info/lfs', 'git@forge.test:team/repo.git');
    expect(Object.values(env)).not.toContain('lfs.url');
    expect(Object.values(env)).toContain('git@forge.test:team/repo.git');
    await f.git(f.repo, 'config', 'remote.origin.lfsurl', 'https://user:secret@forge.test/store');
    await expect(lfsEndpoint(f.repo, 'origin', f.runner)).rejects.toThrow('credential-free');
  });

  integrationTest('stops the remaining LFS targets after cancellation and invalidates changes to .lfsconfig', async (lifecycle) => {
    const f = await fixture(lifecycle);
    const abort = new AbortController();
    f.context.signal = abort.signal;
    f.context.onProgress = (message) => {
      if (message.startsWith('success: origin')) abort.abort();
    };
    const plan = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['origin', 'backup'] }, f.context);
    const result = await f.service.executePush(f.repo, plan.id, f.context);
    expect(result.targets.map((target) => target.status)).toEqual(['success', 'skipped']);
    expect(await f.git(f.b, 'for-each-ref', '--format=%(refname)')).toBe('');
    f.context.signal = undefined;
    f.context.onProgress = vi.fn();
    const next = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['backup'] }, f.context);
    fs.writeFileSync(path.join(f.repo, '.lfsconfig'), '[lfs]\nurl=https://another.test/store\n');
    await expect(f.service.executePush(f.repo, next.id, f.context)).rejects.toThrow('configuration');
  });
});

describe('secret scans of actual LFS content', () => {
  integrationTest('detects secrets in staged and committed LFS objects instead of scanning the pointer only', async (lifecycle) => {
    const f = await fixture(lifecycle, 'AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
    const service = new GitService();
    service.setRepoPath(f.repo);
    const scanner = new SecretScanService(service);
    const pushed = await scanner.scanPushDiffs({ repoPath: f.repo, strictness: 'low', allowlistText: '', pushArgs: ['HEAD:refs/heads/main'] });
    expect(pushed.findings).toEqual(expect.arrayContaining([expect.objectContaining({ filePath: 'asset.txt' })]));
    expect(pushed.historyScanIncomplete).toBeUndefined();
    fs.writeFileSync(path.join(f.repo, 'asset.txt'), 'AWS_ACCESS_KEY_ID=AKIAFEDCBA0987654321\n');
    await f.git(f.repo, 'add', 'asset.txt');
    const staged = await scanner.scanStagedDiffs({ repoPath: f.repo, strictness: 'low', allowlistText: '' });
    expect(staged.findings.length).toBeGreaterThan(0);
    expect(staged.findings[0].filePath).toBe('asset.txt');
  });

  integrationTest('marks unavailable referenced objects as incomplete even if the working file is present', async (lifecycle) => {
    const f = await fixture(lifecycle);
    const location = await localLfsObject(f.repo, f.pointer, f.runner);
    fs.rmSync(location!);
    const service = new GitService();
    service.setRepoPath(f.repo);
    const result = await new SecretScanService(service).scanPushDiffs({
      repoPath: f.repo,
      strictness: 'low',
      allowlistText: '',
      pushArgs: ['HEAD:refs/heads/main'],
    });
    expect(result.historyScanIncomplete).toBe(true);
    expect(result.notes.join(' ')).toContain('not available locally');
    expect(fs.readFileSync(path.join(f.repo, 'asset.txt'), 'utf8')).toBe(f.content);
  });
});
