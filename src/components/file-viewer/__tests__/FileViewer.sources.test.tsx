// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { button, click, deferred, dialogs, edit, editor, initializeViewerMocks, renderViewer, resetViewerMocks, viewerRequest } from './fileViewerHarness';

beforeEach(initializeViewerMocks);
afterEach(resetViewerMocks);
describe('shared file viewer sources', () => {
  it.each(['unstaged', 'staged', 'commit'] as const)('opens %s with the requested initial view and selected content', async (source) => {
    const view = await renderViewer(viewerRequest(source));
    expect(document.querySelector('.file-viewer')?.getAttribute('data-source')).toBe(source);
    expect(document.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe(source === 'unstaged' ? 'Text' : 'Diff');
    await click('Text');
    await vi.waitFor(() => expect(editor.value).toBe(`${source} contents\n`));
    expect(editor.readOnly).toBe(source === 'commit');
    view.unmount();
  });
  it('saves staged contents with the index version and refreshes the diff and repository', async () => {
    const view = await renderViewer(viewerRequest('staged'));
    await click('Text');
    await edit('index draft\n');
    await click('Save staging');
    expect(gitClient.saveRepositoryFile).toHaveBeenCalledWith({
      repoPath: 'C:/viewer-repo',
      source: 'staged',
      path: 'file.txt',
      expectedVersion: 'staged-version',
      content: 'index draft\n',
      encoding: 'utf8',
    });
    expect(view.props.onRepoChanged).toHaveBeenCalledTimes(1);
    await click('Diff');
    expect(gitClient.getDiffPreview).toHaveBeenLastCalledWith(['diff', '--cached', '--', 'file.txt'], expect.any(Object), 'C:/viewer-repo');
    expect(dialogs.confirm).not.toHaveBeenCalled();
    view.unmount();
  });
  it('preserves edits made while a save is running and uses the returned version for the next save', async () => {
    const pending = deferred<{ success: true; data: { version: string; bytes: number } }>();
    vi.mocked(gitClient.saveRepositoryFile).mockReturnValueOnce(pending.promise);
    const view = await renderViewer();
    await edit('first draft');
    await click('Save working file');
    await edit('second draft');
    await act(async () => pending.resolve({ success: true, data: { version: 'next-version', bytes: 11 } }));
    expect(editor.value).toBe('second draft');
    expect(button('Save working file').disabled).toBe(false);
    await click('Save working file');
    expect(gitClient.saveRepositoryFile).toHaveBeenLastCalledWith(expect.objectContaining({ expectedVersion: 'next-version', content: 'second draft' }));
    view.unmount();
  });
  it('keeps a failed index-save draft through status refresh and never overwrites it', async () => {
    vi.mocked(gitClient.saveRepositoryFile).mockResolvedValue({ success: false, error: 'Index entry changed. Draft kept.' });
    const view = await renderViewer(viewerRequest('staged'));
    await click('Text');
    await edit('my staged draft');
    await click('Save staging');
    await view.refresh();
    expect(editor.value).toBe('my staged draft');
    expect(button('Save staging').disabled).toBe(false);
    expect(document.querySelector('[role=alert]')?.textContent).toContain('Index entry changed');
    view.unmount();
  });
  it('does not apply a late load or save to a new repository or source of the same file', async () => {
    const pending = deferred<any>();
    vi.mocked(gitClient.getRepositoryFilePreview).mockReturnValueOnce(pending.promise);
    const view = await renderViewer();
    await view.rerender(viewerRequest('staged'));
    await click('Text');
    await act(async () =>
      pending.resolve({ success: true, data: { kind: 'text', text: 'late working data', version: 'old', encoding: 'utf8', editable: true } }),
    );
    expect(editor.value).toBe('staged contents\n');
    const save = deferred<any>();
    vi.mocked(gitClient.saveRepositoryFile).mockReturnValueOnce(save.promise);
    await edit('index draft');
    await click('Save staging');
    await view.rerender({ ...viewerRequest(), repoPath: 'C:/different-repo' });
    await act(async () => save.resolve({ success: true, data: { version: 'late-save', bytes: 10 } }));
    expect(editor.value).toBe('unstaged contents\n');
    expect(view.props.onRepoChanged).not.toHaveBeenCalled();
    view.unmount();
  });
  it('ignores a previous save after leaving and returning to the same file source', async () => {
    const pending = deferred<any>();
    vi.mocked(gitClient.saveRepositoryFile).mockReturnValueOnce(pending.promise);
    const view = await renderViewer();
    await edit('old draft');
    await click('Save working file');
    await view.rerender(viewerRequest('staged'));
    await view.rerender(viewerRequest());
    await edit('new draft after returning');
    await act(async () => pending.resolve({ success: true, data: { version: 'old-save-version', bytes: 9 } }));
    expect(editor.value).toBe('new draft after returning');
    expect(view.props.onRepoChanged).not.toHaveBeenCalled();
    await click('Save working file');
    expect(gitClient.saveRepositoryFile).toHaveBeenLastCalledWith(expect.objectContaining({ expectedVersion: 'unstaged-version' }));
    view.unmount();
  });
  it.each(['staged', 'commit'] as const)('uses only %s HTML assets and explains missing assets while keeping the preview', async (source) => {
    vi.mocked(gitClient.getRepositoryFilePreview).mockResolvedValue({
      success: true,
      data: {
        kind: 'text',
        text: '<link rel="stylesheet" href="style.css"><h1>Selected HTML</h1><img src="missing.png">',
        encoding: 'utf8',
        bytes: 90,
        version: 'html-version',
        editable: source === 'staged',
      },
    });
    vi.mocked(gitClient.getMarkdownPreviewFile).mockResolvedValue({ success: true, data: { text: 'h1 { color: red; }' } });
    const request = viewerRequest(source, 'docs/page.html');
    const view = await renderViewer(request);
    await click('Preview');
    await vi.waitFor(() => expect(document.querySelector<HTMLIFrameElement>('iframe')?.srcdoc).toContain('Selected HTML'));
    const expectedContext = { source, repoPath: request.repoPath, commitHash: request.commitHash };
    expect(gitClient.getMarkdownPreviewFile).toHaveBeenCalledWith({ ...expectedContext, path: 'docs/style.css' });
    expect(gitClient.getRepoFileDataUrl).toHaveBeenCalledWith({ ...expectedContext, path: 'docs/missing.png' });
    expect(gitClient.getRepoFileDataUrl).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('Assets unavailable in this version: docs/missing.png');
    const html = document.querySelector<HTMLIFrameElement>('iframe')!.srcdoc;
    expect(html).toContain('h1 { color: red; }');
    expect(html).not.toContain('src="missing.png"');
    expect(document.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts');
    view.unmount();
  });
  it('keeps deleted files available in Diff while explaining their missing text source', async () => {
    vi.mocked(gitClient.getRepositoryFilePreview).mockResolvedValue({
      success: true,
      data: { kind: 'missing', bytes: 0, version: 'missing', editable: false, reason: 'The working file is missing.' },
    });
    const view = await renderViewer({ ...viewerRequest(), startView: 'diff' });
    expect(document.querySelector('.diff-viewer-root')).toBeTruthy();
    await click('Text');
    expect(document.body.textContent).toContain('The working file is missing.');
    expect(document.body.textContent).not.toContain('Save working file');
    view.unmount();
  });
  it('keeps commit CSV cells and mutating tools read-only while retaining hashes', async () => {
    vi.mocked(gitClient.getRepositoryFilePreview).mockResolvedValue({
      success: true,
      data: { kind: 'text', text: 'a,b\n1,2\n', encoding: 'utf8', isMarkdown: false, bytes: 8, version: 'commit-version', editable: false },
    });
    const info = vi.spyOn(gitClient, 'getRepositoryFileInfo').mockResolvedValue({
      success: true,
      data: { path: 'file.csv', bytes: 8, version: 'commit-version', editable: false, hashes: { sha256: 'commit-sha256', sha1: 'sha1', md5: 'md5' } },
    });
    const context = viewerRequest('commit', 'file.csv');
    const view = await renderViewer(context);
    await click('Table');
    expect(document.querySelector('input')?.readOnly).toBe(true);
    expect(button('Row').disabled).toBe(true);
    await click('Tools');
    await click('Encoding and line endings');
    expect(button('UTF-8 BOM').disabled).toBe(true);
    await click('Back to all tools');
    await click('Hashes');
    await click('Show hashes');
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ source: 'commit', commitHash: 'a'.repeat(40) }));
    expect(dialogs.confirm.mock.calls.at(-1)?.[0].contextItems[0].value).toBe('commit-sha256');
    expect(gitClient.saveRepositoryFile).not.toHaveBeenCalled();
    view.unmount();
  });
  it('keeps hunk operations in unified and side-by-side diff views', async () => {
    const view = await renderViewer({ ...viewerRequest(), startView: 'diff' });
    await vi.waitFor(() => expect(document.querySelector('.diff-hunk')).toBeTruthy());
    const stage = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.includes('Stage') && !b.textContent?.includes('Unstage'),
    );
    expect(stage).toBeTruthy();
    await act(async () => stage?.click());
    expect(gitClient.applyPatch).toHaveBeenCalledWith(expect.stringContaining('+after'), { cached: true }, 'C:/viewer-repo');
    const sbs = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Side-by-side'));
    expect(sbs).toBeTruthy();
    await act(async () => sbs?.click());
    expect(document.querySelector('.diff-sbs-wrap')).toBeTruthy();
    view.unmount();
  });
});
