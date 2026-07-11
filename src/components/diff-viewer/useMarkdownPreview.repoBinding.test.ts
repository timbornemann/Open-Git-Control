import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMarkdownPreview } from '@/components/diff-viewer/useMarkdownPreview';
import { gitClient } from '@/services/gitClient';

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal('DOMParser', dom.window.DOMParser);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useMarkdownPreview repository binding', () => {
  it('binds markdown and staged fallback assets to the captured repository', async () => {
    const getMarkdown = vi.spyOn(gitClient, 'getMarkdownPreviewFile').mockResolvedValue({
      success: true,
      data: { text: '![logo](./logo.png)' },
    });
    const getAsset = vi
      .spyOn(gitClient, 'getRepoFileDataUrl')
      .mockResolvedValueOnce({ success: false, error: 'not in index' })
      .mockResolvedValueOnce({ success: true, data: { dataUrl: 'data:image/png;base64,AA==', mimeType: 'image/png', bytes: 1 } });
    const request = { source: 'staged' as const, path: 'docs/readme.md', title: 'README' };
    const t = ((key: string) => key) as any;
    let state: ReturnType<typeof useMarkdownPreview> | null = null;
    const Harness = () => {
      state = useMarkdownPreview({
        repoPath: 'C:/repo-a',
        request,
        isActive: true,
        t,
      });
      return null;
    };
    const root = createRoot(document.getElementById('root')!);
    await act(async () => root.render(createElement(Harness)));
    await vi.waitFor(() => expect(getAsset).toHaveBeenCalledTimes(2));
    expect(state?.markdownPreview.loading).toBe(false);

    expect(getMarkdown).toHaveBeenCalledWith(expect.objectContaining({ repoPath: 'C:/repo-a' }));
    expect(getAsset).toHaveBeenNthCalledWith(1, expect.objectContaining({ source: 'staged', repoPath: 'C:/repo-a' }));
    expect(getAsset).toHaveBeenNthCalledWith(2, expect.objectContaining({ source: 'unstaged', repoPath: 'C:/repo-a' }));
    act(() => root.unmount());
  });
});
