// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '@/data/clientCache';
import { queryClient } from '@/data/queryClient';
import { gitClient } from '@/services/gitClient';
import type { GitFileHistoryEntryDto } from '@/types/git';
import type { IpcResult } from '@/types/ipc';
import { useCommitFileHistory } from './useCommitFileHistory';

const anchor = 'a'.repeat(40);
const entries = (offset: number, count: number): GitFileHistoryEntryDto[] =>
  Array.from({ length: count }, (_, index) => ({
    hash: (1000 - offset - index).toString(16).padStart(40, '0'),
    abbrevHash: String(1000 - offset - index),
    path: 'new/path.ts',
    author: 'Author',
    date: '2026-10-22',
    subject: `Change ${offset + index}`,
  }));
let root: Root, host: HTMLDivElement, history: ReturnType<typeof useCommitFileHistory>;
function Harness({ path, refresh }: { path: string; refresh: number }) {
  history = useCommitFileHistory('C:/repo', path, anchor, true, refresh);
  return null;
}
const render = (path = 'old/path.ts', refresh = 0) => act(async () => root.render(<Harness path={path} refresh={refresh} />));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  queryClient.clear();
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'getFileHistory').mockResolvedValue({ success: true, data: entries(0, 81) });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  queryClient.clear();
});

describe('complete file history pages', () => {
  it('keeps loaded entries after a failed page and retries at the same captured revision and offset', async () => {
    await render();
    vi.mocked(gitClient.getFileHistory).mockResolvedValueOnce({ success: false, error: 'Read failed' });
    await act(async () => history.loadMore());
    expect(history.entries).toHaveLength(80);
    expect(history.error).toBe('Read failed');
    expect(history.hasMore).toBe(true);
    vi.mocked(gitClient.getFileHistory).mockResolvedValueOnce({ success: true, data: entries(80, 10) });
    await act(async () => history.loadMore());
    expect(gitClient.getFileHistory).toHaveBeenLastCalledWith('new/path.ts', entries(0, 1)[0].hash, 81, 'C:/repo', { offset: 80 });
    expect(history.entries).toHaveLength(90);
    expect(history.error).toBeNull();
    expect(history.hasMore).toBe(false);
  });

  it('ignores late pages after a file change and prevents duplicate concurrent page reads', async () => {
    await render();
    let finish!: (result: IpcResult<GitFileHistoryEntryDto[]>) => void;
    const pending = new Promise<IpcResult<GitFileHistoryEntryDto[]>>((resolve) => {
      finish = resolve;
    });
    vi.mocked(gitClient.getFileHistory).mockReturnValueOnce(pending);
    let page!: Promise<void>;
    act(() => {
      page = history.loadMore();
      void history.loadMore();
    });
    expect(gitClient.getFileHistory).toHaveBeenCalledTimes(2);
    vi.mocked(gitClient.getFileHistory).mockResolvedValueOnce({ success: true, data: entries(300, 1) });
    await render('different.ts');
    await act(async () => {
      finish({ success: true, data: entries(80, 20) });
      await page;
    });
    expect(history.entries.map((entry) => entry.subject)).toEqual(['Change 300']);
  });

  it('updates a visible history from refreshed cache data and discards pages from the former tip', async () => {
    await render();
    let finish!: (result: IpcResult<GitFileHistoryEntryDto[]>) => void;
    const pending = new Promise<IpcResult<GitFileHistoryEntryDto[]>>((resolve) => {
      finish = resolve;
    });
    vi.mocked(gitClient.getFileHistory).mockReturnValueOnce(pending);
    let page!: Promise<void>;
    act(() => {
      page = history.loadMore();
    });
    await act(async () =>
      queryClient.setQueryData(cache.resourceKey('git', 'getFileHistory', ['old/path.ts', anchor, 81, 'C:/repo', { includeFuture: true }]), {
        success: true,
        data: entries(400, 2),
      }),
    );
    expect(history.entries.map((entry) => entry.subject)).toEqual(['Change 400', 'Change 401']);
    await act(async () => {
      finish({ success: true, data: entries(80, 20) });
      await page;
    });
    expect(history.entries).toHaveLength(2);
    expect(history.loading).toBe(false);
  });

  it('forces a fresh complete read on an explicit repository refresh', async () => {
    const fresh = vi.spyOn(cache, 'freshRead');
    await render();
    expect(fresh).not.toHaveBeenCalled();
    vi.mocked(gitClient.getFileHistory).mockResolvedValueOnce({ success: true, data: entries(200, 1) });
    await render('old/path.ts', 1);
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(history.entries[0].subject).toBe('Change 200');
  });
});
