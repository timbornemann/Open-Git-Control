import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkingTreeSnapshotDto } from '@/types/gitDtos';
import { gitClient } from '@/services/gitClient';
import { useWorkingTreeSnapshot, type WorkingTreeState } from '../useWorkingTreeSnapshot';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const snapshot = (repoPath: string, snapshotId: string, statusRaw: string): WorkingTreeSnapshotDto => ({
  repoPath,
  snapshotId,
  statusRaw,
  changeCount: statusRaw ? 1 : 0,
  durationMs: 1,
  largeMode: false,
  isBare: false,
});

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useWorkingTreeSnapshot', () => {
  it('stops reporting loading immediately when the repository is cleared', async () => {
    const repoA = 'C:\\repos\\a';
    const resultA = deferred<{ success: true; data: WorkingTreeSnapshotDto }>();
    vi.spyOn(gitClient, 'getWorkingTreeSnapshot').mockReturnValue(resultA.promise);
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: '' });
    vi.spyOn(gitClient, 'getWorkingTreeStats').mockResolvedValue({
      success: true,
      data: { snapshotId: 'a', staged: { additions: 0, deletions: 0 }, unstaged: { additions: 0, deletions: 0 } },
    });

    let repoPath: string | null = repoA;
    let current: WorkingTreeState | null = null;
    const root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      current = useWorkingTreeSnapshot(repoPath);
      return null;
    };
    const render = () => root.render(createElement(Harness));

    act(render);
    await vi.waitFor(() => expect(current!.loading).toBe(true));

    repoPath = null;
    act(render);
    expect(current!.loading).toBe(false);
    expect(current!.dataRepoPath).toBeNull();
    expect(current!.snapshot).toBeNull();

    await act(async () => {
      resultA.resolve({ success: true, data: snapshot(repoA, 'a', ' M stale.ts\n') });
      await resultA.promise;
    });
    expect(current!.loading).toBe(false);
    expect(current!.dataRepoPath).toBeNull();
    act(() => root.unmount());
  });

  it('never exposes a previous repository snapshot while the next repository is loading', async () => {
    const repoA = 'C:\\repos\\a';
    const repoB = 'C:\\repos\\b';
    const resultA = deferred<{ success: true; data: WorkingTreeSnapshotDto }>();
    const resultB = deferred<{ success: true; data: WorkingTreeSnapshotDto }>();
    const quickA = deferred<{ success: true; data: string }>();
    vi.spyOn(gitClient, 'getWorkingTreeSnapshot')
      .mockImplementationOnce(() => resultA.promise)
      .mockImplementationOnce(() => resultB.promise);
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockImplementation((repoPath) =>
      repoPath === repoA ? quickA.promise : Promise.resolve({ success: true, data: ' M src/new-repo.ts\n' }),
    );
    vi.spyOn(gitClient, 'getWorkingTreeStats').mockResolvedValue({
      success: true,
      data: { snapshotId: 'b', staged: { additions: 0, deletions: 0 }, unstaged: { additions: 1, deletions: 0 } },
    } as any);

    let repoPath = repoA;
    let current: WorkingTreeState | null = null;
    const container = document.getElementById('root')!;
    const root: Root = createRoot(container);
    const HookHarness = () => {
      current = useWorkingTreeSnapshot(repoPath);
      return null;
    };
    const render = () => root.render(createElement(HookHarness));

    act(render);
    expect(gitClient.getWorkingTreeSnapshot).toHaveBeenCalledTimes(1);

    repoPath = repoB;
    act(render);
    expect(current?.dataRepoPath).not.toBe(repoA);
    expect(current?.snapshot).toBeNull();
    expect(current?.status?.unstaged.map((entry) => entry.path) ?? []).not.toContain('src/old-repo.ts');
    expect(current?.stats).toBeNull();

    await act(async () => {
      await Promise.resolve();
    });
    expect(current?.dataRepoPath).toBe(repoB);
    expect(current?.snapshot).toBeNull();
    expect(current?.status?.unstaged.map((entry) => entry.path)).toEqual(['src/new-repo.ts']);

    await act(async () => {
      resultB.resolve({ success: true, data: snapshot(repoB, 'b', ' M src/new-repo.ts\n') });
      await resultB.promise;
    });

    expect(current?.dataRepoPath).toBe(repoB);
    expect(current?.status?.unstaged.map((entry) => entry.path)).toEqual(['src/new-repo.ts']);

    await act(async () => {
      resultA.resolve({ success: true, data: snapshot(repoA, 'a', ' M src/old-repo.ts\n') });
      quickA.resolve({ success: true, data: ' M src/old-repo.ts\n' });
      await resultA.promise;
      await quickA.promise;
    });

    expect(current?.dataRepoPath).toBe(repoB);
    expect(current?.status?.unstaged.map((entry) => entry.path)).toEqual(['src/new-repo.ts']);
    act(() => root.unmount());
  });

  it('runs one queued refresh after an in-flight snapshot completes', async () => {
    const repoPath = 'C:\\repos\\a';
    const first = deferred<{ success: true; data: WorkingTreeSnapshotDto }>();
    const second = deferred<{ success: true; data: WorkingTreeSnapshotDto }>();
    vi.spyOn(gitClient, 'getWorkingTreeSnapshot').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: '' });
    vi.spyOn(gitClient, 'getWorkingTreeStats').mockImplementation(async (snapshotId) => ({
      success: true,
      data: { snapshotId, staged: { additions: 0, deletions: 0 }, unstaged: { additions: 0, deletions: 0 } },
    }));

    let current: WorkingTreeState | null = null;
    const root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      current = useWorkingTreeSnapshot(repoPath);
      return null;
    };
    act(() => root.render(createElement(Harness)));
    let queued!: Promise<void>;
    act(() => {
      queued = current!.refresh();
    });

    await act(async () => {
      first.resolve({ success: true, data: snapshot(repoPath, 'old', ' M old.ts\n') });
      await first.promise;
    });
    await vi.waitFor(() => expect(gitClient.getWorkingTreeSnapshot).toHaveBeenCalledTimes(2));
    await act(async () => {
      second.resolve({ success: true, data: snapshot(repoPath, 'new', ' M new.ts\n') });
      await queued;
    });

    expect(current!.snapshot?.snapshotId).toBe('new');
    act(() => root.unmount());
  });

  it('still runs the queued refresh when the in-flight snapshot rejects', async () => {
    const repoPath = 'C:\\repos\\a';
    const first = deferred<{ success: true; data: WorkingTreeSnapshotDto }>();
    const second = deferred<{ success: true; data: WorkingTreeSnapshotDto }>();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(gitClient, 'getWorkingTreeSnapshot').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: '' });
    vi.spyOn(gitClient, 'getWorkingTreeStats').mockResolvedValue({
      success: true,
      data: { snapshotId: 'new', staged: { additions: 0, deletions: 0 }, unstaged: { additions: 0, deletions: 0 } },
    });

    let current: WorkingTreeState | null = null;
    const root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      current = useWorkingTreeSnapshot(repoPath);
      return null;
    };
    act(() => root.render(createElement(Harness)));
    let queued!: Promise<void>;
    act(() => {
      queued = current!.refresh();
    });
    await act(async () => {
      first.reject(new Error('stale snapshot failed'));
      await first.promise.catch(() => undefined);
    });
    await vi.waitFor(() => expect(gitClient.getWorkingTreeSnapshot).toHaveBeenCalledTimes(2));
    await act(async () => {
      second.resolve({ success: true, data: snapshot(repoPath, 'new', ' M new.ts\n') });
      await queued;
    });

    expect(current!.snapshot?.snapshotId).toBe('new');
    act(() => root.unmount());
  });
});
