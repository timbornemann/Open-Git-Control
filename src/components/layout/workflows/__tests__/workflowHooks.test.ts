import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import { useGitCommandGuardWorkflow } from '@/components/layout/workflows/useGitCommandGuardWorkflow';
import { type GitCommandRunner, useGitSyncRecoveryWorkflow } from '@/components/layout/workflows/useGitSyncRecoveryWorkflow';
import { useInitialCommitRecoveryWorkflow } from '@/components/layout/workflows/useInitialCommitRecoveryWorkflow';

type HookRender<T> = {
  readonly current: T;
  unmount: () => void;
};

const renderHook = <T>(useHook: () => T): HookRender<T> => {
  let current: T | undefined;
  const container = document.createElement('div');
  const root: Root = createRoot(container);

  const TestComponent = () => {
    current = useHook();
    return null;
  };

  act(() => {
    root.render(createElement(TestComponent));
  });

  return {
    get current() {
      if (current === undefined) {
        throw new Error('Hook did not render.');
      }
      return current;
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
};

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workflow hooks', () => {
  it('fuehrt den Remote-ahead-Quick-Fix als stash, pull --rebase und stash pop aus', async () => {
    const runGitCommand = vi.fn<GitCommandRunner>().mockResolvedValue(true);
    const setGitActionToast = vi.fn();
    const hook = renderHook(() =>
      useGitSyncRecoveryWorkflow({
        runGitCommandRef: { current: runGitCommand },
        setActiveTab: vi.fn(),
        setConfirmDialog: vi.fn(),
        setGitActionToast,
        language: 'de',
      }),
    );

    await act(async () => {
      await hook.current.runRemoteAheadQuickFix({ command: 'push' });
    });

    expect(runGitCommand).toHaveBeenNthCalledWith(
      1,
      ['stash', 'push', '-u', '-m', 'Open Git Control quick sync fix'],
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ skipDirtyGuard: true, skipSyncMismatchRecovery: true }),
    );
    expect(runGitCommand).toHaveBeenNthCalledWith(
      2,
      ['pull', '--rebase'],
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ skipRemoteAheadDirtyGuard: true, skipSecretScan: true }),
    );
    expect(runGitCommand).toHaveBeenNthCalledWith(
      3,
      ['stash', 'pop'],
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ skipSecretScan: true }),
    );
    expect(setGitActionToast).toHaveBeenCalledWith(expect.objectContaining({ isError: false }));

    hook.unmount();
  });

  it('oeffnet bei pull-blocked-by-local-changes einen Autostash-Dialog', () => {
    const setActiveTab = vi.fn();
    const setConfirmDialog = vi.fn();
    const hook = renderHook(() =>
      useGitSyncRecoveryWorkflow({
        runGitCommandRef: { current: vi.fn<GitCommandRunner>() },
        setActiveTab,
        setConfirmDialog,
        setGitActionToast: vi.fn(),
        language: 'de',
      }),
    );

    const handled = hook.current.maybeHandleSyncMismatchFailure({
      command: 'pull',
      failureMessage: 'Please commit your changes or stash them before you merge.',
      args: ['pull'],
      successMsg: 'ok',
    });

    expect(handled).toBe(true);
    expect(setActiveTab).toHaveBeenCalledWith('repo');
    expect(setConfirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'danger',
        confirmLabel: expect.any(String),
        onConfirm: expect.any(Function),
      }),
    );

    hook.unmount();
  });

  it('blockiert Force-Push per Guard und bestaetigt danach mit skipDirtyGuard', async () => {
    const runGitCommand = vi.fn<GitCommandRunner>().mockResolvedValue(true);
    const setConfirmDialog = vi.fn();
    const hook = renderHook(() =>
      useGitCommandGuardWorkflow({
        runGitCommandRef: { current: runGitCommand },
        runRemoteAheadQuickFix: vi.fn(),
        settings: {
          confirmDangerousOps: true,
          language: 'de',
          secretScanBeforePushEnabled: false,
        },
        setConfirmDialog,
        setGitActionToast: vi.fn(),
      }),
    );

    const guarded = await hook.current.runGitCommandGuards({
      args: ['push', '--force'],
      command: 'push',
      successMsg: 'pushed',
    });

    expect(guarded).toBe(true);
    const dialog = setConfirmDialog.mock.calls[0]?.[0] as ConfirmDialogState;
    expect(dialog).toEqual(
      expect.objectContaining({
        variant: 'danger',
        irreversible: true,
        onConfirm: expect.any(Function),
      }),
    );

    await act(async () => {
      await dialog.onConfirm?.();
    });

    expect(runGitCommand).toHaveBeenCalledWith(['push', '--force'], 'pushed', undefined, expect.objectContaining({ skipDirtyGuard: true }));

    hook.unmount();
  });

  it('fragt vor automatischem Initial-Commit nach, wenn lokale Aenderungen vorhanden sind', async () => {
    (
      window as unknown as {
        electronAPI: {
          runGitCommand: ReturnType<typeof vi.fn>;
        };
      }
    ).electronAPI = {
      runGitCommand: vi.fn().mockResolvedValue({
        success: true,
        data: '?? README.md\n M src/app.ts',
      }),
    };
    const setActiveTab = vi.fn();
    const setConfirmDialog = vi.fn();
    const hook = renderHook(() =>
      useInitialCommitRecoveryWorkflow({
        recoverBareRepoForPush: vi.fn().mockResolvedValue(false),
        setActiveTab,
        setConfirmDialog,
        setGitActionToast: vi.fn(),
        language: 'de',
      }),
    );

    const opened = await hook.current.requestInitialCommitConfirmationIfNeeded({
      commandLabel: 'git push',
      confirmLabel: 'Committen',
      onConfirm: vi.fn(),
    });

    expect(opened).toBe(true);
    expect(setActiveTab).toHaveBeenCalledWith('repo');
    expect(setConfirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'danger',
        confirmLabel: 'Committen',
        onConfirm: expect.any(Function),
      }),
    );

    hook.unmount();
  });
});
