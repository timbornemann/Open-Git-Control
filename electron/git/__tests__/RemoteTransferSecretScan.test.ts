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
import type { GitPushPlanDto } from '../../../src/types/remoteTransfers';

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

function fixture(content = 'Clean initial content\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-push-scan-'));
  directories.push(root);
  const repoPath = path.join(root, 'working');
  const remotePath = path.join(root, 'origin.git');
  fs.mkdirSync(repoPath);
  fs.mkdirSync(remotePath);
  git(repoPath, 'init', '-b', 'main');
  git(repoPath, 'config', 'user.name', 'Push Scan Test');
  git(repoPath, 'config', 'user.email', 'push-scan@example.invalid');
  git(repoPath, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(repoPath, '.env'), content);
  git(repoPath, 'add', '.env');
  git(repoPath, 'commit', '-m', 'Initial');
  git(remotePath, 'init', '--bare');
  git(repoPath, 'remote', 'add', 'origin', remotePath);
  const gitService = new GitService();
  gitService.setRepoPath(repoPath);
  const repoJobRegistry = new RepoJobRegistry();
  repoJobRegistry.cancelForRepoChange(repoPath);
  const scanner = new SecretScanService(gitService);
  const scan = vi.spyOn(scanner, 'scanPushDiffs');
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
  const prepare = async () => {
    const result = await request('planPush', { remoteNames: ['origin'] });
    expect(result.success).toBe(true);
    const plan = result.data as GitPushPlanDto;
    const resultScan = await handlers.get(IpcChannel.GitScanPushSecrets)!(event, { repoPath, pushArgs: plan.secretScanArgs });
    expect(resultScan.success).toBe(true);
    return { plan, resultScan: resultScan.data };
  };
  return { repoPath, remotePath, event, scan, request, prepare };
}

describe('single remote push with the real secret scan and IPC guard', () => {
  it('publishes a clean captured commit without setup or a separate approval, including a repeated up-to-date push', async () => {
    const f = fixture();
    expect((await f.request('getPreferences')).data).toEqual({});
    expect((await f.request('getRemotes')).data.remotes).toHaveLength(1);
    for (let attempt = 0; attempt < 2; attempt++) {
      const { plan, resultScan } = await f.prepare();
      expect(plan.secretScanArgs[0]).toContain(plan.id);
      expect(resultScan.historyScanIncomplete).toBeUndefined();
      expect(resultScan.findings).toEqual([]);
      expect(resultScan.notes.join('\n')).not.toContain('Could not inspect');
      const result = await f.request('executePush', { planId: plan.id });
      expect(result).toMatchObject({ success: true, data: { state: 'success' } });
      expect(git(f.remotePath, 'rev-parse', 'refs/heads/main')).toBe(plan.sourceOid);
    }
    // A completed clean scan is consumed, rather than scanned a second time during execution.
    expect(f.scan).toHaveBeenCalledTimes(2);
    expect((await f.request('getPreferences')).data).toEqual({});
  }, 30_000);

  it('still requires approval for detected secrets and binds that approval to the captured push plan', async () => {
    const f = fixture('AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
    const { plan, resultScan } = await f.prepare();
    expect(resultScan.historyScanIncomplete).toBeUndefined();
    expect(resultScan.findings.length).toBeGreaterThan(0);
    expect(await f.request('executePush', { planId: plan.id })).toMatchObject({ success: false, error: expect.stringContaining('Potential secrets') });
    expect(git(f.remotePath, 'for-each-ref', '--format=%(refname)', 'refs/heads')).toBe('');
    const approval = await handlers.get(IpcChannel.GitApproveSecretScanPush)!(f.event, plan.secretScanArgs, f.repoPath);
    expect(approval).toEqual({ success: true });
    expect(await f.request('executePush', { planId: plan.id })).toMatchObject({ success: true, data: { state: 'success' } });
    expect(git(f.remotePath, 'rev-parse', 'refs/heads/main')).toBe(plan.sourceOid);
  }, 30_000);
});
