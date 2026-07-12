// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { useDiffBlame } from './useDiffBlame';

describe('useDiffBlame refresh binding', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('refetches visible blame after a successful hunk operation refresh', async () => {
    const getBlame = vi.spyOn(gitClient, 'getFileBlame').mockResolvedValue({ success: true, data: [] });
    let refreshTrigger = 0;
    let current: ReturnType<typeof useDiffBlame> | null = null;
    const request = { source: 'unstaged' as const, path: 'src/app.ts' };
    const Harness = () => {
      current = useDiffBlame({ repoPath: 'C:/repo', request, refreshTrigger });
      return null;
    };
    const render = () => root.render(createElement(Harness));
    act(render);
    await act(async () => {
      current!.setShowBlame(true);
      await Promise.resolve();
    });
    expect(getBlame).toHaveBeenCalledTimes(1);

    refreshTrigger += 1;
    await act(async () => {
      render();
      await Promise.resolve();
    });
    expect(getBlame).toHaveBeenCalledTimes(2);
  });

  it('removes stale blame while refreshing and keeps it cleared after an error', async () => {
    let resolveFailure!: (result: { success: false; error: string }) => void;
    const failedRefresh = new Promise<{ success: false; error: string }>((resolve) => {
      resolveFailure = resolve;
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const getBlame = vi
      .spyOn(gitClient, 'getFileBlame')
      .mockResolvedValueOnce({
        success: true,
        data: [{ lineNumber: 1, commitHash: 'abc', author: 'Author', content: 'old line' } as any],
      })
      .mockReturnValueOnce(failedRefresh);
    let refreshTrigger = 0;
    let current: ReturnType<typeof useDiffBlame> | null = null;
    const request = { source: 'unstaged' as const, path: 'src/app.ts' };
    const Harness = () => {
      current = useDiffBlame({ repoPath: 'C:/repo', request, refreshTrigger });
      return null;
    };
    const render = () => root.render(createElement(Harness));

    act(render);
    await act(async () => {
      current!.setShowBlame(true);
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(current!.blameMap.size).toBe(1));

    refreshTrigger += 1;
    act(render);
    expect(current!.blameMap.size).toBe(0);
    expect(current!.isBlameLoading).toBe(true);

    await act(async () => {
      resolveFailure({ success: false, error: 'Blame failed.' });
      await failedRefresh;
    });
    expect(getBlame).toHaveBeenCalledTimes(2);
    expect(current!.blameMap.size).toBe(0);
    expect(current!.isBlameLoading).toBe(false);
  });
});
