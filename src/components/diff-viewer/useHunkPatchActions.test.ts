import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { useHunkPatchActions } from './useHunkPatchActions';

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useHunkPatchActions', () => {
  it('requests a displayed-diff refresh after a successful hunk mutation', async () => {
    vi.spyOn(gitClient, 'applyPatch').mockResolvedValue({ success: true });
    const onApplied = vi.fn();
    const onRepoChanged = vi.fn();
    let current: ReturnType<typeof useHunkPatchActions> | null = null;
    const root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      current = useHunkPatchActions({ repoPath: 'C:\\repo', onApplied, onRepoChanged, t: (key) => key });
      return null;
    };
    act(() => root.render(createElement(Harness)));

    await act(async () => {
      await current!.applyHunk(
        { id: 'hunk-1', header: '@@ -1 +1 @@', rawLines: ['-old', '+new'], rows: [] },
        ['diff --git a/file.txt b/file.txt', '--- a/file.txt', '+++ b/file.txt'],
        'stage',
      );
    });

    expect(onRepoChanged).toHaveBeenCalledTimes(1);
    expect(onApplied).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
