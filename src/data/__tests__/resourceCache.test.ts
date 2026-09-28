import { describe, it, expect, vi } from 'vitest';
import { QueryObserver } from '@tanstack/react-query';
import { BackgroundQueue } from '../backgroundQueue';
import { enforceMemoryBudget, hydratePreviews, queryClient, readResource, refreshVisibleResources, updateResource } from '../queryClient';
import { cachedClient, freshRead, getActiveResourceRepository, resourceKey, setActiveResourceRepository, setGithubResourceScope } from '../clientCache';
import type { PreviewSnapshot, ResourceKey } from '@/shared/cache/resource';

const key: ResourceKey = ['resource', 'planner', 'application', 'getData'];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const tick = () =>
  new Promise<void>((resolve) => {
    queueMicrotask(resolve);
  });

describe('shared resource cache', () => {
  it('deduplicates a preload and a view request, including a successfully empty list', async () => {
    const pending = deferred<string[]>();
    const read = vi.fn(() => pending.promise);
    const first = readResource(key, read, { priority: 'startup' });
    const second = readResource(key, read);
    await tick();
    expect(read).toHaveBeenCalledOnce();
    pending.resolve([]);
    expect(await first).toEqual([]);
    expect(await second).toEqual([]);
    expect(await readResource(key, read)).toEqual([]);
    expect(read).toHaveBeenCalledOnce();
  });

  it('does not allow a late read to roll back a confirmed write', async () => {
    const pending = deferred<string[]>();
    const first = readResource(key, () => pending.promise);
    const settled = first.catch(() => undefined);
    await tick();
    updateResource(key, ['confirmed']);
    pending.resolve(['old']);
    await settled;
    expect(queryClient.getQueryData(key)).toEqual(['confirmed']);
  });

  it('rejects late disk hydration and marks incomplete previews stale', async () => {
    const snapshot: PreviewSnapshot = { version: 1, key, data: ['disk'], savedAt: Date.now() - 10_000, sourceRevision: 'old', complete: true };
    updateResource(key, ['new']);
    hydratePreviews([snapshot], Date.now() - 100);
    expect(queryClient.getQueryData(key)).toEqual(['new']);
    queryClient.clear();
    hydratePreviews([{ ...snapshot, complete: false }], Date.now());
    expect(queryClient.getQueryState(key)?.dataUpdatedAt).toBe(1);
    const read = vi.fn(async () => ['complete']);
    await readResource(key, read);
    expect(read).toHaveBeenCalledOnce();
  });

  it('keeps a cached snapshot while a refresh fails', async () => {
    updateResource(key, ['cached']);
    const failed = await readResource(key, async () => ({ success: false as const, error: 'offline' }), { force: true });
    expect(failed.success).toBe(false);
    expect(queryClient.getQueryData(key)).toEqual(['cached']);
  });

  it('retries failed visible resources on reconnect even with a recent preview', async () => {
    updateResource(key, { success: true, data: ['cached'] });
    const read = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'offline' })
      .mockResolvedValueOnce({ success: true, data: ['fresh'] });
    await readResource(key, read, { force: true });
    const observer = new QueryObserver(queryClient, { queryKey: key, enabled: false });
    const unsubscribe = observer.subscribe(() => {});
    refreshVisibleResources();
    await vi.waitFor(() => expect(queryClient.getQueryData(key)).toEqual({ success: true, data: ['fresh'] }));
    expect(read).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('leaves invalidated observed resources queued while the window is hidden', async () => {
    const read = vi.fn(async () => ['data']);
    await readResource(key, read);
    const observer = new QueryObserver(queryClient, { queryKey: key, enabled: false });
    const unsubscribe = observer.subscribe(() => {});
    await queryClient.invalidateQueries({ queryKey: key, refetchType: 'none' });
    vi.stubGlobal('document', { visibilityState: 'hidden' });
    try {
      refreshVisibleResources();
      await tick();
      expect(read).toHaveBeenCalledTimes(1);
      vi.stubGlobal('document', { visibilityState: 'visible' });
      refreshVisibleResources();
      await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    } finally {
      unsubscribe();
      vi.unstubAllGlobals();
    }
  });

  it('shows a disk preview while the first live request is still pending', async () => {
    const pending = deferred<string[]>();
    const startedAt = Date.now();
    const read = readResource(key, () => pending.promise);
    await tick();
    hydratePreviews([{ version: 1, key, data: ['disk'], savedAt: startedAt - 1000, sourceRevision: 'disk', complete: true }], startedAt);
    expect(queryClient.getQueryData(key)).toEqual(['disk']);
    pending.resolve(['live']);
    await read;
    expect(queryClient.getQueryData(key)).toEqual(['live']);
  });

  it('ignores out-of-order repository selection replies without damaging settings', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const settingsKey = resourceKey('app', 'getSettings');
    updateResource(settingsKey, { theme: 'copper-night' });
    const client = cachedClient('app', { setRepoPath: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise) });
    const a = client.setRepoPath('/repo-a');
    const b = client.setRepoPath('/repo-b');
    second.resolve('/repo-b');
    await b;
    first.resolve('/repo-a');
    await a;
    expect(getActiveResourceRepository()).toBe('/repo-b');
    expect(queryClient.getQueryData(settingsKey)).toEqual({ theme: 'copper-night' });
  });

  it('reads the live working tree for write guards even when the overview is fresh', async () => {
    const read = vi.fn().mockResolvedValueOnce({ success: true, data: 'clean' }).mockResolvedValueOnce({ success: true, data: 'modified' });
    const client = cachedClient('git', { runGitCommandForRepo: read });
    await client.runGitCommandForRepo('/repo', 'statusPorcelain');
    expect((await client.runGitCommandForRepo('/repo', 'statusPorcelain')).data).toBe('clean');
    expect((await freshRead(() => client.runGitCommandForRepo('/repo', 'statusPorcelain'))).data).toBe('modified');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('invalidates staging data without discarding branches, history, or other repositories', async () => {
    setActiveResourceRepository('/repo-a');
    const status = resourceKey('git', 'getWorkingTreeSnapshot', ['/repo-a']);
    const branches = resourceKey('git', 'runGitCommandForRepo', ['/repo-a', 'branch', '-a']);
    const commits = resourceKey('git', 'getCommitLogPage', [{ repoPath: '/repo-a' }]);
    const other = resourceKey('git', 'getWorkingTreeSnapshot', ['/repo-b']);
    for (const entry of [status, branches, commits, other]) updateResource(entry, { success: true, data: [] });
    const client = cachedClient('git', { stagePaths: async (_paths: string[], _repo: string) => ({ success: true }) });
    await client.stagePaths(['file'], '/repo-a');
    expect(queryClient.getQueryState(status)?.isInvalidated).toBe(true);
    for (const entry of [branches, commits, other]) expect(queryClient.getQueryState(entry)?.isInvalidated).toBe(false);
  });

  it('invalidates only the affected remote repository after merging a PR', async () => {
    setGithubResourceScope('github.com', 'alice');
    const prs = resourceKey('github', 'getPullRequests', ['org', 'repo', 'open']);
    const other = resourceKey('github', 'getPullRequests', ['org', 'another', 'open']);
    const catalog = resourceKey('github', 'catalog');
    for (const entry of [prs, other, catalog]) updateResource(entry, []);
    const client = cachedClient('github', { mergePullRequest: async (_input: { owner: string; repo: string }) => ({ success: true }) });
    await client.mergePullRequest({ owner: 'org', repo: 'repo' });
    expect(queryClient.getQueryState(prs)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(other)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(catalog)?.isInvalidated).toBe(false);
  });

  it('evicts unused data under the memory budget while protecting mounted data', () => {
    updateResource(key, 'a'.repeat(100));
    const observer = new QueryObserver(queryClient, { queryKey: key, enabled: false });
    const unsubscribe = observer.subscribe(() => {});
    const unused: ResourceKey = ['resource', 'git', '/repo', 'file'];
    updateResource(unused, 'b'.repeat(100));
    enforceMemoryBudget(120);
    expect(queryClient.getQueryData(key)).toBeDefined();
    expect(queryClient.getQueryData(unused)).toBeUndefined();
    unsubscribe();
  });

  it('scopes data by canonical repo, account, host and immutable SHA', () => {
    expect(resourceKey('git', 'getFileHistory', ['a', '1234', 80, 'C:\\Code\\Repo\\'])).toEqual(
      resourceKey('git', 'getFileHistory', ['a', '1234', 80, 'c:/code/repo']),
    );
    expect(resourceKey('git', 'getFileHistory', ['a', '1234', 80, '/Repo'])).not.toEqual(resourceKey('git', 'getFileHistory', ['a', '1234', 80, '/repo']));
    setGithubResourceScope('github.com', 'alice');
    const alice = resourceKey('github', 'getBranches', ['org', 'repo']);
    setGithubResourceScope('enterprise.example', 'bob');
    expect(resourceKey('github', 'getBranches', ['org', 'repo'])).not.toEqual(alice);
  });

  it('applies confirmed planner changes without waiting for another file read', async () => {
    const item = { id: 'i', projectId: 'p', title: 'new' };
    const client = cachedClient('planner', {
      getData: async () => ({ success: true, data: { version: 1, projects: [], items: [] } }),
      createItem: async () => ({ success: true, data: item }),
    });
    await client.getData();
    await client.createItem();
    expect(queryClient.getQueryData<{ data: { items: unknown[] } }>(key)?.data.items).toEqual([item]);
  });

  it('cancels reads for a previous repository without activating another repo', async () => {
    setActiveResourceRepository('/repo-a');
    const pending = deferred<string>();
    const firstKey = resourceKey('git', 'getWorkingTreeSnapshot');
    const read = readResource(firstKey, () => pending.promise).catch(() => undefined);
    await tick();
    setActiveResourceRepository('/repo-b');
    pending.resolve('old');
    await read;
    expect(queryClient.getQueryData(resourceKey('git', 'getWorkingTreeSnapshot'))).toBeUndefined();
    expect(queryClient.getQueryData(firstKey)).toBeUndefined();
  });
});

describe('background scheduling', () => {
  it('keeps cancelled in-flight reads within the capacity until the backend finishes', async () => {
    const queue = new BackgroundQueue();
    const controller = new AbortController();
    const pending = deferred<void>();
    const first = queue.schedule(() => pending.promise, 'startup', true, controller.signal).catch((error: Error) => error.name);
    await tick();
    controller.abort();
    const nextRead = vi.fn(async () => 'next');
    const next = queue.schedule(nextRead, 'startup', true, new AbortController().signal);
    expect(nextRead).not.toHaveBeenCalled();
    pending.resolve();
    expect(await first).toBe('AbortError');
    expect(await next).toBe('next');
  });

  it('honors the GitHub retry time while allowing local work to proceed', async () => {
    vi.useFakeTimers();
    try {
      const queue = new BackgroundQueue();
      queue.deferGithub(Date.now() + 500);
      const github = vi.fn(async () => 'remote');
      const remote = queue.schedule(github, 'visible', true, new AbortController().signal);
      expect(await queue.schedule(async () => 'local', 'startup', false, new AbortController().signal)).toBe('local');
      await vi.advanceTimersByTimeAsync(499);
      expect(github).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(await remote).toBe('remote');
    } finally {
      vi.useRealTimers();
    }
  });
  it('limits background reads to two and GitHub to one, then serves higher priorities first', async () => {
    const queue = new BackgroundQueue();
    const blockers = [deferred<void>(), deferred<void>()];
    const signal = new AbortController().signal;
    const order: string[] = [];
    const first = queue.schedule(() => blockers[0].promise, 'startup', true, signal);
    const second = queue.schedule(() => blockers[1].promise, 'startup', false, signal);
    const low = queue.schedule(
      async () => {
        order.push('low');
      },
      'speculative',
      true,
      signal,
    );
    const high = queue.schedule(
      async () => {
        order.push('high');
      },
      'repository',
      false,
      signal,
    );
    expect(queue.active).toBe(2);
    expect(queue.size).toBe(2);
    blockers[1].resolve();
    await second;
    await tick();
    await high;
    expect(order).toEqual(['high']);
    blockers[0].resolve();
    await Promise.all([first, low]);
    expect(order).toEqual(['high', 'low']);
  });

  it('pauses hidden background work, supports promotion and cancels queued reads', async () => {
    const queue = new BackgroundQueue();
    queue.setPaused(true);
    const controller = new AbortController();
    const read = vi.fn(async () => 'ready');
    const cancelled = queue.schedule(read, 'startup', false, controller.signal).catch((error: Error) => error.name);
    controller.abort();
    expect(await cancelled).toBe('AbortError');
    expect(read).not.toHaveBeenCalled();
    const promoted = queue.schedule(read, 'speculative', false, new AbortController().signal, 'wanted');
    queue.promote('wanted');
    expect(await promoted).toBe('ready');
  });
});
