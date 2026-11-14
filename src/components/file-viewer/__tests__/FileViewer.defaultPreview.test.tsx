// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import type { RepositoryFilePreviewDto } from '@/shared/ipc/repositoryFiles';
import { fileViewerRequestFromDiff, fileViewerRequestFromWorkingFile } from '../fileViewerRequest';
import { button, click, deferred, edit, editor, getDiffPreview, initializeViewerMocks, renderViewer, resetViewerMocks } from './fileViewerHarness';

beforeEach(initializeViewerMocks);
afterEach(resetViewerMocks);

const workingFile = (path: string) => fileViewerRequestFromWorkingFile('C:/viewer-repo', path);
const textPreview = (text: string): RepositoryFilePreviewDto => ({
  kind: 'text',
  text,
  encoding: 'utf8',
  bytes: text.length,
  isMarkdown: false,
  version: 'text-version',
  editable: true,
});
const selectedTab = () => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent;

describe('default preview when opening a working-directory file', () => {
  it.each([
    ['docs/README.md', '# Automatic preview'],
    ['docs/README.MARKDOWN', '# Automatic preview'],
    ['web/page.html', '<h1>Automatic preview</h1>'],
    ['web/page.HTM', '<h1>Automatic preview</h1>'],
  ])('opens the rendered preview of %s directly', async (path, content) => {
    vi.mocked(gitClient.getRepositoryFilePreview).mockResolvedValue({ success: true, data: textPreview(content) });
    const view = await renderViewer(workingFile(path));
    try {
      expect(selectedTab()).toBe('Preview');
      if (path.toLowerCase().endsWith('.md') || path.toLowerCase().endsWith('.markdown')) {
        await vi.waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Automatic preview'));
      } else {
        await vi.waitFor(() =>
          expect(new URL(document.querySelector<HTMLIFrameElement>('iframe')!.src).searchParams.get('document')).toContain('<h1>Automatic preview</h1>'),
        );
      }
      expect(document.querySelector('[data-testid="editor"]')).toBeNull();
    } finally {
      view.unmount();
    }
  });

  it.each(['assets/photo.png', 'assets/without-extension'])('opens image previews based on the loaded content of %s', async (path) => {
    vi.mocked(gitClient.getRepositoryFilePreview).mockResolvedValue({
      success: true,
      data: { kind: 'image', dataUrl: 'data:image/png;base64,AA==', mimeType: 'image/png', bytes: 1, version: 'image-version', editable: false },
    });
    const view = await renderViewer(workingFile(path));
    try {
      expect(selectedTab()).toBe('Preview');
      expect(document.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AA==');
    } finally {
      view.unmount();
    }
  });

  it('uses Text for ordinary files and unavailable previews', async () => {
    const view = await renderViewer(workingFile('src/code.ts'));
    try {
      expect(selectedTab()).toBe('Text');
      expect(editor.value).toBe('unstaged contents\n');
      vi.mocked(gitClient.getRepositoryFilePreview).mockResolvedValue({
        success: true,
        data: { kind: 'binary', bytes: 10_000_000, mimeType: null, reason: 'tooLarge', version: 'large-version', editable: false },
      });
      await view.rerender(workingFile('docs/large.md'));
      expect(selectedTab()).toBe('Text');
      expect(document.body.textContent).toContain('File too large');
      expect(document.querySelector('[data-file-tab="preview"]')).toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('selects Preview when an asynchronous file load first makes it available', async () => {
    const pending = deferred<Awaited<ReturnType<typeof gitClient.getRepositoryFilePreview>>>();
    vi.mocked(gitClient.getRepositoryFilePreview).mockReturnValueOnce(pending.promise);
    const view = await renderViewer(workingFile('README.md'));
    try {
      await act(async () => pending.resolve({ success: true, data: textPreview('# Loaded preview') }));
      expect(selectedTab()).toBe('Preview');
      await vi.waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Loaded preview'));
    } finally {
      view.unmount();
    }
  });

  it('keeps an explicit Text choice while loading and refreshing, then chooses afresh for the next file', async () => {
    const pending = deferred<Awaited<ReturnType<typeof gitClient.getRepositoryFilePreview>>>();
    vi.mocked(gitClient.getRepositoryFilePreview).mockReturnValueOnce(pending.promise);
    const view = await renderViewer(workingFile('README.md'));
    try {
      await click('Text');
      await act(async () => pending.resolve({ success: true, data: textPreview('# Loaded preview') }));
      expect(selectedTab()).toBe('Text');
      await edit('# Unsaved draft');
      await click('Preview');
      expect(document.querySelector('article')?.textContent).toContain('Unsaved draft');
      await click('Text');
      await click('Save working file');
      await view.refresh();
      expect(selectedTab()).toBe('Text');
      expect(button('Preview')).toBeTruthy();
      await view.rerender(workingFile('next.md'));
      expect(selectedTab()).toBe('Preview');
    } finally {
      view.unmount();
    }
  });

  it('opens positioned search results in the text editor', async () => {
    const position = { line: 12, column: 3 };
    const view = await renderViewer(fileViewerRequestFromWorkingFile('C:/viewer-repo', 'README.md', position));
    try {
      expect(selectedTab()).toBe('Text');
      expect(editor.position).toEqual(position);
    } finally {
      view.unmount();
    }
  });

  it('honors an explicitly requested Diff for a previewable file', async () => {
    const view = await renderViewer(fileViewerRequestFromDiff('C:/viewer-repo', { path: 'README.md', source: 'unstaged' }));
    try {
      expect(selectedTab()).toBe('Diff');
      expect(getDiffPreview).toHaveBeenCalled();
    } finally {
      view.unmount();
    }
  });
});
