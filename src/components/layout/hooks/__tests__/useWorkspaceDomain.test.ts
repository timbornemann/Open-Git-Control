import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceDomain } from '@/components/layout/hooks/useWorkspaceDomain';
import { appClient } from '@/services/appClient';

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
  const onRepoActivated = vi.fn();
  const onNoActiveRepo = vi.fn();
  const Harness = () => {
    current = useWorkspaceDomain({
      triggerRefresh,
      setConfirmDialog,
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
  };
};

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(appClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(appClient, 'setStoredRepos').mockResolvedValue(true);
  vi.spyOn(appClient, 'clearRepoPath').mockResolvedValue(true);
  vi.spyOn(appClient, 'resolveRepoPath').mockImplementation(async (repoPath) => repoPath);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useWorkspaceDomain repository canonicalization', () => {
  it('migrates a stored subdirectory to the canonical root and deduplicates an existing root alias', async () => {
    vi.spyOn(appClient, 'getStoredRepos').mockResolvedValue({
      repos: [
        { path: 'C:\\Work\\Repo\\packages\\app', lastOpened: 20, pinned: false, createdAt: 10 },
        { path: 'c:/work/repo', lastOpened: 15, pinned: true, createdAt: 5 },
      ],
      activeRepo: 'c:/work/repo',
      sortBy: 'lastOpenedDesc',
    });
    vi.spyOn(appClient, 'resolveRepoPath').mockImplementation(async (repoPath) =>
      repoPath.toLowerCase().includes('c:\\work\\repo') || repoPath.toLowerCase().includes('c:/work/repo') ? 'C:\\Work\\Repo' : repoPath,
    );
    vi.spyOn(appClient, 'setRepoPath').mockResolvedValue('C:\\Work\\Repo');

    const hook = renderWorkspace();
    await flushEffects();
    await vi.waitFor(() => expect(hook.current.activeRepo).toBe('C:\\Work\\Repo'));
    expect(hook.current.openRepos).toEqual(['C:\\Work\\Repo']);
    expect(hook.current.repoMeta['C:\\Work\\Repo']).toEqual(expect.objectContaining({ pinned: true, createdAt: 5 }));
    await vi.waitFor(() =>
      expect(appClient.setStoredRepos).toHaveBeenLastCalledWith(
        expect.objectContaining({
          activeRepo: 'C:\\Work\\Repo',
          repos: [expect.objectContaining({ path: 'C:\\Work\\Repo', pinned: true, createdAt: 5 })],
        }),
      ),
    );
    hook.unmount();
  });

  it('closes repository-scoped confirmations synchronously before a switch IPC starts', async () => {
    vi.spyOn(appClient, 'getStoredRepos').mockResolvedValue({
      repos: [
        { path: 'C:/repo-a', lastOpened: 2, pinned: false, createdAt: 1 },
        { path: 'C:/repo-b', lastOpened: 1, pinned: false, createdAt: 1 },
      ],
      activeRepo: 'C:/repo-a',
      sortBy: 'lastOpenedDesc',
    });
    let resolveSwitch!: (path: string) => void;
    const switchPromise = new Promise<string>((resolve) => {
      resolveSwitch = resolve;
    });
    vi.spyOn(appClient, 'setRepoPath')
      .mockResolvedValueOnce('C:/repo-a')
      .mockImplementationOnce(() => switchPromise);
    const setConfirmDialog = vi.fn();
    const hook = renderWorkspace(setConfirmDialog);
    await flushEffects();
    await vi.waitFor(() => expect(hook.current.activeRepo).toBe('C:/repo-a'));

    let pendingSwitch!: Promise<void>;
    act(() => {
      pendingSwitch = hook.current.handleSwitchRepo('C:/repo-b');
    });
    expect(setConfirmDialog).toHaveBeenLastCalledWith(null);

    await act(async () => {
      resolveSwitch('C:/repo-b');
      await pendingSwitch;
    });
    expect(hook.current.activeRepo).toBe('C:/repo-b');
    hook.unmount();
  });

  it('ignores a late switch result after a newer repository selection', async () => {
    vi.spyOn(appClient, 'getStoredRepos').mockResolvedValue({
      repos: [
        { path: 'C:/repo-a', lastOpened: 3, pinned: false, createdAt: 1 },
        { path: 'C:/repo-b', lastOpened: 2, pinned: false, createdAt: 1 },
        { path: 'C:/repo-c', lastOpened: 1, pinned: false, createdAt: 1 },
      ],
      activeRepo: 'C:/repo-a',
      sortBy: 'lastOpenedDesc',
    });
    let resolveB!: (path: string) => void;
    const switchToB = new Promise<string>((resolve) => {
      resolveB = resolve;
    });
    vi.spyOn(appClient, 'setRepoPath')
      .mockResolvedValueOnce('C:/repo-a')
      .mockImplementationOnce(() => switchToB)
      .mockResolvedValueOnce('C:/repo-c');
    const hook = renderWorkspace();
    await flushEffects();
    await vi.waitFor(() => expect(hook.current.activeRepo).toBe('C:/repo-a'));

    let staleSwitch!: Promise<void>;
    await act(async () => {
      staleSwitch = hook.current.handleSwitchRepo('C:/repo-b');
      await hook.current.handleSwitchRepo('C:/repo-c');
    });
    await act(async () => {
      resolveB('C:/repo-b');
      await staleSwitch;
    });

    expect(hook.current.activeRepo).toBe('C:/repo-c');
    hook.unmount();
  });

  it('uses latest workspace state when an older close callback runs after a switch', async () => {
    vi.spyOn(appClient, 'getStoredRepos').mockResolvedValue({
      repos: [
        { path: 'C:/repo-a', lastOpened: 2, pinned: false, createdAt: 1 },
        { path: 'C:/repo-b', lastOpened: 1, pinned: false, createdAt: 1 },
      ],
      activeRepo: 'C:/repo-a',
      sortBy: 'lastOpenedDesc',
    });
    const setRepoPath = vi.spyOn(appClient, 'setRepoPath').mockResolvedValueOnce('C:/repo-a').mockResolvedValueOnce('C:/repo-b');
    const hook = renderWorkspace();
    await flushEffects();
    await vi.waitFor(() => expect(hook.current.activeRepo).toBe('C:/repo-a'));
    const staleClose = hook.current.handleCloseRepo;

    await act(async () => {
      await hook.current.handleSwitchRepo('C:/repo-b');
    });
    await act(async () => {
      await staleClose('C:/repo-a');
    });

    expect(hook.current.activeRepo).toBe('C:/repo-b');
    expect(hook.current.openRepos).toEqual(['C:/repo-b']);
    expect(setRepoPath).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it('shows stored repositories before a background path canonicalization completes', async () => {
    vi.spyOn(appClient, 'getStoredRepos').mockResolvedValue({
      repos: [
        { path: 'C:/repo-a', lastOpened: 2, pinned: false, createdAt: 1 },
        { path: 'C:/repo-b/packages/app', lastOpened: 1, pinned: false, createdAt: 1 },
      ],
      activeRepo: 'C:/repo-a',
      sortBy: 'lastOpenedDesc',
    });
    let resolveBackgroundPath!: (repoPath: string) => void;
    vi.spyOn(appClient, 'resolveRepoPath').mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveBackgroundPath = resolve;
        }),
    );
    vi.spyOn(appClient, 'setRepoPath').mockResolvedValue('C:/repo-a');

    const hook = renderWorkspace();
    await flushEffects();
    await vi.waitFor(() => expect(hook.current.activeRepo).toBe('C:/repo-a'));

    expect(hook.current.openRepos).toEqual(['C:/repo-a', 'C:/repo-b/packages/app']);
    expect(hook.current.isRestoringRepos).toBe(true);

    await act(async () => {
      resolveBackgroundPath('C:/repo-b');
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(hook.current.isRestoringRepos).toBe(false));
    expect(hook.current.openRepos).toEqual(['C:/repo-a', 'C:/repo-b']);
    hook.unmount();
  });

  it('does not lose stored repositories when a newer add wins during active repository validation', async () => {
    vi.spyOn(appClient, 'getStoredRepos').mockResolvedValue({
      repos: [{ path: 'C:/repo-a', lastOpened: 1, pinned: false, createdAt: 1 }],
      activeRepo: 'C:/repo-a',
      sortBy: 'lastOpenedDesc',
    });
    let resolveInitialActive!: (repoPath: string) => void;
    vi.spyOn(appClient, 'setRepoPath')
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveInitialActive = resolve;
          }),
      )
      .mockResolvedValueOnce('C:/repo-b');
    const hook = renderWorkspace();
    await flushEffects();

    expect(hook.current.openRepos).toEqual(['C:/repo-a']);
    await act(async () => {
      await hook.current.addOpenRepo('C:/repo-b');
    });
    await act(async () => {
      resolveInitialActive('C:/repo-a');
      await Promise.resolve();
    });

    expect(hook.current.activeRepo).toBe('C:/repo-b');
    expect(new Set(hook.current.openRepos)).toEqual(new Set(['C:/repo-a', 'C:/repo-b']));
    await vi.waitFor(() =>
      expect(appClient.setStoredRepos).toHaveBeenLastCalledWith(
        expect.objectContaining({
          repos: expect.arrayContaining([expect.objectContaining({ path: 'C:/repo-a' }), expect.objectContaining({ path: 'C:/repo-b' })]),
        }),
      ),
    );
    hook.unmount();
  });
});
