// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { queryClient } from '@/data/queryClient';
import { resourceKey } from '@/data/clientCache';
import { useWorkingTreeSnapshot, type WorkingTreeState } from '../useWorkingTreeSnapshot';

const deferred = <T>() => {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
let root: Root, current: WorkingTreeState, repo: string | null, raw: string, id: string;
const status = (path = repo!, text = raw) => ({
  success: true as const,
  data: { repoPath: path, statusRaw: text, changeCount: text ? 1 : 0, checkedAt: Date.now() },
});
const snapshot = (snapshotId = id, path = repo!, text = raw) => ({
  success: true as const,
  data: {
    repoPath: path,
    statusRaw: text,
    changeCount: text ? 1 : 0,
    snapshotId,
    largeMode: false,
    durationMs: 1,
    isBare: false,
  },
});
const stats = (snapshotId: string) => ({
  success: true as const,
  data: { snapshotId, staged: { files: 1, additions: 2, deletions: 0 }, unstaged: { files: 0, additions: 0, deletions: 0 } },
});
function Harness() {
  current = useWorkingTreeSnapshot(repo);
  return null;
}
const render = () => act(async () => root.render(createElement(Harness)));
const advance = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  repo = 'c:/repos/a';
  raw = ' M file.txt';
  id = 'first';
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root')!);
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'getWorkingTreeStatus').mockImplementation(async () => status());
  vi.spyOn(gitClient, 'getWorkingTreeSnapshot').mockImplementation(async () => snapshot());
  vi.spyOn(gitClient, 'getWorkingTreeStats').mockImplementation(async (snapshotId) => stats(snapshotId));
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (window as { electronAPI?: unknown }).electronAPI;
});

describe('status-first working tree refresh', () => {
  it('retries preempted background details without redoing a confirmed snapshot for cancelled counts', async () => {
    vi.mocked(gitClient.getWorkingTreeSnapshot).mockResolvedValueOnce({ success: false, error: 'Git operation was aborted.' });
    vi.mocked(gitClient.getWorkingTreeStats).mockResolvedValueOnce({ success: false, error: 'Git operation was aborted.' });
    await render();
    await advance();
    expect(current.loading).toBe(false);
    expect(current.status?.unstaged).toHaveLength(1);
    await advance();
    expect(current.snapshot?.snapshotId).toBe('first');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(current.stats?.snapshotId).toBe('first');
    expect(gitClient.getWorkingTreeSnapshot).toHaveBeenCalledTimes(2);
    expect(gitClient.getWorkingTreeStats).toHaveBeenCalledTimes(2);
  });

  it('finishes refresh before a slow full snapshot and ignores its superseded reply', async () => {
    const slow = deferred<ReturnType<typeof snapshot>>();
    vi.mocked(gitClient.getWorkingTreeSnapshot).mockReturnValueOnce(slow.promise);
    await render();
    expect(current.loading).toBe(false);
    expect(current.status?.unstaged[0].path).toBe('file.txt');
    expect(current.snapshot).toBeNull();
    expect(gitClient.getWorkingTreeSnapshot).not.toHaveBeenCalled();
    await advance();
    const old = snapshot();
    raw = 'M  file.txt';
    id = 'staged';
    await act(async () => current.refresh());
    expect(current.status?.staged[0].path).toBe('file.txt');
    expect(current.status?.unstaged).toEqual([]);
    await act(async () => slow.resolve(old));
    expect(current.status?.staged).toHaveLength(1);
    expect(current.snapshot).toBeNull();
    await advance();
    expect(current.snapshot?.snapshotId).toBe('staged');
  });

  it('discards cancelled line counts and keeps fresh staging usable while they finish', async () => {
    const slow = deferred<ReturnType<typeof stats>>();
    vi.mocked(gitClient.getWorkingTreeStats).mockReturnValueOnce(slow.promise);
    await render();
    await advance();
    expect(current.snapshot?.snapshotId).toBe('first');
    raw = 'M  file.txt';
    id = 'next';
    await act(async () => current.refresh());
    expect(current.status?.staged).toHaveLength(1);
    expect(current.stats).toBeNull();
    await act(async () => slow.resolve(stats('first')));
    expect(current.stats).toBeNull();
    await advance();
    expect(current.stats?.snapshotId).toBe('next');
  });

  it('preserves list identity on unchanged polls while detecting changed content revisions', async () => {
    await render();
    await advance();
    const first = current.status;
    const key = resourceKey('git', 'getDiffPreview', [['diff', '--', 'file.txt'], {}, repo]);
    queryClient.setQueryData(key, { success: true, data: {} });
    await act(async () => current.refresh());
    await advance();
    expect(current.status).toBe(first);
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
    id = 'edited-with-same-status';
    await act(async () => current.refresh());
    await advance();
    expect(current.status).toBe(first);
    expect(current.snapshot?.snapshotId).toBe(id);
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it('clears loading and data when the repository is cleared during a read', async () => {
    const slow = deferred<ReturnType<typeof status>>();
    vi.mocked(gitClient.getWorkingTreeStatus).mockReturnValueOnce(slow.promise);
    await render();
    expect(current.loading).toBe(true);
    const old = status();
    repo = null;
    await render();
    expect(current.loading).toBe(false);
    await act(async () => slow.resolve(old));
    expect(current.dataRepoPath).toBeNull();
    expect(current.status).toBeNull();
    expect(current.snapshot).toBeNull();
  });

  it('never publishes an old A reply after switching A to B to A', async () => {
    const slow = deferred<ReturnType<typeof status>>();
    vi.mocked(gitClient.getWorkingTreeStatus).mockReturnValueOnce(slow.promise);
    await render();
    const old = status(repo!, ' M old.txt');
    repo = 'c:/repos/b';
    raw = ' M b.txt';
    await render();
    expect(current.dataRepoPath).toBe(repo);
    repo = 'c:/repos/a';
    raw = ' M current.txt';
    await render();
    await act(async () => slow.resolve(old));
    expect(current.status?.unstaged[0].path).toBe('current.txt');
  });

  it.each([false, true])('drains one queued fresh status even if its preceding read fails (%s)', async (fail) => {
    const first = deferred<ReturnType<typeof status>>(),
      second = deferred<ReturnType<typeof status>>();
    vi.mocked(gitClient.getWorkingTreeStatus).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await render();
    let queued!: Promise<void>;
    act(() => {
      queued = current.refresh();
    });
    await act(async () => {
      if (fail) first.reject(new Error('old read failed'));
      else first.resolve(status(repo!, ' M old.txt'));
    });
    expect(gitClient.getWorkingTreeStatus).toHaveBeenCalledTimes(2);
    await act(async () => {
      second.resolve(status(repo!, 'M  current.txt'));
      await queued;
    });
    expect(current.status?.staged[0].path).toBe('current.txt');
    expect(gitClient.getWorkingTreeSnapshot).not.toHaveBeenCalled();
  });

  it('does not expose a cached old list as mutation-ready after a status failure', async () => {
    queryClient.setQueryData(resourceKey('git', 'getWorkingTreeSnapshot', [repo]), snapshot());
    await render();
    vi.mocked(gitClient.getWorkingTreeStatus).mockResolvedValueOnce({ success: false, error: 'status unavailable' });
    await act(async () => {
      await expect(current.refresh()).rejects.toThrow('status unavailable');
    });
    expect(current.dataRepoPath).toBeNull();
    expect(current.status).toBeNull();
    await act(async () => current.refresh());
    expect(current.dataRepoPath).toBe(repo);
  });
});
