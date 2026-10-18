// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { useFileOperations } from './useFileOperations';

type StatsReply = Awaited<ReturnType<typeof gitClient.getWorkingTreeStats>>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'getGitLfsStatus').mockResolvedValue({ success: true, data: { available: false, files: [] } });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each([1, 400])('finishes staging %i files and updates their status while line statistics remain pending', async (count) => {
  const repo = 'C:/repo';
  const paths = Array.from({ length: 400 }, (_, index) => `large/file-${index}.txt`);
  let staged = new Set<string>();
  let finishStats!: (value: StatsReply) => void;
  const pendingStats = new Promise<StatsReply>((resolve) => {
    finishStats = resolve;
  });
  const stats = vi.spyOn(gitClient, 'getWorkingTreeStats').mockImplementation(async (snapshotId) => {
    if (snapshotId === 'index-0') return pendingStats;
    return {
      success: true,
      data: {
        snapshotId,
        staged: { files: count, additions: count * 25_000, deletions: count * 25_000 },
        unstaged: { files: 400 - count, additions: (400 - count) * 25_000, deletions: (400 - count) * 25_000 },
      },
    };
  });
  const raw = () => paths.map((path) => `${staged.has(path) ? 'M ' : ' M'} ${path}`).join('\n');
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockImplementation(async () => ({ success: true, data: raw() }));
  vi.spyOn(gitClient, 'getWorkingTreeSnapshot').mockImplementation(async () => ({
    success: true,
    data: {
      repoPath: repo,
      snapshotId: `index-${staged.size}`,
      statusRaw: raw(),
      changeCount: 400,
      largeMode: true,
      durationMs: 1,
      isBare: false,
    },
  }));
  const stage = vi.spyOn(gitClient, 'stagePaths').mockImplementation(async (selected) => {
    staged = new Set(selected);
    return { success: true, data: '' };
  });
  let current!: ReturnType<typeof useFileOperations>;
  const params = { repoPath: repo, setToast: vi.fn(), setConfirmDialog: vi.fn(), setInputDialog: vi.fn() };
  const Harness = () => {
    current = useFileOperations(params);
    return null;
  };
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(stats).toHaveBeenCalledOnce();
    let completed = false;
    await act(async () => {
      void (count === 1 ? current.stageFile(paths[0]) : current.stageAll()).then(() => {
        completed = true;
      });
    });
    expect(completed).toBe(true);
    expect(current.isMutating).toBe(false);
    expect(current.status?.staged).toHaveLength(count);
    expect(current.status?.unstaged).toHaveLength(400 - count);
    expect(stage).toHaveBeenCalledExactlyOnceWith(paths.slice(0, count), repo);
    expect(stats).toHaveBeenCalledOnce();
    await act(async () =>
      finishStats({
        success: true,
        data: {
          snapshotId: 'index-0',
          staged: { files: 0, additions: 0, deletions: 0 },
          unstaged: { files: 400, additions: 10_000_000, deletions: 10_000_000 },
        },
      }),
    );
    expect(current.unstagedStats.additions).toBe(0);
    expect(current.status?.staged).toHaveLength(count);
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(stats).toHaveBeenCalledTimes(2);
    expect(current.stagedStats.additions).toBe(count * 25_000);
    expect(current.unstagedStats.additions).toBe((400 - count) * 25_000);
    expect(current.isMutating).toBe(false);
  } finally {
    act(() => root.unmount());
    finishStats({ success: false, error: 'cancelled' });
    host.remove();
  }
});

it('retains conflict safeguards from quick status while the full snapshot is still loading', async () => {
  vi.spyOn(gitClient, 'getWorkingTreeSnapshot').mockReturnValue(new Promise(() => {}));
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: 'UU merge.txt' });
  let current!: ReturnType<typeof useFileOperations>;
  const params = { repoPath: 'C:/repo', setToast: vi.fn(), setConfirmDialog: vi.fn(), setInputDialog: vi.fn() };
  const Harness = () => {
    current = useFileOperations(params);
    return null;
  };
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => root.render(<Harness />));
    expect(current.status?.conflicts.map((file) => file.path)).toEqual(['merge.txt']);
    expect(current.status?.staged).toEqual([]);
    expect(current.status?.unstaged).toEqual([]);
  } finally {
    act(() => root.unmount());
  }
});
