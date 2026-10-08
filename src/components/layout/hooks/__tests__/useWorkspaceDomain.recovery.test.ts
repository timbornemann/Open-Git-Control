import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceDomain } from '@/components/layout/hooks/useWorkspaceDomain';
import { appClient } from '@/services/appClient';
import {
  resetWorkingDirectoryNavigationGuardForTests,
  setActiveWorkingDirectoryNavigationGuard,
} from '@/components/working-directory/workingDirectoryNavigationGuard';

type Workspace = ReturnType<typeof useWorkspaceDomain>;

const flushEffects = async () => {
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
  });
};

const renderWorkspace = (setConfirmDialog = vi.fn()) => {
  let current: Workspace | null = null;
  const root: Root = createRoot(document.createElement('div'));
  const triggerRefresh = vi.fn();
  const setGitActionToast = vi.fn();
  const setInputDialog = vi.fn();
  const onRepoActivated = vi.fn();
  const onNoActiveRepo = vi.fn();
  const Harness = () => {
    current = useWorkspaceDomain({
      triggerRefresh,
      setConfirmDialog,
      setInputDialog,
      setGitActionToast,
      onRepoActivated,
      onNoActiveRepo,
      language: 'en',
    });
    return null;
  };
  act(() => root.render(createElement(Harness)));
  return {
    get current() {
      if (!current) throw new Error('Workspace hook did not render.');
      return current;
    },
    unmount: () => act(() => root.unmount()),
    setInputDialog,
    setGitActionToast,
    triggerRefresh,
    onRepoActivated,
  };
};

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(appClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(appClient, 'getStoredRepos').mockResolvedValue({ repos: [], activeRepo: null, sortBy: 'lastOpenedDesc' });
  vi.spyOn(appClient, 'setStoredRepos').mockResolvedValue(true);
  vi.spyOn(appClient, 'clearRepoPath').mockResolvedValue(true);
  vi.spyOn(appClient, 'resolveRepoPath').mockImplementation(async (repoPath) => repoPath);
});

afterEach(() => {
  resetWorkingDirectoryNavigationGuardForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useWorkspaceDomain repository recovery', () => {
  const missing = 'C:/old/demo';
  const moved = 'C:/new/demo';
  const record = { path: missing, pinned: true, lastOpened: 23, createdAt: 17 };
  beforeEach(() => {
    vi.spyOn(appClient, 'getStoredRepos').mockResolvedValue({ repos: [record], activeRepo: missing, sortBy: 'nameAsc' });
    vi.spyOn(appClient, 'setRepoPath').mockImplementation(async (repoPath) => repoPath);
    vi.spyOn(appClient, 'selectRepositoryLocation').mockResolvedValue({ success: true, data: moved });
    vi.spyOn(appClient, 'recheckRepository').mockResolvedValue({ success: true, data: missing });
  });
  it('rebinds the saved entry and reopens its graph without resetting pins or timestamps', async () => {
    const hook = renderWorkspace();
    await flushEffects();
    await act(async () => {
      expect(await hook.current.handleRecoverRepo(missing, true)).toBe(true);
    });
    expect(appClient.selectRepositoryLocation).toHaveBeenCalledWith({ repoPath: missing });
    expect(appClient.setRepoPath).toHaveBeenLastCalledWith(moved);
    expect(hook.current.openRepos).toEqual([moved]);
    expect(hook.current.activeRepo).toBe(moved);
    expect(hook.current.repoMeta[moved]).toEqual({ pinned: true, lastOpened: 23, createdAt: 17 });
    expect(hook.current.repoMeta[missing]).toBeUndefined();
    expect(hook.triggerRefresh).toHaveBeenCalled();
    expect(hook.onRepoActivated).toHaveBeenCalled();
    expect(appClient.setStoredRepos).toHaveBeenLastCalledWith({ repos: [{ ...record, path: moved }], activeRepo: moved, sortBy: 'nameAsc' });
    hook.unmount();
  });
  it('rechecks and refreshes the same active path without a new-location dialog', async () => {
    const hook = renderWorkspace();
    await flushEffects();
    await act(async () => {
      expect(await hook.current.handleRecoverRepo(missing, false)).toBe(true);
    });
    expect(appClient.recheckRepository).toHaveBeenCalledWith({ repoPath: missing });
    expect(appClient.selectRepositoryLocation).not.toHaveBeenCalled();
    expect(appClient.setRepoPath).toHaveBeenCalledTimes(2);
    expect(hook.triggerRefresh).toHaveBeenCalled();
    expect(hook.current.repoMeta[missing]).toEqual({ pinned: true, lastOpened: 23, createdAt: 17 });
    hook.unmount();
  });
  it('retains the relocated entry when activating it fails, and allows a normal reopen', async () => {
    const hook = renderWorkspace();
    await flushEffects();
    vi.mocked(appClient.setRepoPath).mockRejectedValueOnce(new Error('Interrupted commit requires recovery'));
    await act(async () => {
      expect(await hook.current.handleRecoverRepo(missing, true)).toBe(false);
    });
    expect(hook.current.openRepos).toEqual([moved]);
    expect(hook.current.activeRepo).toBeNull();
    expect(hook.current.repoMeta[moved].pinned).toBe(true);
    expect(hook.setGitActionToast).toHaveBeenCalledWith(expect.objectContaining({ isError: true, msg: expect.stringContaining('Interrupted commit') }));
    await act(async () => {
      expect(await hook.current.handleSwitchRepo(moved)).toBe(true);
    });
    expect(hook.current.activeRepo).toBe(moved);
    hook.unmount();
  });
  it('preserves the original entry after cancellation or an invalid replacement', async () => {
    const hook = renderWorkspace();
    await flushEffects();
    vi.mocked(appClient.selectRepositoryLocation).mockResolvedValueOnce({ success: true, data: null });
    await act(async () => {
      expect(await hook.current.handleRecoverRepo(missing, true)).toBe(false);
    });
    vi.mocked(appClient.selectRepositoryLocation).mockResolvedValueOnce({ success: false, error: 'Not a repository' });
    await act(async () => {
      await expect(hook.current.handleRecoverRepo(missing, true)).rejects.toThrow('Not a repository');
    });
    expect(hook.current.openRepos).toEqual([missing]);
    expect(hook.current.activeRepo).toBe(missing);
    expect(hook.current.repoMeta[missing].pinned).toBe(true);
    expect(appClient.setRepoPath).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
  it('does not activate a late recovery after the user switched to another repository', async () => {
    vi.spyOn(appClient, 'getStoredRepos').mockResolvedValue({ repos: [record, { ...record, path: 'C:/other' }], activeRepo: missing });
    let finish!: (value: { success: true; data: string }) => void;
    vi.mocked(appClient.selectRepositoryLocation).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const hook = renderWorkspace();
    await flushEffects();
    let recovery!: Promise<boolean>;
    await act(async () => {
      recovery = hook.current.handleRecoverRepo(missing, true);
      await Promise.resolve();
    });
    await act(async () => {
      await hook.current.handleSwitchRepo('C:/other');
    });
    await act(async () => {
      finish({ success: true, data: moved });
      expect(await recovery).toBe(false);
    });
    expect(hook.current.activeRepo).toBe('C:/other');
    expect(hook.current.openRepos).toContain(moved);
    expect(appClient.setRepoPath).toHaveBeenLastCalledWith('C:/other');
    hook.unmount();
  });
  it('respects the working-file guard before asking for a replacement and rejects a stale dialog', async () => {
    const hook = renderWorkspace();
    await flushEffects();
    setActiveWorkingDirectoryNavigationGuard((_target, _proceed, cancel) => cancel?.());
    await act(async () => {
      expect(await hook.current.handleRecoverRepo(missing, true)).toBe(false);
    });
    expect(appClient.selectRepositoryLocation).not.toHaveBeenCalled();
    await act(async () => {
      expect(await hook.current.handleRecoverRepo('C:/unrelated', false)).toBe(false);
    });
    expect(appClient.recheckRepository).not.toHaveBeenCalled();
    hook.unmount();
  });
});
