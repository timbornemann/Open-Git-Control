import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitService } from '../../GitService';
import { SecretScanService } from '../../SecretScanService';
import { DEFAULT_SETTINGS } from '../../settings';
import { RemotePreferencesStore } from '../RemotePreferencesStore';
import { RepoJobRegistry } from '../../main-process/repoJobRegistry';
import { registerSecretScanPushGuard } from '../../main-process/ipc/git/secretScanPushGuard';
import { registerRemoteTransferHandlers } from '../../main-process/ipc/registerRemoteTransferHandlers';
import { IpcChannel } from '../../../src/types/ipcContract';
import type { GitPushPlanDto, RemoteTransferOperations } from '../../../src/types/remoteTransfers';

const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => Promise<any>>() }));
vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => Promise<any>) => handlers.set(channel, handler) },
}));

const directories: string[] = [];
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
beforeEach(() => handlers.clear());
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function fixture(content = 'Clean initial content\n', usePathAlias = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-push-scan-'));
  directories.push(root);
  let repoPath = path.join(root, 'working');
  const remotePath = path.join(root, 'origin.git');
  fs.mkdirSync(repoPath);
  fs.mkdirSync(remotePath);
  git(repoPath, 'init', '-b', 'main');
  git(repoPath, 'config', 'user.name', 'Push Scan Test');
  git(repoPath, 'config', 'user.email', 'push-scan@example.invalid');
  git(repoPath, 'config', 'commit.gpgsign', 'false');
  git(repoPath, 'config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(repoPath, '.env'), content);
  git(repoPath, 'add', '.env');
  git(repoPath, 'commit', '-m', 'Initial');
  git(remotePath, 'init', '--bare');
  git(repoPath, 'remote', 'add', 'origin', remotePath);
  if (usePathAlias) {
    const alias = path.join(root, 'working-alias');
    fs.symlinkSync(repoPath, alias, process.platform === 'win32' ? 'junction' : 'dir');
    repoPath = alias;
  }
  const gitService = new GitService();
  gitService.setRepoPath(repoPath);
  // IPC requests use the activated root returned by Main, after Git resolves
  // macOS /var aliases, Windows short temp paths and directory links.
  const activeRepoPath = gitService.getRepoPath();
  if (!activeRepoPath) throw new Error('Fixture repository was not activated.');
  repoPath = activeRepoPath;
  const repoJobRegistry = new RepoJobRegistry();
  repoJobRegistry.cancelForRepoChange(repoPath);
  const scanner = new SecretScanService(gitService);
  const scan = vi.spyOn(scanner, 'scanPushDiffs');
  const stream = vi.spyOn(gitService, 'streamCommandLinesAtPath');
  const event = { sender: { id: 7, send: vi.fn(), isDestroyed: () => false } };
  const pushGuard = registerSecretScanPushGuard({
    gitService,
    secretScanService: scanner,
    repoJobRegistry,
    readSettingsWithMigration: () => ({ ...DEFAULT_SETTINGS, secretScanStrictness: 'low' }),
  });
  registerRemoteTransferHandlers({
    gitService,
    pushGuard,
    repoJobRegistry,
    preferencesStore: new RemotePreferencesStore(() => path.join(root, 'preferences.json')),
    readStoredRepoPaths: () => [repoPath],
  });
  const request = (operation: string, input: object = {}) => handlers.get(IpcChannel.RemoteTransferRequest)!(event, operation, { repoPath, ...input });
  const scanPlan = (plan: GitPushPlanDto, sender = event) => handlers.get(IpcChannel.GitScanPushSecrets)!(sender, { repoPath, pushArgs: plan.secretScanArgs });
  const prepare = async (input: Partial<RemoteTransferOperations['planPush']['input']> = {}) => {
    const result = await request('planPush', { remoteNames: ['origin'], ...input });
    expect(result.success, result.error).toBe(true);
    const plan = result.data as GitPushPlanDto;
    const resultScan = await scanPlan(plan);
    expect(resultScan.success, resultScan.error).toBe(true);
    return { plan, resultScan: resultScan.data };
  };
  let commits = 0;
  const commit = (content: string, file = '.env') => {
    fs.writeFileSync(path.join(repoPath, file), content);
    git(repoPath, 'add', file);
    git(repoPath, 'commit', '-m', `Change ${++commits}`);
    return git(repoPath, 'rev-parse', 'HEAD');
  };
  const bare = (name: string) => {
    const target = path.join(root, `${name}.git`);
    fs.mkdirSync(target);
    git(target, 'init', '--bare');
    return target;
  };
  const showCommits = () => stream.mock.calls.filter(([, args]) => args[0] === 'show').flatMap(([, args]) => args.filter((arg) => /^[0-9a-f]{40}$/.test(arg)));
  return { repoPath, remotePath, event, scan, stream, scanner, gitService, repoJobRegistry, request, prepare, scanPlan, commit, bare, showCommits };
}

describe('single remote push with the real secret scan and IPC guard', () => {
  it.each([false, true])(
    'publishes a clean captured commit without setup or a separate approval, including a repeated up-to-date push (path alias: %s)',
    async (usePathAlias) => {
      const f = fixture(undefined, usePathAlias);
      expect((await f.request('getPreferences')).data).toEqual({});
      expect((await f.request('getRemotes')).data.remotes).toHaveLength(1);
      for (let attempt = 0; attempt < 2; attempt++) {
        const { plan, resultScan } = await f.prepare();
        expect(plan.secretScanArgs[0]).toContain(plan.id);
        expect(resultScan.historyScanIncomplete).toBeUndefined();
        expect(resultScan.findings).toEqual([]);
        expect(resultScan.notes.join('\n')).not.toContain('Could not inspect');
        expect(resultScan.pushScope).toMatchObject({ mode: 'incremental', endpointCount: 1, totalCommits: attempt === 0 ? 1 : 0 });
        const result = await f.request('executePush', { planId: plan.id });
        expect(result).toMatchObject({ success: true, data: { state: 'success' } });
        expect(git(f.remotePath, 'rev-parse', 'refs/heads/main')).toBe(plan.sourceOid);
      }
      // A completed clean scan is consumed, rather than scanned a second time during execution.
      expect(f.scan).toHaveBeenCalledTimes(2);
      expect(f.showCommits()).toHaveLength(1);
      expect((await f.request('getPreferences')).data).toEqual({});
    },
    30_000,
  );

  it.each([false, true])(
    'still requires approval for detected secrets and binds that approval to the captured push plan (path alias: %s)',
    async (usePathAlias) => {
      const f = fixture('AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n', usePathAlias);
      const { plan, resultScan } = await f.prepare();
      expect(resultScan.historyScanIncomplete).toBeUndefined();
      expect(resultScan.findings.length).toBeGreaterThan(0);
      expect(await f.request('executePush', { planId: plan.id })).toMatchObject({ success: false, error: expect.stringContaining('Potential secrets') });
      expect(git(f.remotePath, 'for-each-ref', '--format=%(refname)', 'refs/heads')).toBe('');
      const approval = await handlers.get(IpcChannel.GitApproveSecretScanPush)!(f.event, plan.secretScanArgs, f.repoPath);
      expect(approval).toEqual({ success: true });
      expect(await f.request('executePush', { planId: plan.id })).toMatchObject({ success: true, data: { state: 'success' } });
      expect(git(f.remotePath, 'rev-parse', 'refs/heads/main')).toBe(plan.sourceOid);
    },
    30_000,
  );
});

describe('fresh endpoint secret-scan reachability', () => {
  it('skips already published secrets and all history work despite stale tracking refs', async () => {
    const f = fixture('AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
    const initial = git(f.repoPath, 'rev-parse', 'HEAD');
    f.commit('Secret removed\n');
    git(f.repoPath, 'push', 'origin', 'main');
    git(f.repoPath, 'update-ref', 'refs/remotes/origin/main', initial);
    const { plan, resultScan } = await f.prepare();
    expect(resultScan.pushScope).toMatchObject({ mode: 'incremental', totalCommits: 0 });
    expect(resultScan.notes.join('\n')).toContain('history scan was skipped');
    expect(resultScan.findings).toEqual([]);
    expect(resultScan.stats.toPushLines).toBe(0);
    expect(f.showCommits()).toEqual([]);
    expect(git(f.repoPath, 'rev-parse', 'refs/remotes/origin/main')).toBe(initial);
    expect(await f.request('executePush', { planId: plan.id })).toMatchObject({ success: true });
  }, 30_000);

  it('checks every new intermediate commit even when tracking falsely reports them published', async () => {
    const f = fixture();
    const initial = git(f.repoPath, 'rev-parse', 'HEAD');
    git(f.repoPath, 'push', 'origin', 'main');
    const added = f.commit('AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
    const removed = f.commit('Removed again\n');
    git(f.repoPath, 'update-ref', 'refs/remotes/origin/main', removed);
    const { resultScan } = await f.prepare();
    expect(resultScan.pushScope).toMatchObject({ mode: 'incremental', totalCommits: 2 });
    expect(resultScan.findings).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: 'aws-access-key-id', source: 'to-push' })]));
    expect(f.showCommits()).toEqual([added, removed]);
    expect(f.showCommits()).not.toContain(initial);
    expect(git(f.remotePath, 'rev-parse', 'refs/heads/main')).toBe(initial);
    expect(git(f.repoPath, 'rev-parse', 'refs/remotes/origin/main')).toBe(removed);
  }, 30_000);

  it('inspects each push URL rather than the fetch URL and deduplicates shared missing commits', async () => {
    const f = fixture();
    const initial = git(f.repoPath, 'rev-parse', 'HEAD');
    git(f.repoPath, 'push', 'origin', 'main');
    const added = f.commit('New version\n');
    const backup = f.bare('backup');
    git(f.repoPath, 'config', '--add', 'remote.origin.pushurl', f.remotePath);
    git(f.repoPath, 'config', '--add', 'remote.origin.pushurl', backup);
    const { resultScan } = await f.prepare({ targetBranches: { origin: 'backup-branch' } });
    expect(resultScan.pushScope).toMatchObject({ mode: 'incremental', endpointCount: 2, totalCommits: 2 });
    expect([...new Set(f.showCommits())].sort()).toEqual([initial, added].sort());
    expect(f.showCommits()).toHaveLength(2);
    const progress = f.event.sender.send.mock.calls.map(([, data]) => data.details?.secretScan).filter(Boolean);
    expect(progress).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'history', totalCommits: 2, processedCommits: 2 })]));
  }, 30_000);

  it('combines named endpoints with different advertised branches without changing upstream', async () => {
    const f = fixture();
    git(f.repoPath, 'push', '-u', 'origin', 'main');
    const backup = f.bare('named-backup');
    git(f.repoPath, 'remote', 'add', 'backup', backup);
    git(f.repoPath, 'push', 'backup', 'main:archive');
    const added = f.commit('New version\n');
    git(f.repoPath, 'push', 'origin', 'main');
    const { resultScan } = await f.prepare({ remoteNames: ['origin', 'backup'], targetBranches: { backup: 'archive' } });
    expect(resultScan.pushScope).toMatchObject({ mode: 'incremental', endpointCount: 2, totalCommits: 1 });
    expect(f.showCommits()).toEqual([added]);
    expect(git(f.repoPath, 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/main');
  }, 30_000);

  it('checks selected annotated tag history without unrelated local tags', async () => {
    const f = fixture();
    git(f.repoPath, 'push', 'origin', 'main');
    git(f.repoPath, 'checkout', '-b', 'selected-history');
    const tagged = f.commit('AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
    git(f.repoPath, 'tag', '-a', 'selected', '-m', 'Selected');
    git(f.repoPath, 'checkout', 'main');
    git(f.repoPath, 'checkout', '-b', 'unrelated-history');
    const unrelated = f.commit('OTHER=AKIA1234567890ABCDEF\n');
    git(f.repoPath, 'tag', 'unselected');
    git(f.repoPath, 'checkout', 'main');
    const { resultScan } = await f.prepare({ tagNames: ['selected'] });
    expect(resultScan.pushScope).toMatchObject({ totalCommits: 1 });
    expect(resultScan.findings).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'tag' })]));
    expect(f.showCommits()).toEqual([tagged]);
    expect(f.showCommits()).not.toContain(unrelated);
  }, 30_000);

  it('deduplicates branch, lightweight and annotated tags, and uses remote tag peels as a baseline', async () => {
    const f = fixture();
    git(f.repoPath, 'push', 'origin', 'main');
    const tagged = f.commit('Tagged version\n');
    git(f.repoPath, 'tag', 'lightweight');
    git(f.repoPath, 'tag', '-a', 'annotated', '-m', 'Annotated');
    const first = await f.prepare({ tagNames: ['lightweight', 'annotated'] });
    expect(first.resultScan.pushScope.totalCommits).toBe(1);
    expect(f.showCommits()).toEqual([tagged]);
    git(f.repoPath, 'push', 'origin', 'refs/tags/annotated');
    f.stream.mockClear();
    const second = await f.prepare({ tagNames: ['lightweight', 'annotated'] });
    expect(second.resultScan.pushScope.totalCommits).toBe(0);
    expect(f.showCommits()).toEqual([]);
  }, 30_000);

  it('excludes common ancestors for a divergent force push using the actual remote history', async () => {
    const f = fixture();
    git(f.repoPath, 'push', 'origin', 'main');
    git(f.repoPath, 'branch', 'remote-version');
    const local = f.commit('Local version\n');
    git(f.repoPath, 'checkout', 'remote-version');
    const remote = f.commit('Different remote version\n');
    git(f.repoPath, 'push', 'origin', 'remote-version:main');
    git(f.repoPath, 'checkout', 'main');
    const { plan, resultScan } = await f.prepare({ force: true });
    expect(plan.targets[0].leaseOid).toBe(remote);
    expect(resultScan.pushScope).toMatchObject({ mode: 'incremental', totalCommits: 1 });
    expect(f.showCommits()).toEqual([local]);
  }, 30_000);

  it('rejects a clean approval if the remote loses commits, then checks the newly missing history', async () => {
    const f = fixture();
    const initial = git(f.repoPath, 'rev-parse', 'HEAD');
    f.commit('AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
    f.commit('Removed\n');
    git(f.repoPath, 'push', 'origin', 'main');
    const { plan, resultScan } = await f.prepare();
    expect(resultScan.findings).toEqual([]);
    expect(resultScan.pushScope.totalCommits).toBe(0);
    git(f.remotePath, 'update-ref', 'refs/heads/main', initial);
    expect(await f.request('executePush', { planId: plan.id })).toMatchObject({ success: false, error: expect.stringContaining('Remote history changed') });
    expect(git(f.remotePath, 'rev-parse', 'refs/heads/main')).toBe(initial);
    expect((await f.prepare()).resultScan.findings.length).toBeGreaterThan(0);
  }, 30_000);

  it('does not issue an approval when the advertised baseline changes during inspection', async () => {
    const f = fixture();
    const initial = git(f.repoPath, 'rev-parse', 'HEAD');
    f.commit('Remote version\n');
    git(f.repoPath, 'push', 'origin', 'main');
    const result = await f.request('planPush', { remoteNames: ['origin'] });
    const realScan = f.scanner.scanPushDiffs.bind(f.scanner);
    f.scan.mockImplementationOnce(async (options) => {
      const scanned = await realScan(options);
      git(f.remotePath, 'update-ref', 'refs/heads/main', initial);
      return scanned;
    });
    expect(await f.scanPlan(result.data)).toMatchObject({ success: false, error: expect.stringContaining('Remote history changed') });
    expect(await handlers.get(IpcChannel.GitApproveSecretScanPush)!(f.event, result.data.secretScanArgs, f.repoPath)).toEqual({ success: false });
  }, 30_000);

  it('falls back visibly to full history when the advertised tip is missing locally', async () => {
    const f = fixture('AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
    const initial = git(f.repoPath, 'rev-parse', 'HEAD');
    const added = f.commit('Removed\n');
    git(f.repoPath, 'push', 'origin', 'main');
    git(f.remotePath, 'config', 'user.name', 'Remote Test');
    git(f.remotePath, 'config', 'user.email', 'remote@example.invalid');
    const tree = git(f.remotePath, 'rev-parse', 'main^{tree}');
    const remoteOnly = git(f.remotePath, 'commit-tree', tree, '-p', added, '-m', 'Remote-only commit');
    git(f.remotePath, 'update-ref', 'refs/heads/main', remoteOnly);
    const { resultScan } = await f.prepare();
    expect(resultScan.pushScope).toMatchObject({ mode: 'full', totalCommits: 2, fallbackReasons: [expect.stringContaining('unavailable locally')] });
    expect(resultScan.historyScanIncomplete).toBeUndefined();
    expect(resultScan.findings.length).toBeGreaterThan(0);
    expect(f.showCommits()).toEqual([initial, added]);
  }, 30_000);

  it('falls back safely on an unreachable endpoint and preserves the reason in progress', async () => {
    const f = fixture();
    git(f.repoPath, 'remote', 'set-url', 'origin', `${f.remotePath}-missing`);
    const { resultScan } = await f.prepare();
    expect(resultScan.pushScope).toMatchObject({ mode: 'full', totalCommits: 1 });
    expect(resultScan.pushScope.fallbackReasons[0]).toContain('Full history scan for origin');
    const progress = f.event.sender.send.mock.calls.map(([, data]) => data.details?.secretScan).filter(Boolean);
    expect(progress).toEqual(expect.arrayContaining([expect.objectContaining({ pushScope: resultScan.pushScope })]));
  }, 30_000);

  it('rejects forged sources and scans from another window instead of trusting the marker', async () => {
    const f = fixture();
    const result = await f.request('planPush', { remoteNames: ['origin'] });
    expect(await f.scanPlan(result.data, { sender: { ...f.event.sender, id: 99 } })).toMatchObject({
      success: false,
      error: expect.stringContaining('another repository or window'),
    });
    const forged = { ...result.data, secretScanArgs: [...result.data.secretScanArgs, `${'a'.repeat(40)}:refs/heads/other`] };
    expect(await f.scanPlan(forged)).toMatchObject({ success: false, error: expect.stringContaining('no longer match') });
    expect(f.scan).not.toHaveBeenCalled();
  }, 30_000);

  it('checks new commits above an already published shallow boundary without requiring old history', async () => {
    const f = fixture();
    const initial = git(f.repoPath, 'rev-parse', 'HEAD');
    git(f.repoPath, 'push', 'origin', 'main');
    const added = f.commit('New content\n');
    fs.writeFileSync(path.join(f.repoPath, '.git', 'shallow'), `${initial}\n`);
    const { resultScan } = await f.prepare();
    expect(resultScan.pushScope).toMatchObject({ mode: 'incremental', totalCommits: 1 });
    expect(resultScan.historyScanIncomplete).toBeUndefined();
    expect(f.showCommits()).toEqual([added]);
  }, 30_000);

  it('blocks a shallow full-history fallback rather than treating unavailable ancestors as checked', async () => {
    const f = fixture();
    const initial = git(f.repoPath, 'rev-parse', 'HEAD');
    f.commit('New content\n');
    fs.writeFileSync(path.join(f.repoPath, '.git', 'shallow'), `${initial}\n`);
    const { plan, resultScan } = await f.prepare();
    expect(resultScan.historyScanIncomplete).toBe(true);
    expect(resultScan.notes.join('\n')).toContain('shallow clone');
    expect(await f.request('executePush', { planId: plan.id })).toMatchObject({ success: false, error: expect.stringContaining('could not be fully scanned') });
  }, 30_000);
});
