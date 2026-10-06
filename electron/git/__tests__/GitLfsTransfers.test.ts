import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitRunner } from '../GitRunner';
import { GitLfsService } from '../GitLfsService';
import { RemoteTransferService, type RemoteTransferContext } from '../RemoteTransferService';
import { RemotePreferencesStore } from '../RemotePreferencesStore';
import { lfsEndpoint, lfsTransferEnvironment } from '../GitLfsTransfers';
import { localLfsObject } from '../GitLfsObjects';
import { parseGitLfsPointer } from '../../../src/shared/ipc/gitLfs';
import { GitService } from '../../GitService';
import { SecretScanService } from '../../SecretScanService';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
vi.setConfig({ testTimeout: 30000 });
const roots: string[] = [];
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('ogc-lfs-transfer-')) throw new Error('Unsafe test cleanup');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

async function fixture(content = 'actual file content\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-lfs-transfer-'));
  roots.push(root);
  const repo = path.join(root, 'working');
  fs.mkdirSync(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'LFS Transfer');
  git(repo, 'config', 'user.email', 'lfs@example.invalid');
  git(repo, 'config', 'core.autocrlf', 'false');
  git(repo, 'config', 'commit.gpgsign', 'false');
  const hook = path.join(repo, '.git', 'hooks', 'pre-push');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(path.join(repo, 'asset.txt'), content);
  const runner = new GitRunner();
  const lfs = new GitLfsService(runner);
  const state = (await lfs.getStatus({ repoPath: repo, files: [{ path: 'asset.txt', source: 'unstaged' }] })).files[0];
  await lfs.track({ repoPath: repo, path: 'asset.txt', source: 'unstaged', scope: 'file', expectedVersion: state.version }, () => {});
  const pointer = parseGitLfsPointer(`${git(repo, 'show', ':asset.txt')}\n`)!;
  const bare = (name: string) => {
    const target = path.join(root, `${name}.git`);
    fs.mkdirSync(target);
    git(target, 'init', '--bare', '-b', 'main');
    git(repo, 'remote', 'add', name, pathToFileURL(target).href);
    return target;
  };
  const a = bare('origin'),
    b = bare('backup');
  git(repo, 'commit', '-m', 'LFS content');
  const service = new RemoteTransferService(runner, new RemotePreferencesStore(() => path.join(root, 'preferences.json')));
  const context: RemoteTransferContext = { ownerId: 1, generation: 0, ensureActive: vi.fn(), authorizePush: vi.fn(async () => {}), onProgress: vi.fn() };
  return { root, repo, runner, lfs, service, context, pointer, a, b, content, hook };
}

describe('Git LFS transfers with real Git and independent local LFS stores', () => {
  it('captures and uploads the same objects to both targets before refs, retaining existing hooks and upstream', async () => {
    const f = await fixture();
    const plan = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['origin', 'backup'] }, f.context);
    expect(plan.lfsObjects).toEqual([f.pointer]);
    expect(plan.targets.map((target) => target.lfsEndpoint)).toEqual([pathToFileURL(f.a).href, pathToFileURL(f.b).href]);
    fs.writeFileSync(path.join(f.repo, 'asset.txt'), 'later working and committed content\n');
    git(f.repo, 'add', 'asset.txt');
    git(f.repo, 'commit', '-m', 'after the captured plan');
    const result = await f.service.executePush(f.repo, plan.id, f.context);
    expect(result.state).toBe('success');
    for (const target of [f.a, f.b]) {
      expect(git(target, 'rev-parse', 'refs/heads/main')).toBe(plan.sourceOid);
      const object = await localLfsObject(target, f.pointer, f.runner);
      expect(object && fs.readFileSync(object, 'utf8')).toBe(f.content);
    }
    expect(fs.readFileSync(f.hook, 'utf8')).toBe('#!/bin/sh\nexit 0\n');
    expect(git(f.repo, 'for-each-ref', '--format=%(upstream)', 'refs/heads/main')).toBe('');
    expect(f.context.onProgress).toHaveBeenCalledWith(expect.stringContaining('Uploading Git LFS objects'));
  });

  it('keeps partial success and retries only the failed LFS destination', async () => {
    const f = await fixture();
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
    expect(git(f.b, 'for-each-ref', '--format=%(refname)')).toBe('');
    const retry = await f.service.retryPush(f.repo, first.id, undefined, f.context);
    expect(retry.state).toBe('success');
    expect(uploads).toEqual(['origin', 'backup', 'backup']);
  });

  it('rechecks LFS uploads on an unknown retry even when the captured Git refs are already present', async () => {
    const f = await fixture();
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
    expect(git(f.a, 'rev-parse', 'refs/heads/main')).toBe(plan.sourceOid);
    const retry = await f.service.retryPush(f.repo, first.id, undefined, f.context);
    expect(retry.targets[0].status).toBe('up-to-date');
    expect(uploads.mock.calls.filter((call) => call[1][0] === 'lfs' && call[1][1] === 'push')).toHaveLength(2);
  });

  it('clones and pulls actual LFS content from the selected source while preserving tracking', async () => {
    const f = await fixture();
    const plan = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['origin', 'backup'] }, f.context);
    expect((await f.service.executePush(f.repo, plan.id, f.context)).state).toBe('success');
    const clone = path.join(f.root, 'clone');
    git(f.root, '-c', 'filter.lfs.process=git-lfs filter-process', '-c', 'filter.lfs.required=true', 'clone', pathToFileURL(f.a).href, clone);
    expect(fs.readFileSync(path.join(clone, 'asset.txt'), 'utf8')).toBe(f.content);
    git(clone, 'remote', 'add', 'backup', pathToFileURL(f.b).href);
    fs.writeFileSync(path.join(f.repo, 'asset.txt'), 'content from backup\n');
    git(f.repo, 'add', 'asset.txt');
    git(f.repo, 'commit', '-m', 'backup only');
    const next = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['backup'] }, f.context);
    expect((await f.service.executePush(f.repo, next.id, f.context)).state).toBe('success');
    await f.service.pull(clone, { repoPath: clone, remote: 'backup', branch: 'main', mode: 'ff-only' }, f.context);
    expect(fs.readFileSync(path.join(clone, 'asset.txt'), 'utf8')).toBe('content from backup\n');
    expect(git(clone, 'config', 'branch.main.remote')).toBe('origin');
  });

  it('keeps SSH authentication and rejects credentials embedded in configured LFS endpoints', async () => {
    const f = await fixture();
    const env = lfsTransferEnvironment({}, 'origin', 'https://forge.test/team/repo.git/info/lfs', 'git@forge.test:team/repo.git');
    expect(Object.values(env)).not.toContain('lfs.url');
    expect(Object.values(env)).toContain('git@forge.test:team/repo.git');
    git(f.repo, 'config', 'remote.origin.lfsurl', 'https://user:secret@forge.test/store');
    await expect(lfsEndpoint(f.repo, 'origin', f.runner)).rejects.toThrow('credential-free');
  });

  it('stops the remaining LFS targets after cancellation and invalidates changes to .lfsconfig', async () => {
    const f = await fixture();
    const abort = new AbortController();
    f.context.signal = abort.signal;
    f.context.onProgress = (message) => {
      if (message.startsWith('success: origin')) abort.abort();
    };
    const plan = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['origin', 'backup'] }, f.context);
    const result = await f.service.executePush(f.repo, plan.id, f.context);
    expect(result.targets.map((target) => target.status)).toEqual(['success', 'skipped']);
    expect(git(f.b, 'for-each-ref', '--format=%(refname)')).toBe('');
    f.context.signal = undefined;
    f.context.onProgress = vi.fn();
    const next = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['backup'] }, f.context);
    fs.writeFileSync(path.join(f.repo, '.lfsconfig'), '[lfs]\nurl=https://another.test/store\n');
    await expect(f.service.executePush(f.repo, next.id, f.context)).rejects.toThrow('configuration');
  });
});

describe('secret scans of actual LFS content', () => {
  it('detects secrets in staged and committed LFS objects instead of scanning the pointer only', async () => {
    const f = await fixture('AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
    const service = new GitService();
    service.setRepoPath(f.repo);
    const scanner = new SecretScanService(service);
    const pushed = await scanner.scanPushDiffs({ repoPath: f.repo, strictness: 'low', allowlistText: '', pushArgs: ['HEAD:refs/heads/main'] });
    expect(pushed.findings).toEqual(expect.arrayContaining([expect.objectContaining({ filePath: 'asset.txt' })]));
    expect(pushed.historyScanIncomplete).toBeUndefined();
    fs.writeFileSync(path.join(f.repo, 'asset.txt'), 'AWS_ACCESS_KEY_ID=AKIAFEDCBA0987654321\n');
    git(f.repo, 'add', 'asset.txt');
    const staged = await scanner.scanStagedDiffs({ repoPath: f.repo, strictness: 'low', allowlistText: '' });
    expect(staged.findings.length).toBeGreaterThan(0);
    expect(staged.findings[0].filePath).toBe('asset.txt');
  });

  it('marks unavailable referenced objects as incomplete even if the working file is present', async () => {
    const f = await fixture();
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
