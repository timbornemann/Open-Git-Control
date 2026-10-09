import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { RepoJobRegistry } from '../../repoJobRegistry';
import { registerRemoteTransferHandlers } from '../registerRemoteTransferHandlers';
import type { GitService } from '../../../GitService';
import type { SecretScanPushGuard } from '../git/secretScanPushGuard';

const mocked = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => Promise<any>>(),
  getRemotes: vi.fn(),
  getPreferences: vi.fn(),
  checkConnection: vi.fn(),
  editRemote: vi.fn(),
  executePush: vi.fn(),
}));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: (...args: any[]) => Promise<any>) => mocked.handlers.set(channel, fn) },
  app: { getPath: () => '/not-used' },
}));
vi.mock('../../../git/RemoteTransferService', () => ({
  RemoteTransferService: class {
    getRemotes = mocked.getRemotes;
    getPreferences = mocked.getPreferences;
    checkConnection = mocked.checkConnection;
    editRemote = mocked.editRemote;
    executePush = mocked.executePush;
  },
}));

describe('repository authority for structured remote transfers', () => {
  let activeRepo: string;
  let registry: RepoJobRegistry;
  let pushGuard: SecretScanPushGuard;
  const event = { sender: { id: 7, send: vi.fn(), isDestroyed: () => false } };
  const invoke = (operation: string, input: unknown) => mocked.handlers.get(IpcChannel.RemoteTransferRequest)!(event, operation, input);
  beforeEach(() => {
    vi.clearAllMocks();
    activeRepo = 'C:/repos/active';
    registry = new RepoJobRegistry();
    registry.cancelForRepoChange(activeRepo);
    pushGuard = {
      requirePushSecretScanApproval: vi.fn<SecretScanPushGuard['requirePushSecretScanApproval']>().mockResolvedValue(null),
      abortActiveScan: vi.fn(),
    };
    mocked.getRemotes.mockResolvedValue({ remotes: [] });
    mocked.getPreferences.mockReturnValue({});
    mocked.checkConnection.mockResolvedValue(true);
    mocked.editRemote.mockResolvedValue({ remotes: [] });
    registerRemoteTransferHandlers({
      gitService: { getRepoPath: () => activeRepo, runner: {} } as GitService,
      pushGuard,
      repoJobRegistry: registry,
      readStoredRepoPaths: () => ['C:/repos/saved'],
    });
  });
  it('allows exact saved inactive repository reads while refusing writes and arbitrary reads', async () => {
    await expect(invoke('getRemotes', { repoPath: 'C:/repos/saved' })).resolves.toMatchObject({ success: true });
    expect(mocked.getRemotes).toHaveBeenCalledWith('C:/repos/saved');
    await expect(invoke('getPreferences', { repoPath: 'C:/repos/saved' })).resolves.toMatchObject({ success: true });
    await expect(invoke('editRemote', { repoPath: 'C:/repos/saved', mutation: { action: 'remove', name: 'origin' } })).resolves.toMatchObject({
      success: false,
    });
    await expect(invoke('getRemotes', { repoPath: 'C:/repos/unknown' })).resolves.toMatchObject({ success: false });
    await expect(invoke('getRemotes', { repoPath: 'C:/repos/saved/child' })).resolves.toMatchObject({ success: false });
    expect(mocked.editRemote).not.toHaveBeenCalled();
  });
  it('stops later push endpoints if the saved policy changes after authorization', async () => {
    let policy = 'v1';
    const pushed: string[] = [];
    pushGuard.createPushPolicyVerifier = vi.fn(async () => {
      const version = policy;
      return () => {
        if (policy !== version) throw new Error('Secret-scan allowlist changed.');
      };
    });
    mocked.executePush.mockImplementation(async (_repoPath, _planId, context) => {
      await context.authorizePush(['plan-marker']);
      for (const endpoint of ['origin', 'backup']) {
        context.ensureActive();
        pushed.push(endpoint);
        policy = 'v2';
      }
      return { state: 'success' };
    });
    await expect(invoke('executePush', { repoPath: activeRepo, planId: 'plan' })).resolves.toMatchObject({
      success: false,
      error: 'Secret-scan allowlist changed.',
    });
    expect(pushed).toEqual(['origin']);
  });
  it('requires the active repository for endpoint checks and never authorizes a push', async () => {
    const input = { repoPath: activeRepo, remote: 'origin', url: 'https://forge.test/repo', connectionId: 'chosen-account' };
    await expect(invoke('checkConnection', input)).resolves.toMatchObject({ success: true, data: true });
    expect(mocked.checkConnection).toHaveBeenCalledWith(activeRepo, input, expect.objectContaining({ ensureActive: expect.any(Function) }));
    await expect(invoke('checkConnection', { ...input, repoPath: 'C:/repos/saved' })).resolves.toMatchObject({ success: false });
    expect(mocked.checkConnection).toHaveBeenCalledTimes(1);
    expect(pushGuard.requirePushSecretScanApproval).not.toHaveBeenCalled();
  });
  it('rejects a policy edit during push authorization before publishing any endpoint', async () => {
    const verify = vi.fn();
    pushGuard.createPushPolicyVerifier = vi.fn().mockResolvedValue(verify);
    vi.mocked(pushGuard.requirePushSecretScanApproval).mockImplementationOnce(async () => {
      verify.mockImplementation(() => {
        throw new Error('Secret-scan allowlist changed.');
      });
      return null;
    });
    const publish = vi.fn();
    mocked.executePush.mockImplementation(async (_repoPath, _planId, context) => {
      await context.authorizePush(['plan-marker']);
      publish();
    });
    await expect(invoke('executePush', { repoPath: activeRepo, planId: 'plan' })).resolves.toMatchObject({
      success: false,
      error: 'Secret-scan allowlist changed.',
    });
    expect(publish).not.toHaveBeenCalled();
  });
  it('discards a read after a repository switch and binds push scanning to the initiating sender and repo', async () => {
    let finishRead!: (value: unknown) => void;
    mocked.getRemotes.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    );
    const pending = invoke('getRemotes', { repoPath: activeRepo });
    activeRepo = 'C:/repos/other';
    registry.cancelForRepoChange(activeRepo);
    finishRead({ remotes: [] });
    await expect(pending).resolves.toMatchObject({ success: false });
    mocked.executePush.mockImplementation(async (repoPath, _planId, context) => {
      await context.authorizePush(['push', 'plan-marker']);
      return { state: 'success', repoPath };
    });
    vi.mocked(pushGuard.requirePushSecretScanApproval).mockResolvedValue({ success: false, error: 'Potential secrets were detected.' });
    await expect(invoke('executePush', { repoPath: activeRepo, planId: 'plan-id' })).resolves.toMatchObject({
      success: false,
      error: 'Potential secrets were detected.',
    });
    expect(pushGuard.requirePushSecretScanApproval).toHaveBeenCalledWith(event, ['push', 'plan-marker'], activeRepo);
  });
});
