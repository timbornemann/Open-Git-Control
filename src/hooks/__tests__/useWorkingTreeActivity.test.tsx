// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { queryClient } from '@/data/queryClient';
import { publishRepositoryActivity, repositoryActivityKey } from '@/data/repositoryActivityCache';
import { useWorkingTreeSnapshot, type WorkingTreeState } from '../useWorkingTreeSnapshot';

let root: Root;
let host: HTMLDivElement;
let current: WorkingTreeState;
const repo = 'C:/repo';
function Harness() {
  current = useWorkingTreeSnapshot(repo);
  return null;
}
const snapshot = (changeCount: number) => ({
  success: true as const,
  data: { repoPath: repo, snapshotId: String(changeCount), statusRaw: '', changeCount, largeMode: false, durationMs: 1, isBare: false },
});

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: false, error: 'unavailable' });
  vi.spyOn(gitClient, 'getWorkingTreeStats').mockResolvedValue({ success: false, error: 'stats unavailable' });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('active repository activity publication', () => {
  it('reuses snapshot counts, retains them on failure, and clears the error on recovery', async () => {
    vi.spyOn(gitClient, 'getWorkingTreeStatus')
      .mockResolvedValueOnce({ success: true, data: { ...snapshot(4).data, checkedAt: Date.now() } })
      .mockResolvedValueOnce({ success: false, error: 'unavailable' })
      .mockResolvedValue({ success: true, data: { ...snapshot(0).data, checkedAt: Date.now() } });
    const extraRead = vi.spyOn(gitClient, 'getRepositoryChangeSummary');
    await act(async () => root.render(createElement(Harness)));
    expect(queryClient.getQueryData(repositoryActivityKey(repo))).toMatchObject({ data: { changeCount: 4 } });
    await act(async () => {
      await expect(current.refresh()).rejects.toThrow('unavailable');
    });
    expect(queryClient.getQueryState(repositoryActivityKey(repo))?.status).toBe('error');
    expect(queryClient.getQueryData(repositoryActivityKey(repo))).toMatchObject({ data: { changeCount: 4 } });
    await act(async () => current.refresh());
    expect(queryClient.getQueryState(repositoryActivityKey(repo))?.status).toBe('success');
    expect(queryClient.getQueryData(repositoryActivityKey(repo))).toMatchObject({ data: { changeCount: 0 } });
    expect(extraRead).not.toHaveBeenCalled();
  });

  it('publishes a deduplicated fallback count when the full snapshot rejects', async () => {
    vi.spyOn(gitClient, 'getWorkingTreeSnapshot').mockRejectedValue(new Error('snapshot failed'));
    vi.spyOn(gitClient, 'getWorkingTreeStatus').mockResolvedValue({
      success: true,
      data: { repoPath: repo, statusRaw: 'MM shared.ts\n?? new.ts', changeCount: 2, checkedAt: Date.now() },
    });
    vi.mocked(gitClient.runGitCommandForRepo).mockResolvedValue({ success: true, data: 'MM shared.ts\n?? new.ts' });
    await act(async () => root.render(createElement(Harness)));
    expect(queryClient.getQueryData(repositoryActivityKey(repo))).toMatchObject({ data: { changeCount: 2 } });
  });

  it('does not publish late snapshots after unmount', async () => {
    let resolve!: (value: ReturnType<typeof snapshot>) => void;
    vi.spyOn(gitClient, 'getWorkingTreeStatus').mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await act(async () => root.render(createElement(Harness)));
    await act(async () => root.render(null));
    publishRepositoryActivity(repo, 2);
    await act(async () => resolve(snapshot(99)));
    expect(queryClient.getQueryData(repositoryActivityKey(repo))).toMatchObject({ data: { changeCount: 2 } });
  });
});
