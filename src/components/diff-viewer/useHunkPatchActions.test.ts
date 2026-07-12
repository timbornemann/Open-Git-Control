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
      current = useHunkPatchActions({ repoPath: 'C:\\repo', request: { source: 'unstaged', path: 'file.txt' }, onApplied, onRepoChanged, t: (key) => key });
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

  it('reports hunk failures through the supplied toast callback', async () => {
    vi.spyOn(gitClient, 'applyPatch').mockResolvedValue({ success: false, error: 'patch does not apply' });
    const onError = vi.fn();
    let current: ReturnType<typeof useHunkPatchActions> | null = null;
    const root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      current = useHunkPatchActions({ repoPath: 'C:\\repo', request: { source: 'unstaged', path: 'file.txt' }, onError, t: (key) => key });
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

    expect(onError).toHaveBeenCalledWith('patch does not apply');
    act(() => root.unmount());
  });

  it('retries the same hunk against the refreshed diff after another hunk was staged', async () => {
    vi.spyOn(gitClient, 'applyPatch').mockResolvedValueOnce({ success: false, error: 'patch does not apply' }).mockResolvedValueOnce({ success: true });
    vi.spyOn(gitClient, 'getDiffPreview').mockResolvedValue({
      success: true,
      data: {
        text: [
          'diff --git a/file.txt b/file.txt',
          'index current..working 100644',
          '--- a/file.txt',
          '+++ b/file.txt',
          '@@ -20,6 +20,8 @@',
          ' before',
          '+change',
          '+another change',
          ' after',
        ].join('\n'),
        truncated: false,
      },
    });
    const onApplied = vi.fn();
    const onError = vi.fn();
    let current: ReturnType<typeof useHunkPatchActions> | null = null;
    const root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      current = useHunkPatchActions({ repoPath: 'C:\\repo', request: { source: 'unstaged', path: 'file.txt' }, onApplied, onError, t: (key) => key });
      return null;
    };
    act(() => root.render(createElement(Harness)));

    await act(async () => {
      await current!.applyHunk(
        { id: 'stale-hunk', header: '@@ -10,6 +20,8 @@', rawLines: [' before', '+change', '+another change', ' after'], rows: [] },
        ['diff --git a/file.txt b/file.txt', 'index stale..working 100644', '--- a/file.txt', '+++ b/file.txt'],
        'stage',
      );
    });

    expect(gitClient.getDiffPreview).toHaveBeenCalledWith(['diff', '--', 'file.txt'], undefined, 'C:\\repo');
    expect(gitClient.applyPatch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(gitClient.applyPatch).mock.calls[1]?.[0]).toContain('@@ -20,6 +20,8 @@');
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
