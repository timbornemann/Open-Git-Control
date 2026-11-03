import { QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { cachedClient, invalidateResources, resourceKey, withReadPriority } from '../clientCache';
import { backgroundQueue } from '../backgroundQueue';
import { cancellableRead } from '../ipcRead';
import { queryClient } from '../queryClient';

describe('working tree read ownership', () => {
  it.each(['getWorkingTreeStatus', 'getWorkingTreeSnapshot', 'getWorkingTreeStats', 'getGitLfsStatus'])(
    'does not start an abandoned %s owner read that was still queued behind preloading',
    async (operation) => {
      const cancelReadRequest = vi.fn(async () => {});
      vi.stubGlobal('window', { electronAPI: { app: { cancelReadRequest } } });
      const read = vi.fn(async (..._args: unknown[]) => ({ success: true, data: {} }));
      const client = cachedClient('git', { [operation]: read });
      const args =
        operation === 'getGitLfsStatus' ? [{ repoPath: 'c:/repo', files: [] }] : operation === 'getWorkingTreeStats' ? ['snapshot', 'c:/repo'] : ['c:/repo'];
      const controller = new AbortController();
      backgroundQueue.setPaused(true);
      try {
        const pending = cancellableRead(controller.signal, 'speculative', (request) =>
          withReadPriority(() => client[operation](...args, request), 'speculative'),
        );
        const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        await Promise.resolve();
        controller.abort();
        await cancelled;
        backgroundQueue.setPaused(false);
        expect(read).not.toHaveBeenCalled();
        expect(cancelReadRequest).toHaveBeenCalledOnce();
      } finally {
        backgroundQueue.setPaused(false);
        vi.unstubAllGlobals();
      }
    },
  );

  it.each(['getWorkingTreeSnapshot', 'getWorkingTreeStats', 'getGitLfsStatus'] as const)(
    'leaves %s refreshes to their owner after invalidation',
    async (operation) => {
      const repo = 'c:/repo';
      const args = operation === 'getGitLfsStatus' ? [{ repoPath: repo, files: [] }] : operation === 'getWorkingTreeStats' ? ['snapshot', repo] : [repo];
      const read = vi.fn(async (..._args: unknown[]) => ({ success: true, data: {} }));
      const client = cachedClient('git', { [operation]: read });
      await client[operation](...args);
      const key = resourceKey('git', operation, args);
      const observer = new QueryObserver(queryClient, { queryKey: key, enabled: false });
      const unsubscribe = observer.subscribe(() => {});
      try {
        invalidateResources('git', repo, [operation]);
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
        expect(read).toHaveBeenCalledOnce();
        expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
        await client[operation](...args);
        expect(read).toHaveBeenCalledTimes(2);
      } finally {
        unsubscribe();
      }
    },
  );

  it('excludes cancellation IDs from all owned cache keys', () => {
    const first = { requestId: 'first', priority: 'speculative' },
      second = { requestId: 'second', priority: 'visible' };
    for (const operation of ['getWorkingTreeStatus', 'getWorkingTreeSnapshot', 'getGitLfsStatus', 'getWorkingTreeStats']) {
      const args =
        operation === 'getGitLfsStatus' ? [{ repoPath: 'c:/repo', files: [] }] : operation === 'getWorkingTreeStats' ? ['snapshot', 'c:/repo'] : ['c:/repo'];
      expect(resourceKey('git', operation, [...args, first])).toEqual(resourceKey('git', operation, [...args, second]));
    }
  });
});
