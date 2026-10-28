import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { RepoJobRegistry } from '../../repoJobRegistry';
import { registerRemoteTransferHandlers } from '../registerRemoteTransferHandlers';
import type { GitService } from '../../../GitService';
import type { SecretScanPushGuard } from '../git/secretScanPushGuard';
import { BackgroundFetchPreemptedError } from '../../../git/BackgroundFetchPreemptedError';
import { beginCommitProtection, COMMIT_PROTECTION_BUSY_ERROR } from '../../RepositoryCommitProtection';

const mocked = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => Promise<any>>(),
  getRemotes: vi.fn(),
  getPreferences: vi.fn(),
  getPullConfiguration: vi.fn(),
  getPullRecovery: vi.fn(),
  preparePullRecovery: vi.fn(),
  checkConnection: vi.fn(),
  editRemote: vi.fn(),
  executePush: vi.fn(),
  fetch: vi.fn(),
  refVersion: vi.fn(),
}));
vi.mock('../../../git/RemoteSyncReferences', () => ({ remoteSyncReferenceVersion: mocked.refVersion }));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: (...args: any[]) => Promise<any>) => mocked.handlers.set(channel, fn) },
  app: { getPath: () => '/not-used' },
}));
vi.mock('../../../git/RemoteTransferService', () => ({
  RemoteTransferService: class {
    getRemotes = mocked.getRemotes;
    getPreferences = mocked.getPreferences;
    getPullConfiguration = mocked.getPullConfiguration;
    getPullRecovery = mocked.getPullRecovery;
    preparePullRecovery = mocked.preparePullRecovery;
    checkConnection = mocked.checkConnection;
    editRemote = mocked.editRemote;
    executePush = mocked.executePush;
    fetch = mocked.fetch;
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
    mocked.getPullConfiguration.mockResolvedValue({ branch: 'main', rebase: null, fastForward: null, mergeOptions: null });
    mocked.getPullRecovery.mockResolvedValue({ branchExists: false, defaultBranch: { name: 'main', localExists: true } });
    mocked.preparePullRecovery.mockResolvedValue({ branchExists: false, defaultBranch: { name: 'main', localExists: true } });
    mocked.checkConnection.mockResolvedValue(true);
    mocked.editRemote.mockResolvedValue({ remotes: [] });
    mocked.fetch.mockResolvedValue({ output: '' });
    mocked.refVersion.mockReset().mockResolvedValue('unchanged');
    registerRemoteTransferHandlers({
      gitService: { getRepoPath: () => activeRepo, runner: {} } as GitService,
      pushGuard,
      repoJobRegistry: registry,
      readStoredRepoPaths: () => ['C:/repos/saved'],
    });
  });
  it('forwards automatic fetch priority separately from tag scope', async () => {
    await expect(invoke('fetch', { repoPath: activeRepo, remote: 'origin', background: true, tagsOnly: true })).resolves.toEqual({
      success: true,
      data: { output: '' },
    });
    expect(mocked.fetch).toHaveBeenCalledWith(activeRepo, 'origin', expect.objectContaining({ signal: expect.any(AbortSignal) }), {
      background: true,
      tagsOnly: true,
    });
    expect(registry.isRepositoryBusy(activeRepo)).toBe(false);
  });
  it.each(['getPullRecovery', 'preparePullRecovery'] as const)('binds %s to the active repository and cancellation context', async (operation) => {
    const input = { repoPath: activeRepo, remote: 'origin', branch: 'deleted', defaultBranch: 'main' };
    await expect(invoke(operation, input)).resolves.toMatchObject({ success: true, data: { defaultBranch: { name: 'main' } } });
    expect(mocked[operation]).toHaveBeenCalledWith(activeRepo, input, expect.objectContaining({ signal: expect.any(AbortSignal), ownerId: 7 }));
    await expect(invoke(operation, { ...input, repoPath: 'C:/repos/saved' })).resolves.toMatchObject({ success: false });
    expect(mocked[operation]).toHaveBeenCalledTimes(1);
  });
  it('blocks a recovery fetch while a protected commit owns the repository', async () => {
    const release = beginCommitProtection(activeRepo)!;
    try {
      await expect(invoke('preparePullRecovery', { repoPath: activeRepo, remote: 'origin', branch: 'deleted', defaultBranch: 'main' })).resolves.toEqual({
        success: false,
        error: COMMIT_PROTECTION_BUSY_ERROR,
      });
      expect(mocked.preparePullRecovery).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });
  it('returns a deferred automatic sync without emitting a failure or completed fetch', async () => {
    mocked.fetch.mockRejectedValueOnce(new BackgroundFetchPreemptedError());
    await expect(invoke('fetch', { repoPath: activeRepo, remote: 'origin', background: true })).resolves.toEqual({
      success: true,
      data: { output: '', deferred: true },
    });
    expect(event.sender.send.mock.calls.map(([, payload]) => payload.status)).toEqual(['start', 'cancelled']);
    expect(event.sender.send.mock.calls.at(-1)?.[1].details).toEqual({ repoPath: activeRepo, deferred: true });
    expect(registry.isRepositoryBusy(activeRepo)).toBe(false);
  });
  it('defers an automatic retry during a protected commit while preserving manual fetch errors', async () => {
    const release = beginCommitProtection(activeRepo)!;
    try {
      await expect(invoke('fetch', { repoPath: activeRepo, remote: 'origin', background: true })).resolves.toEqual({
        success: true,
        data: { output: '', deferred: true },
      });
      expect(event.sender.send).not.toHaveBeenCalled();
      await expect(invoke('fetch', { repoPath: activeRepo, remote: 'origin' })).resolves.toEqual({ success: false, error: COMMIT_PROTECTION_BUSY_ERROR });
      expect(mocked.fetch).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });
  it('handles the commit guard becoming busy after an automatic fetch starts', async () => {
    let release: (() => void) | null = null;
    mocked.fetch.mockImplementationOnce(async () => {
      release = beginCommitProtection(activeRepo);
      return { output: '' };
    });
    try {
      await expect(invoke('fetch', { repoPath: activeRepo, remote: 'origin', background: true })).resolves.toMatchObject({
        success: true,
        data: { deferred: true },
      });
      expect(event.sender.send.mock.calls.map(([, payload]) => payload.status)).toEqual(['start', 'cancelled']);
    } finally {
      (release as (() => void) | null)?.();
    }
  });
  it.each([false, true])('preserves network errors for fetch (background: %s)', async (background) => {
    mocked.fetch.mockRejectedValueOnce(new Error('Authentication failed.'));
    await expect(invoke('fetch', { repoPath: activeRepo, remote: 'origin', background })).resolves.toEqual({ success: false, error: 'Authentication failed.' });
    expect(event.sender.send.mock.calls.at(-1)?.[1].status).toBe('failed');
  });
  it.each(['repository switch', 'explicit cancellation'])('does not retry a fetch cancelled by %s', async (reason) => {
    mocked.fetch.mockImplementationOnce(async () => {
      if (reason === 'repository switch') {
        activeRepo = 'C:/repos/other';
        registry.cancelForRepoChange(activeRepo);
      } else await invoke('cancel', { repoPath: activeRepo });
      throw new BackgroundFetchPreemptedError();
    });
    await expect(invoke('fetch', { repoPath: activeRepo, remote: 'origin', background: true })).resolves.toMatchObject({ success: false });
    expect(event.sender.send.mock.calls.at(-1)?.[1].status).toBe('cancelled');
  });
  it('rejects malformed automatic fetch modes', async () => {
    await expect(invoke('fetch', { repoPath: activeRepo, remote: 'origin', background: 'true' })).resolves.toMatchObject({ success: false });
    expect(mocked.fetch).not.toHaveBeenCalled();
  });
  it.each([{ tagsOnly: 'true' }, { includeTags: 'true' }, { tagsOnly: true, includeTags: true }])('rejects invalid fetch scopes: %j', async (scope) => {
    await expect(invoke('fetch', { repoPath: activeRepo, remote: 'origin', ...scope })).resolves.toMatchObject({ success: false });
    expect(mocked.fetch).not.toHaveBeenCalled();
    expect(mocked.refVersion).not.toHaveBeenCalled();
  });
  it('compares combined sync references before and after fetching without reporting an unchanged sync as a mutation', async () => {
    const input = { repoPath: activeRepo, remote: 'origin', includeTags: true, background: true };
    await expect(invoke('fetch', input)).resolves.toEqual({ success: true, data: { output: '', refsChanged: false } });
    expect(mocked.refVersion).toHaveBeenCalledTimes(2);
    expect(mocked.fetch).toHaveBeenCalledWith(activeRepo, 'origin', expect.any(Object), { includeTags: true, background: true });
    mocked.refVersion.mockResolvedValueOnce('unchanged').mockResolvedValueOnce('changed');
    await expect(invoke('fetch', input)).resolves.toMatchObject({ data: { refsChanged: true } });
    mocked.refVersion.mockResolvedValue('changed');
    await expect(invoke('fetch', input)).resolves.toMatchObject({ data: { refsChanged: false } });
  });
  it.each(['failed', 'deferred'])('remembers changes from a %s attempt until a complete sync publishes them', async (reason) => {
    const input = { repoPath: activeRepo, remote: 'origin', includeTags: true, background: true };
    mocked.fetch.mockRejectedValueOnce(reason === 'deferred' ? new BackgroundFetchPreemptedError() : new Error('Interrupted tag adoption'));
    const interrupted = await invoke('fetch', input);
    expect(interrupted).toMatchObject(reason === 'deferred' ? { data: { deferred: true } } : { success: false });
    mocked.refVersion.mockResolvedValue('changed-before-retry');
    await expect(invoke('fetch', input)).resolves.toMatchObject({ success: true, data: { refsChanged: true } });
    await expect(invoke('fetch', input)).resolves.toMatchObject({ success: true, data: { refsChanged: false } });
  });
  it('keeps its baseline if the commit guard becomes busy during the final reference read', async () => {
    const input = { repoPath: activeRepo, remote: 'origin', includeTags: true, background: true };
    let release: (() => void) | null = null;
    mocked.refVersion.mockResolvedValueOnce('before').mockImplementationOnce(async () => {
      release = beginCommitProtection(activeRepo);
      return 'after';
    });
    try {
      await expect(invoke('fetch', input)).resolves.toMatchObject({ data: { deferred: true } });
    } finally {
      (release as (() => void) | null)?.();
    }
    mocked.refVersion.mockResolvedValue('after');
    await expect(invoke('fetch', input)).resolves.toMatchObject({ data: { refsChanged: true } });
    await expect(invoke('fetch', input)).resolves.toMatchObject({ data: { refsChanged: false } });
  });
  it('does not silently classify a failed reference read as unchanged', async () => {
    mocked.refVersion.mockRejectedValueOnce(new Error('Unable to read references'));
    await expect(invoke('fetch', { repoPath: activeRepo, remote: 'origin', includeTags: true })).resolves.toMatchObject({
      success: false,
      error: 'Unable to read references',
    });
    expect(mocked.fetch).not.toHaveBeenCalled();
  });
  it('keeps separate reference baselines for each window observing the same repository', async () => {
    const input = { repoPath: activeRepo, remote: 'origin', includeTags: true, background: true };
    const otherWindow = { sender: { ...event.sender, id: 8, send: vi.fn() } };
    const fetchOther = () => mocked.handlers.get(IpcChannel.RemoteTransferRequest)!(otherWindow, 'fetch', input);
    await expect(invoke('fetch', input)).resolves.toMatchObject({ data: { refsChanged: false } });
    await expect(fetchOther()).resolves.toMatchObject({ data: { refsChanged: false } });
    mocked.refVersion.mockResolvedValue('new-version');
    await expect(invoke('fetch', input)).resolves.toMatchObject({ data: { refsChanged: true } });
    await expect(fetchOther()).resolves.toMatchObject({ data: { refsChanged: true } });
    await expect(fetchOther()).resolves.toMatchObject({ data: { refsChanged: false } });
    await expect(invoke('fetch', input)).resolves.toMatchObject({ data: { refsChanged: false } });
  });
  it('allows exact saved inactive repository reads while refusing writes and arbitrary reads', async () => {
    await expect(invoke('getRemotes', { repoPath: 'C:/repos/saved' })).resolves.toMatchObject({ success: true });
    expect(mocked.getRemotes).toHaveBeenCalledWith('C:/repos/saved');
    await expect(invoke('getPreferences', { repoPath: 'C:/repos/saved' })).resolves.toMatchObject({ success: true });
    await expect(invoke('getPullConfiguration', { repoPath: 'C:/repos/saved' })).resolves.toMatchObject({ success: true, data: { branch: 'main' } });
    expect(mocked.getPullConfiguration).toHaveBeenCalledWith('C:/repos/saved', expect.any(AbortSignal));
    await expect(invoke('getPullConfiguration', { repoPath: 'C:/repos/unknown' })).resolves.toMatchObject({ success: false });
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
  it('delivers measured LFS and publishing phases with the owning repository and job', async () => {
    const remoteTransfer = { phase: 'lfs-upload', remote: 'origin', processedObjects: 1, totalObjects: 8, processedBytes: 1000, totalBytes: 8000 };
    mocked.executePush.mockImplementation(async (_repoPath, _planId, context) => {
      context.onProgress('LFS upload', remoteTransfer);
      context.onProgress('Publishing Git refs', { phase: 'publishing', remote: 'origin' });
      return { state: 'success' };
    });
    await invoke('executePush', { repoPath: activeRepo, planId: 'plan' });
    expect(event.sender.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        operation: 'git:executePush',
        status: 'progress',
        details: { repoPath: activeRepo, remoteTransfer },
      }),
    );
    expect(event.sender.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        operation: 'git:executePush',
        status: 'progress',
        details: { repoPath: activeRepo, remoteTransfer: { phase: 'publishing', remote: 'origin' } },
      }),
    );
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
