import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyRemoteSyncSuccess, subscribeRemoteSyncSuccess } from '../remoteSyncEvents';
import { queryClient } from '../queryClient';

const history = ['resource', 'git', '/repo', 'getCommitLogPage'];
const status = ['resource', 'git', '/repo', 'command', 'status'];
const workingTree = ['resource', 'git', '/repo', 'getWorkingTreeSnapshot'];
const release = ['resource', 'github', 'account', 'getReleaseContext', { repoPath: '/repo' }];
beforeEach(() => {
  for (const key of [history, status, workingTree, release]) queryClient.setQueryData(key, { success: true, data: 'cached' });
});
afterEach(() => queryClient.clear());

describe('remote sync cache invalidation', () => {
  it('reports a successful unchanged sync without invalidating history, status, working tree or release resources', () => {
    const receive = vi.fn();
    const unsubscribe = subscribeRemoteSyncSuccess('/repo', receive);
    try {
      notifyRemoteSyncSuccess('/repo', 'source', 'fetch', false);
      expect(receive).toHaveBeenCalledWith({ repoPath: '/repo', remote: 'source', fetchedAt: expect.any(Number), refsChanged: false });
      for (const key of [history, status, workingTree, release]) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
    } finally {
      unsubscribe();
    }
  });
  it.each([true, undefined])('invalidates ref-dependent resources when changes are true or unknown (%s)', (changed) => {
    notifyRemoteSyncSuccess('/repo', 'source', 'fetch', changed);
    expect(queryClient.getQueryState(history)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(status)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(release)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(workingTree)?.isInvalidated).toBe(false);
  });
  it('always invalidates working tree resources after a pull, even when ref changes are reported as false', () => {
    notifyRemoteSyncSuccess('/repo', 'source', 'pull', false);
    expect(queryClient.getQueryState(history)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(workingTree)?.isInvalidated).toBe(true);
  });
});
