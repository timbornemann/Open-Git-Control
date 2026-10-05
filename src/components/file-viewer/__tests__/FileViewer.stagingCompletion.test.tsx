// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import type { DiffPreviewDto } from '@/types/gitDtos';
import { button, click, deferred, dialogs, editor, initializeViewerMocks, renderViewer, resetViewerMocks, viewerRequest } from './fileViewerHarness';

beforeEach(initializeViewerMocks);
afterEach(resetViewerMocks);

const header = ['diff --git a/file.txt b/file.txt', '--- a/file.txt', '+++ b/file.txt'];
const firstHunk = ['@@ -1 +1 @@', '-first before', '+first after'];
const lastHunk = ['@@ -20 +20 @@', '-last before', '+last after'];
const diff = (...hunks: string[][]) => [...header, ...hunks.flat()].join('\n');
const preview = (text: string, truncated = false) => ({
  success: true as const,
  data: { text, truncated, bytes: text.length, lines: text.split('\n').length },
});
const request = { ...viewerRequest(), startView: 'diff' as const };
const selectedSource = () => document.querySelector('.file-viewer')?.getAttribute('data-source');

describe('file viewer after staging the final hunk', () => {
  it.each(['unified', 'side-by-side'])('shows the complete staged file after the final hunk, preserving %s mode', async (mode) => {
    let applied = 0;
    vi.mocked(gitClient.applyPatch).mockImplementation(async () => {
      applied++;
      return { success: true };
    });
    vi.mocked(gitClient.getDiffPreview).mockImplementation(async (args) =>
      preview(args.includes('--cached') ? diff(firstHunk, lastHunk) : applied === 0 ? diff(firstHunk, lastHunk) : applied === 1 ? diff(lastHunk) : ''),
    );
    const view = await renderViewer(request);
    await vi.waitFor(() => expect(document.querySelectorAll('.diff-hunk')).toHaveLength(2));
    if (mode === 'side-by-side') {
      const toggle = [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === 'Side-by-side');
      expect(toggle).toBeTruthy();
      await act(async () => toggle!.click());
    }
    await click('Stage');
    expect(selectedSource()).toBe('unstaged');
    await vi.waitFor(() => expect(document.querySelectorAll('.diff-hunk')).toHaveLength(1));
    expect(document.querySelector('.diff-viewer-root')?.textContent).toContain('last after');
    await click('Stage');
    await vi.waitFor(() => expect(selectedSource()).toBe('staged'));
    expect(document.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Diff');
    expect(document.querySelector('.file-viewer-source')?.textContent).toBe('Git index · Staging');
    expect(document.querySelector('.diff-viewer-root')?.textContent).toContain('first after');
    expect(document.querySelector('.diff-viewer-root')?.textContent).toContain('last after');
    expect(document.querySelectorAll('.diff-hunk')).toHaveLength(2);
    expect(button('Unstage')).toBeTruthy();
    expect(Boolean(document.querySelector('.diff-sbs-wrap'))).toBe(mode === 'side-by-side');
    expect(view.props.onRepoChanged).toHaveBeenCalledTimes(2);
    await click('Text');
    await vi.waitFor(() => expect(editor.value).toBe('staged contents\n'));
    expect(button('Save staging').disabled).toBe(true);
    view.unmount();
  });

  it('updates the owning selection when the viewer request is controlled by the repository view', async () => {
    let applied = false;
    vi.mocked(gitClient.applyPatch).mockImplementation(async () => {
      applied = true;
      return { success: true };
    });
    vi.mocked(gitClient.getDiffPreview).mockImplementation(async (args) => preview(args.includes('--cached') || !applied ? diff(lastHunk) : ''));
    const onRequestChange = vi.fn();
    const view = await renderViewer(request, { onRequestChange });
    await click('Stage');
    await vi.waitFor(() =>
      expect(onRequestChange).toHaveBeenCalledWith({ repoPath: request.repoPath, path: request.path, source: 'staged', startView: 'diff' }),
    );
    await view.rerender(onRequestChange.mock.calls[0][0]);
    expect(selectedSource()).toBe('staged');
    expect(button('Unstage')).toBeTruthy();
    view.unmount();
  });

  it.each(['discard', 'unstage', 'failed stage', 'empty index', 'failed check', 'truncated check'])('keeps the selected source after %s', async (caseName) => {
    const source = caseName === 'unstage' ? 'staged' : 'unstaged';
    let applied = false;
    vi.mocked(gitClient.applyPatch).mockImplementation(async () => {
      applied = true;
      return caseName === 'failed stage' ? { success: false, error: 'Git refused the patch' } : { success: true };
    });
    vi.mocked(gitClient.getDiffPreview).mockImplementation(async (args) => {
      if (!applied) return preview(diff(lastHunk));
      if (caseName === 'failed check') return { success: false, error: 'Could not check the file' };
      return preview(args.includes('--cached') && caseName !== 'empty index' && source !== 'staged' ? diff(lastHunk) : '', caseName === 'truncated check');
    });
    const onRequestChange = vi.fn();
    const view = await renderViewer({ ...request, source }, { onRequestChange });
    await click(caseName === 'unstage' ? 'Unstage' : caseName === 'discard' ? 'Discard' : 'Stage');
    if (caseName === 'discard') await act(async () => dialogs.confirm.mock.calls.at(-1)?.[0].onConfirm());
    expect(onRequestChange).not.toHaveBeenCalled();
    expect(selectedSource()).toBe(source);
    view.unmount();
  });

  it.each(['repository', 'file', 'source', 'tab', 'source round trip'])('ignores a completed staging check after a %s change', async (change) => {
    const staged = deferred<{ success: true; data: DiffPreviewDto }>();
    let applied = false;
    vi.mocked(gitClient.applyPatch).mockImplementation(async () => {
      applied = true;
      return { success: true };
    });
    vi.mocked(gitClient.getDiffPreview).mockImplementation(async (args) =>
      args.includes('--cached') ? staged.promise : preview(applied ? '' : diff(lastHunk)),
    );
    const onRequestChange = vi.fn();
    const view = await renderViewer(request, { onRequestChange });
    await click('Stage');
    await vi.waitFor(() =>
      expect(gitClient.getDiffPreview).toHaveBeenCalledWith(['diff', '--cached', '--', request.path], expect.any(Object), request.repoPath),
    );
    if (change === 'tab') await click('Text');
    else if (change.startsWith('source')) {
      await view.rerender(viewerRequest('staged'));
      if (change === 'source round trip') await view.rerender(request);
    } else await view.rerender({ ...request, ...(change === 'repository' ? { repoPath: 'C:/different-repo' } : { path: 'other.txt' }) });
    await act(async () => staged.resolve(preview(diff(firstHunk, lastHunk))));
    expect(onRequestChange).not.toHaveBeenCalled();
    expect(selectedSource()).toBe(change === 'source' ? 'staged' : 'unstaged');
    if (change === 'tab') expect(document.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Text');
    view.unmount();
  });
});
