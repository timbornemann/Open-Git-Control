// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { button, click, deferred, dialogs, edit, editor, initializeViewerMocks, renderViewer, resetViewerMocks, viewerRequest } from './fileViewerHarness';
import { fileViewerIdentity } from '../fileViewerRequest';

beforeEach(initializeViewerMocks);
afterEach(resetViewerMocks);
describe('file viewer draft protection', () => {
  it.each(['save', 'discard', 'cancel'])('handles %s before switching a dirty editor to Diff', async (action) => {
    const view = await renderViewer();
    await edit('draft\n');
    await click('Diff');
    const dialog = dialogs.confirm.mock.calls.at(-1)?.[0];
    expect(dialog.secondaryActionLabel).toBe('Save and open Diff');
    expect(dialog.confirmLabel).toBe('Discard draft and open Diff');
    expect(document.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Text');
    expect(gitClient.getDiffPreview).not.toHaveBeenCalled();
    await act(async () => {
      if (action === 'save') await dialog.onSecondaryAction();
      else if (action === 'discard') dialog.onConfirm();
      else dialog.onCancel?.();
    });
    expect(document.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe(action === 'cancel' ? 'Text' : 'Diff');
    expect(gitClient.saveRepositoryFile).toHaveBeenCalledTimes(action === 'save' ? 1 : 0);
    if (action === 'cancel') expect(editor.value).toBe('draft\n');
    view.unmount();
  });
  it('keeps the editor open if save-and-Diff fails', async () => {
    vi.mocked(gitClient.saveRepositoryFile).mockResolvedValue({ success: false, error: 'Busy index' });
    const view = await renderViewer();
    await edit('draft');
    await click('Diff');
    await act(async () => dialogs.confirm.mock.calls.at(-1)?.[0].onSecondaryAction());
    expect(document.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Text');
    expect(editor.value).toBe('draft');
    expect(gitClient.getDiffPreview).not.toHaveBeenCalled();
    view.unmount();
  });
  it('keeps edits typed during save-and-Diff in the editor instead of leaving them behind', async () => {
    const pending = deferred<any>();
    vi.mocked(gitClient.saveRepositoryFile).mockReturnValueOnce(pending.promise);
    const view = await renderViewer();
    await edit('draft before saving');
    await click('Diff');
    let navigation!: Promise<void>;
    act(() => {
      navigation = dialogs.confirm.mock.calls.at(-1)?.[0].onSecondaryAction();
    });
    await edit('draft typed during saving');
    await act(async () => {
      pending.resolve({ success: true, data: { version: 'next-version', bytes: 19 } });
      await navigation;
    });
    expect(document.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Text');
    expect(editor.value).toBe('draft typed during saving');
    expect(button('Save working file').disabled).toBe(false);
    expect(gitClient.getDiffPreview).not.toHaveBeenCalled();
    view.unmount();
  });
  it('keeps one draft while moving between Text, Table and Preview', async () => {
    const view = await renderViewer(viewerRequest('unstaged', 'file.csv'));
    await edit('a,b\n3,4\n');
    await click('Table');
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Row 2, column A"]')?.value).toBe('3');
    await click('Text');
    expect(editor.value).toBe('a,b\n3,4\n');
    expect(dialogs.confirm).not.toHaveBeenCalled();
    view.unmount();
    const markdown = await renderViewer(viewerRequest('unstaged', 'notes.md'));
    await edit('# Unsaved heading');
    await click('Preview');
    expect(document.querySelector('article')?.textContent).toContain('Unsaved heading');
    await click('Text');
    expect(editor.value).toBe('# Unsaved heading');
    expect(dialogs.confirm).not.toHaveBeenCalled();
    markdown.unmount();
  });
  it('guards source, repository, file and close navigation with the same draft policy', async () => {
    const view = await renderViewer();
    await edit('draft');
    const guard = view.props.onNavigationGuardChange.mock.calls.at(-1)?.[0];
    for (const target of [
      { kind: 'file', path: 'file.txt', identity: fileViewerIdentity(viewerRequest('staged')) },
      { kind: 'file', path: 'other.txt' },
      { kind: 'repository', path: 'C:/other' },
    ]) {
      const proceed = vi.fn();
      const cancel = vi.fn();
      act(() => guard(target, proceed, cancel));
      const dialog = dialogs.confirm.mock.calls.at(-1)?.[0];
      act(() => dialog.onCancel());
      expect(proceed).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
    }
    await click('Close file');
    expect(view.props.onClose).not.toHaveBeenCalled();
    act(() => dialogs.confirm.mock.calls.at(-1)?.[0].onConfirm());
    expect(view.props.onClose).toHaveBeenCalledOnce();
    view.unmount();
  });
  it('ignores a delayed tool result after switching to another source of the same path', async () => {
    const view = await renderViewer();
    await click('Tools');
    await click('Edit lines');
    await click('Add prefix/suffix');
    const dialog = dialogs.input.mock.calls.at(-1)?.[0];
    await view.rerender(viewerRequest('staged'));
    await click('Text');
    await act(async () => dialog.onSubmit({ prefix: 'OLD ' }));
    expect(editor.value).toBe('staged contents\n');
    expect(button('Save staging').disabled).toBe(true);
    view.unmount();
  });
  it('invalidates pending tools and navigation dialogs even after returning to the original source', async () => {
    const view = await renderViewer();
    await click('Tools');
    await click('Edit lines');
    await click('Add prefix/suffix');
    const tool = dialogs.input.mock.calls.at(-1)?.[0];
    await edit('original draft');
    await click('Diff');
    const navigation = dialogs.confirm.mock.calls.at(-1)?.[0];
    await view.rerender(viewerRequest('staged'));
    await view.rerender(viewerRequest());
    await act(async () => {
      tool.onSubmit({ prefix: 'STALE ' });
      navigation.onConfirm();
    });
    expect(editor.value).toBe('unstaged contents\n');
    expect(document.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Text');
    expect(button('Save working file').disabled).toBe(true);
    view.unmount();
  });
  it('does not apply a stale hunk discard confirmation after switching sources and returning', async () => {
    const request = { ...viewerRequest(), startView: 'diff' as const };
    const view = await renderViewer(request);
    await vi.waitFor(() => expect(document.querySelector('.diff-hunk')).toBeTruthy());
    await click('Discard');
    const dialog = dialogs.confirm.mock.calls.at(-1)?.[0];
    await view.rerender(viewerRequest('staged'));
    await view.rerender(request);
    await act(async () => dialog.onConfirm());
    expect(gitClient.applyPatch).not.toHaveBeenCalled();
    view.unmount();
  });
});
