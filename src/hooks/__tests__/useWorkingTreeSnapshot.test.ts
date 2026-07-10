import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkingTreeSnapshotDto } from '@/types/gitDtos';
import { gitClient } from '@/services/gitClient';
import { useWorkingTreeSnapshot, type WorkingTreeState } from '../useWorkingTreeSnapshot';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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
  it('never exposes a previous repository snapshot while the next repository is loading', async () => {
    const repoA = 'C:\\repos\\a';
    const repoB = 'C:\\repos\\b';
    const resultA = deferred<{ success: true; data: WorkingTreeSnapshotDto }>();
    const resultB = deferred<{ success: true; data: WorkingTreeSnapshotDto }>();
    const quickA = deferred<{ success: true; data: string }>();
    vi.spyOn(gitClient, 'getWorkingTreeSnapshot')
      .mockImplementationOnce(() => resultA.promise)
      .mockImplementationOnce(() => resultB.promise);
    vi.spyOn(gitClient, 'getStatusPorcelain')
      .mockImplementationOnce(() => quickA.promise)
      .mockResolvedValueOnce({ success: true, data: ' M src/new-repo.ts\n' });
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
});
