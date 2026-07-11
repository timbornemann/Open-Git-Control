import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import type { ConfirmDialogState, GitStatusWithConflicts } from './types';
import { useConflictResolver } from './useConflictResolver';

const repoPath = 'C:\\repos\\conflicted';
const firstPath = 'src/first.txt';
const secondPath = 'src/second.txt';
const conflictContent = ['before', '<<<<<<< HEAD', 'ours', '||||||| parent', 'base', '=======', 'theirs', '>>>>>>> topic', '', ''].join('\r\n');

const status: GitStatusWithConflicts = {
  staged: [],
  unstaged: [],
  untracked: [],
  conflicts: [
    { path: firstPath, x: 'U', y: 'U', code: 'UU' },
    { path: secondPath, x: 'U', y: 'U', code: 'UU' },
  ],
};

type HookValue = ReturnType<typeof useConflictResolver>;

const renderConflictResolver = () => {
  let current: HookValue | null = null;
  let confirmDialog: ConfirmDialogState | null = null;
  const setToast = vi.fn();
  const refresh = vi.fn().mockResolvedValue(undefined);
  const container = document.getElementById('root')!;
  const root: Root = createRoot(container);
  const Harness = () => {
    current = useConflictResolver({
      repoPath,
      status,
      setToast,
      setConfirmDialog: (next) => {
        confirmDialog = next;
      },
      git: vi.fn().mockResolvedValue(true),
      refresh,
      isConflictOnly: false,
      onOpenConflictResolver: vi.fn(),
    });
    return null;
  };
  act(() => root.render(createElement(Harness)));
  return { root, getCurrent: () => current!, getConfirmDialog: () => confirmDialog, setToast, refresh };
};

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'getSequencerState').mockResolvedValue({ success: true, data: { operation: null } });
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: '' });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useConflictResolver persistence safety', () => {
  it('persists the resolution produced by the visible choice buttons before staging it', async () => {
    vi.spyOn(gitClient, 'readRepoFile').mockResolvedValue({ success: true, data: conflictContent });
    const writeRepoFile = vi.spyOn(gitClient, 'writeRepoFile').mockResolvedValue({ success: true });
    const harness = renderConflictResolver();

    await act(async () => {
      await harness.getCurrent().openConflictEditor(firstPath);
    });
    expect(gitClient.readRepoFile).toHaveBeenCalledWith(firstPath, repoPath);
    expect(harness.getCurrent().conflictEditor?.content).toBe(conflictContent);
    act(() => harness.getCurrent().applyConflictChoiceToAll('ours'));
    const visibleDraft = harness.getCurrent().conflictEditor!.content;
    expect(visibleDraft).toContain('ours\r\n');
    expect(visibleDraft).not.toContain('base');
    expect(visibleDraft).not.toContain('<<<<<<<');
    await act(async () => {
      await harness.getCurrent().markConflictResolvedAndSync(firstPath);
    });

    expect(writeRepoFile).toHaveBeenCalledWith(firstPath, visibleDraft, repoPath);
    const stageCall = vi.mocked(gitClient.runGitCommandForRepo).mock.calls.find((call) => call[1] === 'conflictMarkResolved');
    expect(stageCall).toEqual([repoPath, 'conflictMarkResolved', firstPath]);
    expect(writeRepoFile.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(gitClient.runGitCommandForRepo).mock.invocationCallOrder.at(-1)!);
    expect(harness.getCurrent().conflictEditor).toBeNull();
    act(() => harness.root.unmount());
  });

  it('restores the original CRLF convention and preserves trailing empty lines for manual drafts', async () => {
    vi.spyOn(gitClient, 'readRepoFile').mockResolvedValue({ success: true, data: conflictContent });
    const writeRepoFile = vi.spyOn(gitClient, 'writeRepoFile').mockResolvedValue({ success: true });
    const harness = renderConflictResolver();

    await act(async () => {
      await harness.getCurrent().openConflictEditor(firstPath);
    });
    act(() => harness.getCurrent().onConflictEditorContentChange(firstPath, 'resolved\n\n\n'));
    await act(async () => {
      await harness.getCurrent().markConflictResolvedAndSync(firstPath);
    });

    expect(writeRepoFile).toHaveBeenCalledWith(firstPath, 'resolved\r\n\r\n\r\n', repoPath);
    act(() => harness.root.unmount());
  });

  it('rejects malformed raw markers instead of writing or staging them', async () => {
    vi.spyOn(gitClient, 'readRepoFile').mockResolvedValue({ success: true, data: conflictContent });
    const writeRepoFile = vi.spyOn(gitClient, 'writeRepoFile').mockResolvedValue({ success: true });
    const harness = renderConflictResolver();

    await act(async () => {
      await harness.getCurrent().openConflictEditor(firstPath);
    });
    act(() => harness.getCurrent().onConflictEditorContentChange(firstPath, '<<<<<<< HEAD\nleft only\n||||||| parent\nbase\n'));
    await act(async () => {
      await harness.getCurrent().saveConflictEditor(true);
    });

    expect(writeRepoFile).not.toHaveBeenCalled();
    expect(vi.mocked(gitClient.runGitCommandForRepo).mock.calls.some((call) => call[1] === 'conflictMarkResolved')).toBe(false);
    expect(harness.setToast).toHaveBeenCalledWith(expect.objectContaining({ isError: true }));
    act(() => harness.root.unmount());
  });

  it('requires confirmation before navigating away from a dirty conflict draft', async () => {
    const readRepoFile = vi.spyOn(gitClient, 'readRepoFile').mockImplementation(async (path) => ({ success: true, data: `${path}\n${conflictContent}` }));
    const harness = renderConflictResolver();

    await act(async () => {
      await harness.getCurrent().openConflictEditor(firstPath);
    });
    const readsBeforeNavigation = readRepoFile.mock.calls.length;
    act(() => harness.getCurrent().onConflictEditorContentChange(firstPath, 'unsaved draft'));
    await act(async () => {
      await harness.getCurrent().openConflictEditor(secondPath);
    });

    expect(readRepoFile).toHaveBeenCalledTimes(readsBeforeNavigation);
    expect(harness.getCurrent().conflictEditor?.filePath).toBe(firstPath);
    expect(harness.getConfirmDialog()).toMatchObject({ irreversible: true });

    await act(async () => {
      await harness.getConfirmDialog()!.onConfirm?.();
    });
    expect(readRepoFile).toHaveBeenCalledTimes(readsBeforeNavigation + 1);
    expect(harness.getCurrent().conflictEditor?.filePath).toBe(secondPath);
    act(() => harness.root.unmount());
  });
});
