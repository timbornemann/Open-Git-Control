// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { queryClient } from '@/data/queryClient';
import { repositoryActivityKey } from '@/data/repositoryActivityCache';
import { resourceKey } from '@/data/clientCache';
import type { WorkingTreeChange } from '@/shared/ipc/workingTreeWatch';
import { useWorkingTreeSnapshot, type WorkingTreeState } from '../useWorkingTreeSnapshot';

const api = vi.hoisted(() => ({
  git: { watchWorkingTree: vi.fn(), onWorkingTreeChanged: vi.fn() },
  app: { cancelReadRequest: vi.fn() },
}));
const repo = 'C:/demand-repo';
const snapshot = (id = 'a') => ({
  success: true as const,
  data: { repoPath: repo, snapshotId: id, statusRaw: ' M file.txt', changeCount: 1, largeMode: false, durationMs: 1, isBare: false },
});
const stats = (snapshotId: string) => ({
  success: true as const,
  data: { snapshotId, staged: { files: 0, additions: 0, deletions: 0 }, unstaged: { files: 1, additions: 2, deletions: 0 } },
});
let root: Root;
let host: HTMLDivElement;
let detailed: boolean;
let trigger: number;
let current: WorkingTreeState;
let changed: (event: WorkingTreeChange) => void;
let visibility: DocumentVisibilityState;
const unsubscribed = vi.fn();
function Harness() {
  current = useWorkingTreeSnapshot(repo, trigger, detailed);
  return null;
}
const render = () => act(async () => root.render(createElement(Harness)));
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const visible = (value: DocumentVisibilityState) =>
  act(() => {
    visibility = value;
    document.dispatchEvent(new Event('visibilitychange'));
  });

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  queryClient.clear();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: api });
  detailed = true;
  trigger = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  api.git.watchWorkingTree.mockResolvedValue({ success: true, data: { recursive: true } });
  api.git.onWorkingTreeChanged.mockImplementation((callback) => {
    changed = callback;
    return unsubscribed;
  });
  api.app.cancelReadRequest.mockResolvedValue(undefined);
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'getWorkingTreeSnapshot').mockImplementation(async () => snapshot());
  vi.spyOn(gitClient, 'getWorkingTreeStats').mockImplementation(async (id) => stats(id));
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: ' M file.txt' });
  vi.spyOn(gitClient, 'getRepositoryChangeSummary').mockImplementation(async () => ({
    success: true,
    data: { repoPath: repo, changeCount: 1, checkedAt: Date.now() },
  }));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  queryClient.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  delete (window as { electronAPI?: unknown }).electronAPI;
  vi.useRealTimers();
});

describe('working tree refresh demand', () => {
  it('removes detailed cache observation on other pages so unrelated invalidations cannot refresh full snapshots', async () => {
    await render();
    const query = queryClient.getQueryCache().find({ queryKey: resourceKey('git', 'getWorkingTreeSnapshot', [repo]), exact: true })!;
    expect(query.getObserversCount()).toBe(1);
    detailed = false;
    await render();
    expect(query.getObserversCount()).toBe(0);
    detailed = true;
    await render();
    expect(query.getObserversCount()).toBe(1);
  });

  it('uses only a lightweight count on other pages, backs off, and loads details immediately when needed', async () => {
    detailed = false;
    await render();
    expect(current.loading).toBe(false);
    expect(gitClient.getRepositoryChangeSummary).toHaveBeenCalledTimes(1);
    await advance(29999);
    expect(gitClient.getRepositoryChangeSummary).toHaveBeenCalledTimes(1);
    await advance(1);
    await advance(59999);
    expect(gitClient.getRepositoryChangeSummary).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(gitClient.getRepositoryChangeSummary).toHaveBeenCalledTimes(3);
    expect(gitClient.getWorkingTreeSnapshot).not.toHaveBeenCalled();
    expect(gitClient.runGitCommandForRepo).not.toHaveBeenCalled();
    expect(gitClient.getWorkingTreeStats).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(repositoryActivityKey(repo))).toMatchObject({ data: { changeCount: 1 } });
    detailed = true;
    await render();
    expect(gitClient.getWorkingTreeSnapshot).toHaveBeenCalledTimes(1);
    await advance(300);
    expect(current.stats).toMatchObject({ snapshotId: 'a' });
  });

  it('loads once at mount, preserves unchanged identities and coalesces repository-filtered file events', async () => {
    await render();
    const previousSnapshot = current.snapshot,
      previousStatus = current.status;
    expect(gitClient.getWorkingTreeSnapshot).toHaveBeenCalledTimes(1);
    await advance(1000);
    act(() => changed({ repoPath: 'C:/other' }));
    await advance(300);
    expect(gitClient.getWorkingTreeSnapshot).toHaveBeenCalledTimes(1);
    act(() => {
      for (let i = 0; i < 20; i++) changed({ repoPath: repo });
    });
    await advance(199);
    expect(gitClient.getWorkingTreeSnapshot).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(gitClient.getWorkingTreeSnapshot).toHaveBeenCalledTimes(2);
    expect(current.snapshot).toBe(previousSnapshot);
    expect(current.status).toBe(previousStatus);
    expect(gitClient.getWorkingTreeStats).toHaveBeenCalledTimes(1);
    await advance(10000);
    expect(gitClient.getWorkingTreeSnapshot).toHaveBeenCalledTimes(3);
  });

  it('cancels in-flight counts on leaving details and ignores their late replies', async () => {
    let finish!: (value: ReturnType<typeof stats>) => void;
    vi.mocked(gitClient.getWorkingTreeStats).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    await advance(300);
    const request = vi.mocked(gitClient.getWorkingTreeStats).mock.calls[0][2]!;
    expect(request).toMatchObject({ priority: 'speculative' });
    detailed = false;
    await render();
    expect(api.app.cancelReadRequest).toHaveBeenCalledExactlyOnceWith(request.requestId);
    await act(async () => finish(stats('a')));
    expect(current.stats).toBeNull();
    expect(gitClient.getWorkingTreeSnapshot).toHaveBeenCalledTimes(1);
    detailed = true;
    await render();
    await advance(300);
    expect(current.stats).toMatchObject({ snapshotId: 'a' });
  });

  it('does no reads or counts while hidden, releases its watch and resumes promptly when visible', async () => {
    await render();
    visible('hidden');
    act(() => changed({ repoPath: repo }));
    trigger++;
    await render();
    await advance(120000);
    expect(gitClient.getWorkingTreeSnapshot).toHaveBeenCalledTimes(1);
    expect(gitClient.getWorkingTreeStats).not.toHaveBeenCalled();
    expect(api.git.watchWorkingTree).toHaveBeenLastCalledWith(expect.objectContaining({ repoPath: repo, enabled: false }));
    visible('visible');
    await advance(0);
    await advance(300);
    expect(gitClient.getWorkingTreeSnapshot).toHaveBeenCalledTimes(2);
    expect(gitClient.getWorkingTreeStats).toHaveBeenCalledTimes(1);
    expect(api.git.watchWorkingTree).toHaveBeenLastCalledWith(expect.objectContaining({ repoPath: repo, enabled: true }));
  });

  it('falls back to bounded short polling after an uncertain watch event', async () => {
    await render();
    await advance(5000 + 10000 + 20000);
    expect(gitClient.getWorkingTreeSnapshot).toHaveBeenCalledTimes(4);
    act(() => changed({ repoPath: repo, rescan: true }));
    await advance(500);
    await advance(10000);
    await advance(15000);
    expect(gitClient.getWorkingTreeSnapshot).toHaveBeenCalledTimes(7);
  });

  it('retains the last activity count on a lightweight read failure and recovers without detailed reads', async () => {
    detailed = false;
    await render();
    vi.mocked(gitClient.getRepositoryChangeSummary).mockRejectedValueOnce(new Error('temporary failure'));
    await act(async () => current.refresh());
    expect(queryClient.getQueryState(repositoryActivityKey(repo))?.status).toBe('error');
    expect(queryClient.getQueryData(repositoryActivityKey(repo))).toMatchObject({ data: { changeCount: 1 } });
    await act(async () => current.refresh());
    expect(queryClient.getQueryState(repositoryActivityKey(repo))?.status).toBe('success');
    expect(gitClient.getWorkingTreeSnapshot).not.toHaveBeenCalled();
  });
});
