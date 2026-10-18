import { beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeRemoteSyncSuccess } from '@/data/remoteSyncEvents';
import { queryClient } from '@/data/queryClient';
import { RemoteTransferCoordinator } from './remoteTransferCoordinator';
import { initialRemoteTransferState, useRemoteTransferState } from './remoteTransferState';

const mocked = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/services/hostingClient', () => ({ transferClient: { request: mocked.request } }));
vi.mock('@/services/gitClient', () => ({ gitClient: { runGitCommandForRepo: vi.fn(async () => ({ success: true, data: '' })) } }));

const statusKey = ['resource', 'git', '/repo', 'command', 'status', '--porcelain=v2', '--branch'];
const workingTreeKey = ['resource', 'git', '/repo', 'getWorkingTreeSnapshot'];
const toast = vi.fn();
let coordinator: RemoteTransferCoordinator;
beforeEach(() => {
  vi.clearAllMocks();
  useRemoteTransferState.setState(initialRemoteTransferState());
  mocked.request.mockImplementation(async (operation) => {
    if (operation === 'getRemotes')
      return {
        repoPath: '/repo',
        branch: 'main',
        upstream: { remote: 'origin', branch: 'main' },
        defaultPushRemote: 'origin',
        supportsPushUrlIsolation: true,
        remotes: [{ name: 'origin', fetchUrls: ['https://github.com/team/project.git'], pushUrls: ['https://github.com/team/project.git'] }],
      };
    return operation === 'getPreferences' ? {} : { output: 'ok' };
  });
  coordinator = new RemoteTransferCoordinator({
    getContext: () => ({ repoPath: '/repo', branch: 'main', accounts: 'account', scanEnabled: false }),
    toast,
    refresh: vi.fn(),
    openConfiguration: vi.fn(),
    tr: (_de, en) => en,
  });
  queryClient.setQueryData(statusKey, { success: true, data: 'old status' });
  queryClient.setQueryData(workingTreeKey, { success: true, data: 'old working tree' });
});

describe('successful remote transfer completion', () => {
  it.each(['fetch', 'pull'] as const)('reports a completed %s and invalidates cached branch tracking', async (mode) => {
    const completed = vi.fn();
    const unsubscribe = subscribeRemoteSyncSuccess('/repo', completed);
    try {
      await coordinator.start({ repoPath: '/repo', mode });
      expect(completed).toHaveBeenCalledOnce();
      expect(completed).toHaveBeenCalledWith({ repoPath: '/repo', remote: 'origin', fetchedAt: expect.any(Number) });
      expect(queryClient.getQueryState(statusKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(workingTreeKey)?.isInvalidated).toBe(mode === 'pull');
      expect(toast).toHaveBeenCalledWith(expect.any(String), false);
    } finally {
      unsubscribe();
    }
  });

  it('does not report success when branch fetching succeeds but tag synchronization fails', async () => {
    const completed = vi.fn();
    const unsubscribe = subscribeRemoteSyncSuccess('/repo', completed);
    const request = mocked.request.getMockImplementation()!;
    mocked.request.mockImplementation(async (operation, input) => {
      if (operation === 'fetch' && input.tagsOnly) throw new Error('Tag synchronization failed');
      return request(operation, input);
    });
    try {
      await coordinator.start({ repoPath: '/repo', mode: 'fetch' });
      expect(mocked.request.mock.calls.filter(([operation]) => operation === 'fetch')).toHaveLength(2);
      expect(completed).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith('Tag synchronization failed', true);
    } finally {
      unsubscribe();
    }
  });
});
