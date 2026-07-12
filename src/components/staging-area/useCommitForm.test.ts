import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import { appClient } from '@/services/appClient';
import { gitClient } from '@/services/gitClient';
import type { GitStatusWithConflicts } from './types';
import { clearCommitFormDraftsForTests } from './commitFormDraft';
import { useCommitForm } from './useCommitForm';

const repoA = 'C:\\repos\\a';
const repoB = 'C:\\repos\\b';
const status: GitStatusWithConflicts = {
  staged: [{ path: 'file.txt', x: 'M', y: ' ' }],
  unstaged: [],
  untracked: [],
  conflicts: [],
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

beforeEach(() => {
  clearCommitFormDraftsForTests();
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: 'Previous title' });
  vi.spyOn(gitClient, 'scanCommitSecrets').mockResolvedValue({
    success: true,
    data: { scanned: true, strictness: 'medium', findings: [], notes: [], stats: { checkedLines: 0, stagedLines: 0, toPushLines: 0, tagLines: 0 } },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useCommitForm repository isolation', () => {
  it('resets amend on repository changes and ignores a late success from the previous repository', async () => {
    const pendingCommit = deferred<{ success: boolean; error?: string }>();
    vi.spyOn(gitClient, 'createCommit').mockReturnValue(pendingCommit.promise);
    const setToast = vi.fn();
    let repoPath = repoA;
    let current: ReturnType<typeof useCommitForm> | null = null;
    const root: Root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      current = useCommitForm({
        repoPath,
        status,
        setToast,
        refresh: vi.fn().mockResolvedValue(undefined),
        settings: { ...DEFAULT_SETTINGS, secretScanBeforeCommitEnabled: false },
        setConfirmDialog: vi.fn(),
        onUpdateSettings: vi.fn().mockResolvedValue(undefined),
      });
      return null;
    };
    const render = () => root.render(createElement(Harness));
    act(render);
    act(() => {
      current!.setCommitMsg('Commit in A');
      current!.setAmendCommit(true);
    });

    let commitPromise!: Promise<void>;
    act(() => {
      commitPromise = current!.handleCommit();
    });
    expect(gitClient.createCommit).toHaveBeenCalledWith(expect.objectContaining({ repoPath: repoA, title: 'Commit in A' }));
    expect(current!.isCommitting).toBe(true);

    repoPath = repoB;
    act(render);
    expect(current!.amendCommit).toBe(false);
    act(() => current!.setCommitMsg('Draft in B'));

    await act(async () => {
      pendingCommit.resolve({ success: true });
      await commitPromise;
    });

    expect(current!.commitMsg).toBe('Draft in B');
    expect(current!.isCommitting).toBe(false);
    expect(setToast).not.toHaveBeenCalledWith(expect.objectContaining({ isError: false }));
    act(() => root.unmount());
  });

  it('turns amend off after a successful commit', async () => {
    vi.spyOn(gitClient, 'createCommit').mockResolvedValue({ success: true });
    const setToast = vi.fn();
    let current: ReturnType<typeof useCommitForm> | null = null;
    const root: Root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      current = useCommitForm({
        repoPath: repoA,
        status,
        setToast,
        refresh: vi.fn().mockResolvedValue(undefined),
        settings: DEFAULT_SETTINGS,
        setConfirmDialog: vi.fn(),
        onUpdateSettings: vi.fn().mockResolvedValue(undefined),
      });
      return null;
    };
    act(() => root.render(createElement(Harness)));
    act(() => {
      current!.setCommitMsg('Amended title');
      current!.setAmendCommit(true);
    });
    await act(async () => {
      await current!.handleCommit();
    });
    expect(current!.amendCommit).toBe(false);
    expect(setToast).not.toHaveBeenCalledWith(expect.objectContaining({ isError: false }));
    act(() => root.unmount());
  });

  it('opens the app dialog and persists an allowlist entry before committing findings', async () => {
    const findings = [
      {
        id: 'finding-1',
        ruleId: 'secret',
        severity: 'high' as const,
        source: 'staged' as const,
        filePath: 'data.ini',
        lineNumber: 1,
        contextLine: '[REDACTED_SECRET]',
      },
    ];
    vi.spyOn(gitClient, 'scanCommitSecrets').mockResolvedValue({
      success: true,
      data: { scanned: true, strictness: 'medium', findings, notes: [], stats: { checkedLines: 1, stagedLines: 1, toPushLines: 0, tagLines: 0 } },
    });
    const approve = vi.spyOn(gitClient, 'approveSecretScanCommit').mockResolvedValue({ success: true });
    const createCommit = vi.spyOn(gitClient, 'createCommit').mockResolvedValue({ success: true });
    vi.spyOn(appClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(appClient, 'getSettings').mockResolvedValue({ ...DEFAULT_SETTINGS, secretScanAllowlist: 'path:data.ini' });
    const setConfirmDialog = vi.fn();
    const onUpdateSettings = vi.fn().mockResolvedValue(undefined);
    let current: ReturnType<typeof useCommitForm> | null = null;
    const root: Root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      current = useCommitForm({
        repoPath: repoA,
        status,
        setToast: vi.fn(),
        refresh: vi.fn().mockResolvedValue(undefined),
        settings: DEFAULT_SETTINGS,
        setConfirmDialog,
        onUpdateSettings,
      });
      return null;
    };
    act(() => root.render(createElement(Harness)));
    act(() => current!.setCommitMsg('feat: protect config'));

    await act(async () => {
      await current!.handleCommit();
    });

    const dialog = setConfirmDialog.mock.calls[0]?.[0];
    expect(dialog).toEqual(expect.objectContaining({ secondaryActionLabel: 'Dateien allowlisten und committen' }));
    await act(async () => {
      await dialog.onSecondaryAction();
    });

    expect(onUpdateSettings).toHaveBeenCalledWith({ secretScanAllowlist: 'path:data.ini' });
    expect(approve).toHaveBeenCalledWith(repoA);
    expect(createCommit).toHaveBeenCalledWith(expect.objectContaining({ repoPath: repoA }));
    act(() => root.unmount());
  });

  it('does not commit when the allowlist update cannot be verified', async () => {
    const findings = [
      {
        id: 'finding-1',
        ruleId: 'secret',
        severity: 'high' as const,
        source: 'staged' as const,
        filePath: 'data.ini',
        lineNumber: 1,
        contextLine: '[REDACTED_SECRET]',
      },
    ];
    vi.spyOn(gitClient, 'scanCommitSecrets').mockResolvedValue({
      success: true,
      data: { scanned: true, strictness: 'medium', findings, notes: [], stats: { checkedLines: 1, stagedLines: 1, toPushLines: 0, tagLines: 0 } },
    });
    const approve = vi.spyOn(gitClient, 'approveSecretScanCommit').mockResolvedValue({ success: true });
    const createCommit = vi.spyOn(gitClient, 'createCommit').mockResolvedValue({ success: true });
    vi.spyOn(appClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(appClient, 'getSettings').mockResolvedValue({ ...DEFAULT_SETTINGS, secretScanAllowlist: '' });
    const setConfirmDialog = vi.fn();
    const setToast = vi.fn();
    let current: ReturnType<typeof useCommitForm> | null = null;
    const root: Root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      current = useCommitForm({
        repoPath: repoA,
        status,
        setToast,
        refresh: vi.fn().mockResolvedValue(undefined),
        settings: DEFAULT_SETTINGS,
        setConfirmDialog,
        onUpdateSettings: vi.fn().mockResolvedValue(undefined),
      });
      return null;
    };
    act(() => root.render(createElement(Harness)));
    act(() => current!.setCommitMsg('feat: protect config'));
    await act(async () => {
      await current!.handleCommit();
    });
    const dialog = setConfirmDialog.mock.calls[0]?.[0];
    await act(async () => {
      await dialog.onSecondaryAction();
    });

    expect(approve).not.toHaveBeenCalled();
    expect(createCommit).not.toHaveBeenCalled();
    expect(setToast).toHaveBeenCalledWith(expect.objectContaining({ isError: true }));
    act(() => root.unmount());
  });
});
