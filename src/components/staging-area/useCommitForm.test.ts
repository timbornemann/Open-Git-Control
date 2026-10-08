import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import { repositorySecretScanAllowlistClient } from '@/services/repositorySecretScanAllowlistClient';
import { gitClient } from '@/services/gitClient';
import { SECRET_SCAN_ALLOWLIST_PATH } from '@/types/repositorySecretScanAllowlist';
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
  vi.spyOn(gitClient, 'ensureCommitIdentity').mockResolvedValue(true);
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: 'Previous title' });
  vi.spyOn(gitClient, 'stagePaths').mockResolvedValue({ success: true, data: '' });
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
  it.each([false, true])('waits for identity before staging protection and preserves a cancelled commit draft (secret scan: %s)', async (scanEnabled) => {
    const identity = deferred<boolean>();
    vi.mocked(gitClient.ensureCommitIdentity).mockReturnValueOnce(identity.promise);
    const createCommit = vi.spyOn(gitClient, 'createCommit').mockResolvedValue({ success: true });
    let current!: ReturnType<typeof useCommitForm>;
    const root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      current = useCommitForm({
        repoPath: repoA,
        status,
        setToast: vi.fn(),
        refresh: vi.fn().mockResolvedValue(undefined),
        settings: { ...DEFAULT_SETTINGS, secretScanBeforeCommitEnabled: scanEnabled },
        setConfirmDialog: vi.fn(),
        onUpdateSettings: vi.fn().mockResolvedValue(undefined),
      });
      return null;
    };
    act(() => root.render(createElement(Harness)));
    act(() => {
      current.setCommitMsg('Keep my title');
      current.setCommitDescription('Keep my details');
    });
    let pending!: Promise<void>;
    act(() => {
      pending = current.handleCommit();
      void current.handleCommit();
    });
    expect(gitClient.ensureCommitIdentity).toHaveBeenCalledExactlyOnceWith(repoA);
    expect(gitClient.scanCommitSecrets).not.toHaveBeenCalled();
    expect(createCommit).not.toHaveBeenCalled();
    await act(async () => {
      identity.resolve(false);
      await pending;
    });
    expect(current.commitMsg).toBe('Keep my title');
    expect(current.commitDescription).toBe('Keep my details');
    expect(current.isCommitting).toBe(false);
    expect(gitClient.stagePaths).not.toHaveBeenCalled();
    await act(async () => {
      await current.handleCommit();
    });
    expect(createCommit).toHaveBeenCalledWith(expect.objectContaining({ repoPath: repoA, title: 'Keep my title', description: 'Keep my details' }));
    expect(gitClient.scanCommitSecrets).toHaveBeenCalledTimes(scanEnabled ? 1 : 0);
    act(() => root.unmount());
  });
  it('does not continue a prepared commit when its repository changes during identity setup', async () => {
    const identity = deferred<boolean>();
    vi.mocked(gitClient.ensureCommitIdentity).mockReturnValueOnce(identity.promise);
    const createCommit = vi.spyOn(gitClient, 'createCommit').mockResolvedValue({ success: true });
    let repoPath = repoA,
      current!: ReturnType<typeof useCommitForm>;
    const root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      current = useCommitForm({
        repoPath,
        status,
        setToast: vi.fn(),
        refresh: vi.fn().mockResolvedValue(undefined),
        settings: DEFAULT_SETTINGS,
        setConfirmDialog: vi.fn(),
        onUpdateSettings: vi.fn().mockResolvedValue(undefined),
      });
      return null;
    };
    act(() => root.render(createElement(Harness)));
    act(() => current.setCommitMsg('Old draft'));
    let pending!: Promise<void>;
    act(() => {
      pending = current.handleCommit();
    });
    repoPath = repoB;
    act(() => root.render(createElement(Harness)));
    act(() => current.setCommitMsg('New draft'));
    await act(async () => {
      identity.resolve(true);
      await pending;
    });
    expect(createCommit).not.toHaveBeenCalled();
    expect(gitClient.scanCommitSecrets).not.toHaveBeenCalled();
    expect(current.commitMsg).toBe('New draft');
    act(() => root.unmount());
  });
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
    await act(async () => {
      commitPromise = current!.handleCommit();
      await Promise.resolve();
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
    expect(gitClient.stagePaths).not.toHaveBeenCalled();
    expect(setToast).not.toHaveBeenCalledWith(expect.objectContaining({ isError: false }));
    act(() => root.unmount());
  });

  it('stages the updated allowlist before rescanning and committing findings', async () => {
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
    const scan = vi.spyOn(gitClient, 'scanCommitSecrets').mockResolvedValueOnce({
      success: true,
      data: { scanned: true, strictness: 'medium', findings, notes: [], stats: { checkedLines: 1, stagedLines: 1, toPushLines: 0, tagLines: 0 } },
    });
    scan.mockResolvedValue({
      success: true,
      data: { scanned: true, strictness: 'medium', findings: [], notes: [], stats: { checkedLines: 1, stagedLines: 1, toPushLines: 0, tagLines: 0 } },
    });
    const approve = vi.spyOn(gitClient, 'approveSecretScanCommit').mockResolvedValue({ success: true });
    const createCommit = vi.spyOn(gitClient, 'createCommit').mockResolvedValue({ success: true });
    vi.spyOn(repositorySecretScanAllowlistClient, 'get').mockResolvedValue({
      success: true,
      data: { repoPath: repoA, relativePath: '.Open-Git-Control/secret-scan-allowlist.txt', text: '', exists: false, version: 'missing' },
    });
    const save = vi
      .spyOn(repositorySecretScanAllowlistClient, 'addPaths')
      .mockResolvedValue({ success: true, data: { repoPath: repoA, relativePath: '', text: 'path:data.ini', exists: true, version: 'saved' } });
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

    expect(onUpdateSettings).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith({ repoPath: repoA, paths: ['data.ini'], expectedVersion: 'missing' });
    expect(gitClient.stagePaths).toHaveBeenCalledExactlyOnceWith([SECRET_SCAN_ALLOWLIST_PATH], repoA);
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(gitClient.stagePaths).mock.invocationCallOrder[0]);
    expect(vi.mocked(gitClient.stagePaths).mock.invocationCallOrder[0]).toBeLessThan(scan.mock.invocationCallOrder[1]);
    expect(scan.mock.invocationCallOrder[1]).toBeLessThan(createCommit.mock.invocationCallOrder[0]);
    expect(scan).toHaveBeenCalledTimes(2);
    expect(approve).not.toHaveBeenCalled();
    expect(createCommit).toHaveBeenCalledWith(expect.objectContaining({ repoPath: repoA }));
    act(() => root.unmount());
  });

  it.each(['save', 'stage'])('does not commit when the allowlist %s fails', async (failure) => {
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
    vi.spyOn(repositorySecretScanAllowlistClient, 'get').mockResolvedValue({
      success: true,
      data: { repoPath: repoA, relativePath: '.Open-Git-Control/secret-scan-allowlist.txt', text: '', exists: false, version: 'missing' },
    });
    vi.spyOn(repositorySecretScanAllowlistClient, 'addPaths').mockResolvedValue(
      failure === 'save'
        ? { success: false, error: 'Allowlist changed.' }
        : { success: true, data: { repoPath: repoA, relativePath: SECRET_SCAN_ALLOWLIST_PATH, text: 'path:data.ini', exists: true, version: 'saved' } },
    );
    if (failure === 'stage') vi.mocked(gitClient.stagePaths).mockResolvedValue({ success: false, error: 'The Git index is busy.' });
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
    expect(gitClient.scanCommitSecrets).toHaveBeenCalledTimes(1);
    expect(gitClient.stagePaths).toHaveBeenCalledTimes(failure === 'save' ? 0 : 1);
    expect(current!.commitMsg).toBe('feat: protect config');
    expect(setToast).toHaveBeenCalledWith(expect.objectContaining({ isError: true }));
    act(() => root.unmount());
  });

  it.each(['save', 'stage'])('does not continue the allowlist commit after switching repositories during %s', async (phase) => {
    const findings = [
      {
        id: 'finding',
        ruleId: 'secret',
        severity: 'high' as const,
        source: 'staged' as const,
        filePath: 'data.ini',
        lineNumber: 1,
        contextLine: '[REDACTED_SECRET]',
      },
    ];
    vi.mocked(gitClient.scanCommitSecrets).mockResolvedValueOnce({
      success: true,
      data: { scanned: true, strictness: 'medium', findings, notes: [], stats: { checkedLines: 1, stagedLines: 1, toPushLines: 0, tagLines: 0 } },
    });
    const policy = { repoPath: repoA, relativePath: SECRET_SCAN_ALLOWLIST_PATH, text: '', exists: false, version: 'missing' };
    vi.spyOn(repositorySecretScanAllowlistClient, 'get').mockResolvedValue({ success: true, data: policy });
    const pending = deferred<any>();
    vi.spyOn(repositorySecretScanAllowlistClient, 'addPaths').mockImplementation(() =>
      phase === 'save' ? pending.promise : Promise.resolve({ success: true, data: { ...policy, exists: true, text: 'path:data.ini', version: 'saved' } }),
    );
    if (phase === 'stage') vi.mocked(gitClient.stagePaths).mockReturnValue(pending.promise);
    const createCommit = vi.spyOn(gitClient, 'createCommit').mockResolvedValue({ success: true });
    const setConfirmDialog = vi.fn();
    const setToast = vi.fn();
    let repoPath = repoA;
    let current: ReturnType<typeof useCommitForm> | null = null;
    const root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      current = useCommitForm({
        repoPath,
        status,
        setToast,
        refresh: vi.fn().mockResolvedValue(undefined),
        settings: DEFAULT_SETTINGS,
        setConfirmDialog,
        onUpdateSettings: vi.fn(),
      });
      return null;
    };
    const render = () => root.render(createElement(Harness));
    act(render);
    act(() => current!.setCommitMsg('Commit in A'));
    await act(async () => {
      await current!.handleCommit();
    });
    let action!: Promise<void>;
    await act(async () => {
      action = setConfirmDialog.mock.calls[0][0].onSecondaryAction();
      for (let index = 0; index < 20; index++) await Promise.resolve();
    });
    repoPath = repoB;
    act(render);
    act(() => current!.setCommitMsg('Draft in B'));
    await act(async () => {
      pending.resolve(
        phase === 'save'
          ? { success: true, data: { ...policy, exists: true, text: 'path:data.ini', version: 'saved' } }
          : { success: false, error: 'Old repository staging failed.' },
      );
      await action;
    });
    expect(gitClient.stagePaths).toHaveBeenCalledTimes(phase === 'save' ? 0 : 1);
    if (phase === 'stage') expect(gitClient.stagePaths).toHaveBeenCalledWith([SECRET_SCAN_ALLOWLIST_PATH], repoA);
    expect(gitClient.scanCommitSecrets).toHaveBeenCalledTimes(1);
    expect(createCommit).not.toHaveBeenCalled();
    expect(setToast).not.toHaveBeenCalled();
    expect(current!.commitMsg).toBe('Draft in B');
    act(() => root.unmount());
  });

  it('lets the new repository scan immediately and suppresses a late error from the previous repository', async () => {
    const oldScan = deferred<any>();
    vi.spyOn(gitClient, 'scanCommitSecrets')
      .mockReturnValueOnce(oldScan.promise)
      .mockResolvedValueOnce({
        success: true,
        data: { scanned: true, strictness: 'medium', findings: [], notes: [], stats: { checkedLines: 0, stagedLines: 1, toPushLines: 0, tagLines: 0 } },
      });
    const createCommit = vi.spyOn(gitClient, 'createCommit').mockResolvedValue({ success: true });
    const setToast = vi.fn();
    let repoPath = repoA;
    let current: ReturnType<typeof useCommitForm> | null = null;
    const root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      current = useCommitForm({
        repoPath,
        status,
        setToast,
        refresh: vi.fn().mockResolvedValue(undefined),
        settings: DEFAULT_SETTINGS,
        setConfirmDialog: vi.fn(),
        onUpdateSettings: vi.fn().mockResolvedValue(undefined),
      });
      return null;
    };
    const render = () => root.render(createElement(Harness));
    act(render);
    act(() => current!.setCommitMsg('Commit in A'));
    let oldCommit!: Promise<void>;
    await act(async () => {
      oldCommit = current!.handleCommit();
      await Promise.resolve();
    });

    repoPath = repoB;
    act(render);
    act(() => current!.setCommitMsg('Commit in B'));
    await act(async () => {
      await current!.handleCommit();
    });

    expect(gitClient.scanCommitSecrets).toHaveBeenNthCalledWith(2, { repoPath: repoB });
    expect(createCommit).toHaveBeenCalledWith(expect.objectContaining({ repoPath: repoB, title: 'Commit in B' }));

    await act(async () => {
      oldScan.resolve({ success: false, error: 'old repository scan failed' });
      await oldCommit;
    });
    expect(setToast).not.toHaveBeenCalledWith(expect.objectContaining({ msg: 'old repository scan failed' }));
    act(() => root.unmount());
  });
});
