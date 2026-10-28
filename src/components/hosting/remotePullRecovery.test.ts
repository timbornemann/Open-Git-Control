import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitRemoteSnapshotDto, GitPullRecoveryDto } from '@/types/remoteTransfers';
import { RemoteTransferCoordinator, type RemoteTransferContext } from './remoteTransferCoordinator';
import { initialRemoteTransferState, useRemoteTransferState } from './remoteTransferState';

const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/services/hostingClient', () => ({ transferClient: { request: mock.request } }));
vi.mock('@/services/gitClient', () => ({ gitClient: { cancelSecretScan: vi.fn() } }));
const missing = "fatal: couldn't find remote ref test-branch";
let context: RemoteTransferContext;
let snapshot: GitRemoteSnapshotDto;
let recovery: GitPullRecoveryDto;
let coordinator: RemoteTransferCoordinator;
const changeBranch = vi.fn(async () => false);
const toast = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  useRemoteTransferState.setState(initialRemoteTransferState());
  context = { repoPath: '/repo', branch: 'test-branch', accounts: 'account', scanEnabled: false };
  snapshot = {
    repoPath: '/repo',
    branch: 'test-branch',
    upstream: { remote: 'origin', branch: 'test-branch' },
    defaultPushRemote: 'origin',
    supportsPushUrlIsolation: true,
    remotes: [{ name: 'origin', fetchUrls: ['https://example.test/repo.git'], pushUrls: ['https://example.test/repo.git'] }],
  };
  recovery = { branchExists: false, defaultBranch: { name: 'main', localExists: true } };
  mock.request.mockImplementation(async (operation) => {
    if (operation === 'getRemotes') return structuredClone(snapshot);
    if (operation === 'getPreferences') return {};
    if (operation === 'getPullRecovery' || operation === 'preparePullRecovery') return structuredClone(recovery);
    if (operation === 'pull') throw new Error(missing);
    return { output: '' };
  });
  coordinator = new RemoteTransferCoordinator({ getContext: () => context, toast, refresh: vi.fn(), openConfiguration: vi.fn(), tr: (_de, en) => en });
});
const start = () => coordinator.start({ repoPath: '/repo', mode: 'pull', pullMode: 'rebase' });
const calls = (operation: string) => mock.request.mock.calls.filter(([name]) => name === operation);

describe('missing pull branch recovery', () => {
  it('opens targeted recovery and hands a requested default-branch switch to the guarded workflow', async () => {
    await start();
    expect(useRemoteTransferState.getState()).toMatchObject({ phase: 'result', resultVisible: true, pullRecovery: recovery, error: missing });
    expect(changeBranch).not.toHaveBeenCalled();
    await coordinator.switchPullToDefault(changeBranch);
    expect(changeBranch).toHaveBeenCalledWith('/repo', 'origin', { name: 'main', localExists: true });
    expect(calls('pull').map(([, input]) => input)).toEqual([{ repoPath: '/repo', remote: 'origin', branch: 'test-branch', mode: 'rebase' }]);
    expect(calls('setPreferences')).toHaveLength(0);
    // A cancelled branch dialog leaves the original source available for review.
    expect(useRemoteTransferState.getState().failedPull?.branch).toBe('test-branch');
    expect(useRemoteTransferState.getState()).toMatchObject({ busy: false, resultVisible: true, error: missing });
  });

  it('retains the missing-ref explanation and avoids guessing a default if inspection fails', async () => {
    const original = mock.request.getMockImplementation()!;
    mock.request.mockImplementation((operation, input) =>
      operation === 'getPullRecovery' ? Promise.reject(new Error('Offline')) : original(operation, input),
    );
    await start();
    expect(useRemoteTransferState.getState()).toMatchObject({
      error: missing,
      pullRecovery: { branchExists: false, defaultBranch: null },
      resultVisible: true,
    });
    await coordinator.switchPullToDefault(changeBranch);
    expect(changeBranch).not.toHaveBeenCalled();
    expect(calls('preparePullRecovery')).toHaveLength(0);
  });

  it('refreshes the suggested default if it changes before the user requests a switch', async () => {
    await start();
    recovery.defaultBranch = { name: 'trunk', localExists: false };
    const original = mock.request.getMockImplementation()!;
    mock.request.mockImplementation((operation, input) =>
      operation === 'preparePullRecovery' ? Promise.reject(new Error('The remote branches changed.')) : original(operation, input),
    );
    await coordinator.switchPullToDefault(changeBranch);
    expect(changeBranch).not.toHaveBeenCalled();
    expect(useRemoteTransferState.getState()).toMatchObject({ resultVisible: true, pullRecovery: recovery, busy: false });
  });

  it('blocks recovery after the selected endpoint changes', async () => {
    await start();
    snapshot.remotes[0].fetchUrls = ['https://other.test/repo.git'];
    await coordinator.switchPullToDefault(changeBranch);
    expect(changeBranch).not.toHaveBeenCalled();
    expect(calls('preparePullRecovery')).toHaveLength(0);
  });

  it('discards a late recovery result after repository navigation', async () => {
    await start();
    let finish!: (value: GitPullRecoveryDto) => void;
    const original = mock.request.getMockImplementation()!;
    mock.request.mockImplementation((operation, input) =>
      operation === 'preparePullRecovery'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : original(operation, input),
    );
    const pending = coordinator.switchPullToDefault(changeBranch);
    for (let index = 0; index < 20; index++) await Promise.resolve();
    expect(finish).toBeDefined();
    context = { ...context, repoPath: '/other' };
    coordinator.invalidate();
    finish(recovery);
    await pending;
    expect(changeBranch).not.toHaveBeenCalled();
    expect(useRemoteTransferState.getState()).toEqual(initialRemoteTransferState());
  });

  it('keeps conflict failures on the existing retry path without querying remote branches', async () => {
    const original = mock.request.getMockImplementation()!;
    mock.request.mockImplementation((operation, input) =>
      operation === 'pull' ? Promise.reject(new Error('CONFLICT (content): Merge conflict in file.txt')) : original(operation, input),
    );
    await start();
    expect(useRemoteTransferState.getState()).toMatchObject({ pullRecovery: null, resultVisible: false });
    expect(calls('getPullRecovery')).toHaveLength(0);
  });
});
