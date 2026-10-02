// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryObserver } from '@tanstack/react-query';
import { gitClient } from '@/services/gitClient';
import { queryClient, hydratePreviews, refreshVisibleResources } from '../queryClient';
import { backgroundQueue } from '../backgroundQueue';
import { RepositoryActivityCoordinator } from '../repositoryActivityCoordinator';
import { countStatusFiles, publishRepositoryActivity, repositoryActivityKey, type RepositoryActivityResult } from '../repositoryActivityCache';

const summary = (repoPath: string, changeCount = 1): RepositoryActivityResult => ({ success: true, data: { repoPath, changeCount, checkedAt: Date.now() } });
let coordinator: RepositoryActivityCoordinator;
const pending: Array<() => void> = [];
const deferred = () => {
  let resolve!: (value: RepositoryActivityResult) => void;
  const promise = new Promise<RepositoryActivityResult>((done) => {
    resolve = done;
  });
  pending.push(() => resolve({ success: false, error: 'cleanup' }));
  return { promise, resolve };
};
const read = (path: string) => queryClient.getQueryData<RepositoryActivityResult>(repositoryActivityKey(path));
const advance = (ms = 10) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'getRepositoryChangeSummary').mockImplementation(async (path) => summary(path));
  coordinator = new RepositoryActivityCoordinator();
  coordinator.start();
});
afterEach(async () => {
  coordinator.dispose();
  pending.splice(0).forEach((resolve) => resolve());
  await advance();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('repository activity coordinator', () => {
  it('waits for restoration, skips the active repo, and polls inactive repos every 15 seconds', async () => {
    coordinator.setRepositories(['/a', '/b'], '/a', false);
    await advance();
    expect(gitClient.getRepositoryChangeSummary).not.toHaveBeenCalled();
    coordinator.setRepositories(['/a', '/b'], '/a', true);
    await advance();
    expect(gitClient.getRepositoryChangeSummary).toHaveBeenCalledTimes(1);
    expect(read('/b')).toMatchObject({ data: { changeCount: 1 } });
    await advance(14_000);
    expect(gitClient.getRepositoryChangeSummary).toHaveBeenCalledTimes(1);
    await advance(1000);
    expect(gitClient.getRepositoryChangeSummary).toHaveBeenCalledTimes(2);
    expect(gitClient.getRepositoryChangeSummary).not.toHaveBeenCalledWith('/a', expect.anything());
  });

  it('uses one background slot and yields to the shared queue', async () => {
    const first = deferred();
    vi.mocked(gitClient.getRepositoryChangeSummary).mockReturnValueOnce(first.promise);
    backgroundQueue.setPaused(true);
    coordinator.setRepositories(['/b', '/c', '/d'], null, true);
    await advance();
    expect(gitClient.getRepositoryChangeSummary).not.toHaveBeenCalled();
    backgroundQueue.setPaused(false);
    await advance();
    expect(gitClient.getRepositoryChangeSummary).toHaveBeenCalledTimes(1);
    first.resolve(summary('/b'));
    await advance();
    expect(gitClient.getRepositoryChangeSummary).toHaveBeenCalledTimes(3);
  });

  it('prioritizes uninspected repositories, then the oldest completed check', async () => {
    publishRepositoryActivity('/old', 1, Date.now() - 40_000);
    publishRepositoryActivity('/new', 1, Date.now() - 20_000);
    // Publish timestamps also represent the original cache completion time.
    queryClient.setQueryData(repositoryActivityKey('/old'), read('/old'), { updatedAt: Date.now() - 40_000 });
    queryClient.setQueryData(repositoryActivityKey('/new'), read('/new'), { updatedAt: Date.now() - 20_000 });
    coordinator.setRepositories(['/new', '/old', '/unknown'], null, true);
    await advance();
    expect(vi.mocked(gitClient.getRepositoryChangeSummary).mock.calls.map(([path]) => path)).toEqual(['/unknown', '/old', '/new']);
  });

  it('keeps failed data and respects 60-second backoff even when visible readers refresh', async () => {
    publishRepositoryActivity('/b', 8);
    queryClient.setQueryData(repositoryActivityKey('/b'), read('/b'), { updatedAt: 1 });
    vi.mocked(gitClient.getRepositoryChangeSummary).mockResolvedValue({ success: false, error: 'drive unavailable' });
    const observer = new QueryObserver(queryClient, { queryKey: repositoryActivityKey('/b'), enabled: false });
    const unsubscribe = observer.subscribe(() => {});
    coordinator.setRepositories(['/b'], null, true);
    await advance();
    expect(read('/b')).toMatchObject({ data: { changeCount: 8 } });
    expect(queryClient.getQueryState(repositoryActivityKey('/b'))?.status).toBe('error');
    refreshVisibleResources();
    await advance(59_000);
    expect(gitClient.getRepositoryChangeSummary).toHaveBeenCalledTimes(1);
    await advance(1000);
    expect(gitClient.getRepositoryChangeSummary).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('discards a removed repo response and checks newly added repos without selection changes', async () => {
    const slow = deferred();
    vi.mocked(gitClient.getRepositoryChangeSummary).mockReturnValueOnce(slow.promise);
    coordinator.setRepositories(['/b'], '/a', true);
    await advance();
    coordinator.setRepositories(['/c'], '/a', true);
    slow.resolve(summary('/b', 20));
    await advance();
    expect(read('/b')).toBeUndefined();
    expect(read('/c')).toMatchObject({ data: { changeCount: 1 } });
  });

  it('does not roll back newer active-worktree counts with an older background response', async () => {
    const slow = deferred();
    vi.mocked(gitClient.getRepositoryChangeSummary).mockReturnValueOnce(slow.promise);
    coordinator.setRepositories(['/b'], '/a', true);
    await advance();
    coordinator.setRepositories(['/b'], '/b', true);
    publishRepositoryActivity('/b', 0);
    slow.resolve(summary('/b', 20));
    await advance();
    expect(read('/b')).toMatchObject({ data: { changeCount: 0 } });
  });

  it('pauses while hidden and resumes after visibility changes', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');
    coordinator.setRepositories(['/b'], null, true);
    await advance(30_000);
    expect(gitClient.getRepositoryChangeSummary).not.toHaveBeenCalled();
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await advance();
    expect(gitClient.getRepositoryChangeSummary).toHaveBeenCalledTimes(1);
  });

  it('cancels in-flight work on hiding and survives a StrictMode-style restart', async () => {
    const slow = deferred();
    vi.mocked(gitClient.getRepositoryChangeSummary).mockReturnValueOnce(slow.promise);
    coordinator.setRepositories(['/b', '/c'], null, true);
    await advance();
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    slow.resolve(summary('/b', 10));
    await advance();
    expect(read('/b')).toBeUndefined();
    expect(gitClient.getRepositoryChangeSummary).toHaveBeenCalledTimes(1);
    coordinator.dispose();
    coordinator.start();
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await advance();
    expect(read('/b')).toMatchObject({ data: { changeCount: 1 } });
    expect(read('/c')).toMatchObject({ data: { changeCount: 1 } });
  });

  it('ignores mismatched repository data and prevents stale disk restoration', async () => {
    vi.mocked(gitClient.getRepositoryChangeSummary).mockResolvedValue(summary('/other', 99));
    coordinator.setRepositories(['/b'], null, true);
    await advance();
    expect(read('/b')).toBeUndefined();
    publishRepositoryActivity('/b', 3);
    hydratePreviews(
      [{ version: 1, key: repositoryActivityKey('/b'), savedAt: Date.now() - 5000, sourceRevision: 'old', complete: true, data: summary('/b', 99) }],
      Date.now() - 1000,
    );
    expect(read('/b')).toMatchObject({ data: { changeCount: 3 } });
  });

  it('refreshes incomplete persisted summaries immediately', async () => {
    hydratePreviews(
      [{ version: 1, key: repositoryActivityKey('/b'), savedAt: Date.now(), sourceRevision: 'partial', complete: false, data: summary('/b', 8) }],
      Date.now(),
    );
    coordinator.setRepositories(['/b'], null, true);
    await advance();
    expect(read('/b')).toMatchObject({ data: { changeCount: 1 } });
  });

  it('counts fallback status files without counting both staging columns twice', () => {
    expect(countStatusFiles('MM both.ts\nA  added.ts\n D deleted.ts\n?? new.ts\nUU conflict.ts')).toBe(5);
  });
});
