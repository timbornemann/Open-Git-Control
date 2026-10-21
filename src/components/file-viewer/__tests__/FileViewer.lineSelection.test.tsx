// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { getDiffPreview, button, click, deferred, dialogs, initializeViewerMocks, renderViewer, resetViewerMocks, viewerRequest } from './fileViewerHarness';
import type { ApplyDiffLineSelectionResult } from '@/shared/ipc/diffLineSelection';
import type { IpcResult } from '@/types/ipc';

const header = ['diff --git a/file.txt b/file.txt', '--- a/file.txt', '+++ b/file.txt'];
const diff = [...header, '@@ -1,4 +1,4 @@', '-one', '-two', '-three', '+ONE', '+TWO', '+THREE', ' keep', ''].join('\n');
const preview = (text = diff, truncated = false) => ({ success: true as const, data: { text, truncated, bytes: text.length, lines: text.split('\n').length } });
const request = { ...viewerRequest(), startView: 'diff' as const };
const lineButtons = () => [...document.querySelectorAll<HTMLButtonElement>('.diff-line-action')];
const isSelected = (button: HTMLButtonElement) => button.getAttribute('aria-pressed') === 'true';
const select = async (index: number, shift = false) =>
  act(async () => {
    lineButtons()[index].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: shift }));
  });
const sideBySide = async () => {
  const toggle = [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === 'Side-by-side')!;
  await act(async () => toggle.click());
};
beforeEach(() => {
  initializeViewerMocks();
  getDiffPreview.mockResolvedValue(preview());
  vi.spyOn(gitClient, 'applyDiffLineSelection').mockResolvedValue({ success: true, data: { status: 'applied' } });
});
afterEach(resetViewerMocks);

describe('file viewer line selection', () => {
  it('couples replacement rows, counts changes once and preserves selection between views', async () => {
    const view = await renderViewer(request);
    expect(lineButtons()).toHaveLength(6);
    expect(document.querySelector('.diff-selection-gutter input')).toBeNull();
    expect(lineButtons().every((control) => control.querySelector('.lucide-plus'))).toBe(true);
    await select(1);
    expect(lineButtons().filter(isSelected)).toHaveLength(2);
    expect(document.querySelector('.diff-selection-summary')?.textContent).toContain('1 change selected');
    expect(document.querySelectorAll('.diff-line-selected')).toHaveLength(2);
    await sideBySide();
    expect(lineButtons().every((control) => control.querySelector('.lucide-plus'))).toBe(true);
    expect(lineButtons().filter(isSelected)).toHaveLength(2);
    expect(document.querySelectorAll('.diff-line-selected')).toHaveLength(1);
    expect(document.querySelectorAll('.diff-sbs-cell.ctx button')).toHaveLength(0);
    expect(document.querySelector('.diff-code')?.textContent).toBe('one');
    view.unmount();
  });

  it('selects ranges with Shift-click and allows disjoint toggles', async () => {
    const view = await renderViewer(request);
    await select(0);
    await select(2, true);
    expect(lineButtons().filter(isSelected)).toHaveLength(6);
    await select(1);
    expect(document.querySelector('.diff-selection-summary')?.textContent).toContain('2 changes selected');
    await click('Stage selection');
    expect(gitClient.applyDiffLineSelection).toHaveBeenCalledExactlyOnceWith({
      repoPath: request.repoPath,
      path: 'file.txt',
      source: 'unstaged',
      expectedDiff: diff,
      selectedUnitIds: ['hunk-1:0', 'hunk-1:2'],
    });
    expect(view.props.onRepoChanged).toHaveBeenCalledTimes(1);
    expect(gitClient.applyPatch).not.toHaveBeenCalled();
    view.unmount();
  });

  it('supports ranges across hunks and preserves them on an identical refresh', async () => {
    const text = [...header, '@@ -1 +1 @@', '-one', '+ONE', '@@ -20 +20 @@', '-two', '+TWO'].join('\n');
    getDiffPreview.mockResolvedValue(preview(text));
    const view = await renderViewer(request);
    await select(0);
    await select(2, true);
    await view.refresh();
    expect(document.querySelector('.diff-selection-summary')?.textContent).toContain('2 changes selected');
    await click('Stage selection');
    expect(vi.mocked(gitClient.applyDiffLineSelection).mock.calls[0][0].selectedUnitIds).toEqual(['hunk-1:0', 'hunk-2:0']);
    view.unmount();
  });

  it('clears selection before Escape reaches an enclosing dialog', async () => {
    const view = await renderViewer(request);
    const parent = vi.fn();
    document.addEventListener('keydown', parent);
    await select(0);
    lineButtons()[0].focus();
    expect(document.activeElement).toBe(lineButtons()[0]);
    await act(async () => {
      lineButtons()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(lineButtons().some(isSelected)).toBe(false);
    expect(parent).not.toHaveBeenCalled();
    expect(button('Stage selection').disabled).toBe(true);
    document.removeEventListener('keydown', parent);
    view.unmount();
  });

  it('clears selection with focus outside the code but leaves an unrelated dialog in control', async () => {
    const view = await renderViewer(request);
    await select(0);
    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    document.body.append(dialog);
    await act(async () => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(lineButtons().some(isSelected)).toBe(true);
    dialog.remove();
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(lineButtons().some(isSelected)).toBe(false);
    view.unmount();
  });

  it('resets selection on changed diff, file, source and repository', async () => {
    const view = await renderViewer(request);
    await select(0);
    getDiffPreview.mockResolvedValue(preview(diff.replace('ONE', 'external')));
    await view.refresh();
    expect(lineButtons().some(isSelected)).toBe(false);
    for (const next of [
      { ...request, path: 'other.txt' },
      { ...request, source: 'staged' as const },
      { ...request, repoPath: 'C:/other-repo' },
    ]) {
      await select(0);
      await view.rerender(next);
      expect(lineButtons().some(isSelected)).toBe(false);
    }
    view.unmount();
  });

  it('disables all staging actions during an application and handles errors without discarding selection', async () => {
    const pending = deferred<IpcResult<ApplyDiffLineSelectionResult>>();
    vi.mocked(gitClient.applyDiffLineSelection).mockReturnValue(pending.promise);
    const view = await renderViewer(request);
    await select(0);
    await click('Stage selection');
    expect(button('Stage block').disabled).toBe(true);
    expect(button('Discard block').disabled).toBe(true);
    expect(lineButtons().every((box) => box.disabled)).toBe(true);
    await act(async () => pending.resolve({ success: false, error: 'Index is locked' }));
    expect(dialogs.toast).toHaveBeenCalledWith(expect.stringContaining('Index is locked'), true);
    expect(lineButtons().filter(isSelected)).toHaveLength(2);
    expect(view.props.onRepoChanged).not.toHaveBeenCalled();
    view.unmount();
  });

  it('clears and reloads a stale selection, without retrying it', async () => {
    vi.mocked(gitClient.applyDiffLineSelection).mockResolvedValue({ success: true, data: { status: 'stale' } });
    const view = await renderViewer(request);
    await select(0);
    await click('Stage selection');
    expect(gitClient.applyDiffLineSelection).toHaveBeenCalledTimes(1);
    expect(lineButtons().some(isSelected)).toBe(false);
    expect(dialogs.toast).toHaveBeenCalledWith(expect.stringContaining('diff changed'), true);
    expect(view.props.onRepoChanged).not.toHaveBeenCalled();
    view.unmount();
  });

  it('ignores a late application result after navigating away and back to the same file', async () => {
    const pending = deferred<IpcResult<ApplyDiffLineSelectionResult>>();
    vi.mocked(gitClient.applyDiffLineSelection).mockReturnValue(pending.promise);
    const view = await renderViewer(request);
    await select(0);
    await click('Stage selection');
    await view.rerender({ ...request, path: 'other.txt' });
    await view.rerender(request);
    await act(async () => pending.resolve({ success: true, data: { status: 'applied' } }));
    expect(view.props.onRepoChanged).not.toHaveBeenCalled();
    expect(document.querySelector('.file-viewer')?.getAttribute('data-source')).toBe('unstaged');
    view.unmount();
  });

  it('unstages through the same selection API and offers no line-discard action', async () => {
    const view = await renderViewer({ ...request, source: 'staged' });
    expect(lineButtons()).toHaveLength(6);
    expect(lineButtons().every((control) => control.querySelector('.lucide-minus'))).toBe(true);
    await sideBySide();
    expect(lineButtons().every((control) => control.querySelector('.lucide-minus'))).toBe(true);
    await select(0);
    await click('Unstage selection');
    expect(vi.mocked(gitClient.applyDiffLineSelection).mock.calls[0][0].source).toBe('staged');
    expect(document.querySelector('.diff-selection-bar')?.textContent).not.toContain('Discard');
    view.unmount();
  });

  it.each(['commit', 'binary', 'truncated', 'symlink', 'conflict'] as const)('disables selection for %s previews', async (kind) => {
    const text =
      kind === 'binary'
        ? 'Binary files a/file.txt and b/file.txt differ\n'
        : kind === 'symlink'
          ? 'old mode 120000\n' + diff
          : kind === 'conflict'
            ? 'diff --cc file.txt\n@@@ -1,1 -1,1 +1,1 @@@\n++conflict\n'
            : diff;
    getDiffPreview.mockResolvedValue(preview(text, kind === 'truncated'));
    const view = await renderViewer(kind === 'commit' ? { ...viewerRequest('commit'), startView: 'diff' } : request);
    expect(lineButtons()).toHaveLength(0);
    expect(document.querySelector('.diff-selection-bar')).toBeNull();
    view.unmount();
  });

  it('navigates to the full staged diff when the last selected change is staged', async () => {
    let applied = false;
    getDiffPreview.mockImplementation(async (args) => preview(args.includes('--cached') || !applied ? diff : ''));
    vi.mocked(gitClient.applyDiffLineSelection).mockImplementation(async () => {
      applied = true;
      return { success: true, data: { status: 'applied' } };
    });
    const view = await renderViewer(request);
    await select(0);
    await select(2, true);
    await click('Stage selection');
    await vi.waitFor(() => expect(document.querySelector('.file-viewer')?.getAttribute('data-source')).toBe('staged'));
    expect(document.querySelector('.diff-selection-bar')?.textContent).toContain('Unstage selection');
    expect(lineButtons().some(isSelected)).toBe(false);
    view.unmount();
  });
});
