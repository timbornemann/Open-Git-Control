import { describe, expect, it, vi } from 'vitest';
import { invalidateResources } from '../clientCache';
import { gitMutationAffects } from '../mutationEffects';
import { gitHistoryVersion, subscribeGitHistoryRefresh } from '../gitHistoryRefresh';

describe('repository history invalidation versions', () => {
  it('publishes ref changes for the normalized repository, even before a graph has a cache entry', async () => {
    const before = gitHistoryVersion('C:\\Code\\Repo\\');
    const other = gitHistoryVersion('C:/other');
    const receive = vi.fn();
    const unsubscribe = subscribeGitHistoryRefresh(receive);
    try {
      invalidateResources('git', 'c:/code/repo', undefined, (key) => gitMutationAffects('createCommit', [], key));
      expect(gitHistoryVersion('C:\\Code\\Repo\\')).toBe(before + 1);
      expect(gitHistoryVersion('C:/other')).toBe(other);
      await Promise.resolve();
      expect(receive).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
    }
  });

  it('coalesces notifications while advancing every version used to reject stale async work', async () => {
    const before = gitHistoryVersion('/repo');
    const receive = vi.fn();
    const unsubscribe = subscribeGitHistoryRefresh(receive);
    try {
      invalidateResources('git', '/repo', ['getCommitLogPage']);
      invalidateResources('git', '/repo', ['graph']);
      expect(gitHistoryVersion('/repo')).toBe(before + 2);
      expect(receive).not.toHaveBeenCalled();
      await Promise.resolve();
      expect(receive).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
    }
  });

  it('ignores working-tree and other-domain invalidations, and supports invalidating every repository', () => {
    const a = gitHistoryVersion('/a');
    const b = gitHistoryVersion('/b');
    invalidateResources('git', '/a', ['getWorkingTreeSnapshot', 'getFileHistory']);
    invalidateResources('git', '/a', undefined, (key) => gitMutationAffects('stagePaths', [], key));
    invalidateResources('github');
    expect(gitHistoryVersion('/a')).toBe(a);
    expect(gitHistoryVersion('/b')).toBe(b);
    invalidateResources('git');
    expect(gitHistoryVersion('/a')).toBe(a + 1);
    expect(gitHistoryVersion('/b')).toBe(b + 1);
  });
});
