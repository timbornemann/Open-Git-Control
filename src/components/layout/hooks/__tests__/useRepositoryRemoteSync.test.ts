import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepositoryRemoteSync } from '@/components/layout/hooks/useRepositoryRemoteSync';
import { gitClient } from '@/services/gitClient';
import { transferClient } from '@/services/hostingClient';

type HookRender<T> = {
  readonly current: T;
  unmount: () => void;
};

const renderHook = <T>(useHook: () => T): HookRender<T> => {
  let current: T | undefined;
  const root: Root = createRoot(document.createElement('div'));
  const TestComponent = () => {
    current = useHook();
    return null;
  };

  act(() => root.render(createElement(TestComponent)));
  return {
    get current() {
      if (current === undefined) throw new Error('Hook did not render.');
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
  vi.spyOn(transferClient, 'request').mockImplementation(async (operation) => (operation === 'getPreferences' ? {} : { output: '' }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useRepositoryRemoteSync', () => {
  it('fetches only the resolved remote and never removes it after an ambiguous 404 response', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    const runGitCommandForRepo = vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: '# branch.head main\n' });
    vi.mocked(transferClient.request).mockImplementation(async (operation) => {
      if (operation === 'getPreferences') return {};
      throw new Error("fatal: unable to access 'https://github.com/acme/demo.git/': The requested URL returned error: 404");
    });
    const removeRemote = vi.spyOn(gitClient, 'removeRemote').mockResolvedValue({ success: true, data: '' });
    const triggerRefresh = vi.fn();
    const setGitActionToast = vi.fn();
    const setActiveGitActionLabel = vi.fn();
    const isGitActionRunningRef = { current: false };

    const hook = renderHook(() =>
      useRepositoryRemoteSync({
        activeRepo: 'C:\\repos\\demo',
        refreshTrigger: 0,
        triggerRefresh,
        autoFetchIntervalMs: 60_000,
        language: 'en',
        hasAnyRemote: true,
        remotes: [{ name: 'origin', url: 'https://github.com/acme/demo.git' }],
        setGitActionToast,
        setActiveGitActionLabel,
        isGitActionRunningRef,
      }),
    );

    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    expect(runGitCommandForRepo).toHaveBeenCalledWith('C:\\repos\\demo', 'status', '--porcelain=v2', '--branch');
    expect(transferClient.request).toHaveBeenCalledWith('getPreferences', { repoPath: 'C:\\repos\\demo' });
    expect(transferClient.request).toHaveBeenCalledWith('fetch', { repoPath: 'C:\\repos\\demo', remote: 'origin' });
    expect(runGitCommandForRepo.mock.calls.some(([, command]) => command === 'fetch')).toBe(false);
    expect(removeRemote).not.toHaveBeenCalled();
    expect(hook.current.remoteSync.lastFetchError).toContain('404');

    hook.unmount();
  });

  it('does not attempt a fetch when the repository has no remote', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    const runGitCommandForRepo = vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: '' });
    const triggerRefresh = vi.fn();
    const setGitActionToast = vi.fn();
    const setActiveGitActionLabel = vi.fn();
    const isGitActionRunningRef = { current: false };

    const hook = renderHook(() =>
      useRepositoryRemoteSync({
        activeRepo: 'C:\\repos\\demo',
        refreshTrigger: 0,
        triggerRefresh,
        autoFetchIntervalMs: 60_000,
        language: 'en',
        hasAnyRemote: false,
        remotes: [],
        setGitActionToast,
        setActiveGitActionLabel,
        isGitActionRunningRef,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(runGitCommandForRepo.mock.calls.some(([, command]) => command === 'fetch')).toBe(false);
    expect(transferClient.request).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('refreshes local repository state instead of doing nothing when the fetch button is used on a repo with no remote', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    const runGitCommandForRepo = vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: '' });
    const triggerRefresh = vi.fn();
    const setGitActionToast = vi.fn();
    const setActiveGitActionLabel = vi.fn();
    const isGitActionRunningRef = { current: false };

    const hook = renderHook(() =>
      useRepositoryRemoteSync({
        activeRepo: 'C:\\repos\\local-only',
        refreshTrigger: 0,
        triggerRefresh,
        autoFetchIntervalMs: 60_000,
        language: 'en',
        hasAnyRemote: false,
        remotes: [],
        setGitActionToast,
        setActiveGitActionLabel,
        isGitActionRunningRef,
      }),
    );

    // Let the initial mount-triggered background refresh settle first, then
    // simulate an explicit click on the Fetch button (showToast = true).
    await act(async () => {
      await Promise.resolve();
    });
    triggerRefresh.mockClear();
    setGitActionToast.mockClear();

    let result: boolean | undefined;
    await act(async () => {
      result = await hook.current.refreshRemoteState(true);
    });

    expect(result).toBe(true);
    expect(triggerRefresh).toHaveBeenCalledTimes(1);
    expect(runGitCommandForRepo.mock.calls.some(([, command]) => command === 'fetch')).toBe(false);
    expect(transferClient.request).not.toHaveBeenCalled();
    expect(setGitActionToast).toHaveBeenCalledWith(expect.objectContaining({ isError: false }));
    hook.unmount();
  });

  it('fetches the tracked upstream remote when it is not named origin', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    const runGitCommandForRepo = vi.spyOn(gitClient, 'runGitCommandForRepo').mockImplementation(async (_repoPath, command) => {
      if (command === 'status') {
        return { success: true, data: '# branch.head feature\n# branch.upstream upstream/feature\n# branch.ab +0 -0\n' };
      }
      if (command === 'forEachRef') {
        return { success: true, data: `refs/ogc/remote-tags/upstream/v3.0.0\0${'a'.repeat(40)}\0\n` };
      }
      return { success: true, data: '' };
    });
    const triggerRefresh = vi.fn();
    const setGitActionToast = vi.fn();
    const setActiveGitActionLabel = vi.fn();
    const isGitActionRunningRef = { current: false };

    const hook = renderHook(() =>
      useRepositoryRemoteSync({
        activeRepo: 'C:\\repos\\fork',
        refreshTrigger: 0,
        triggerRefresh,
        autoFetchIntervalMs: 60_000,
        language: 'en',
        hasAnyRemote: true,
        remotes: [{ name: 'upstream', url: 'https://github.com/acme/demo.git' }],
        setGitActionToast,
        setActiveGitActionLabel,
        isGitActionRunningRef,
      }),
    );

    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    expect(transferClient.request).toHaveBeenCalledWith('fetch', { repoPath: 'C:\\repos\\fork', remote: 'upstream' });
    expect(transferClient.request).toHaveBeenCalledWith('fetch', { repoPath: 'C:\\repos\\fork', remote: 'upstream', tagsOnly: true });
    expect(runGitCommandForRepo).toHaveBeenCalledWith(
      'C:\\repos\\fork',
      'forEachRef',
      '--format=%(refname)%00%(objectname)%00%(*objectname)',
      'refs/tags',
      'refs/ogc/remote-tags/upstream/',
    );
    expect(runGitCommandForRepo).toHaveBeenCalledWith('C:\\repos\\fork', 'adoptRemoteTag', 'upstream', 'v3.0.0');
    expect(runGitCommandForRepo.mock.calls.some(([, command]) => command === 'fetch')).toBe(false);
    hook.unmount();
  });

  it('prefers the saved private Forgejo source over the branch tracking its GitHub backup', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    const commands = vi.spyOn(gitClient, 'runGitCommandForRepo').mockImplementation(async (_repoPath, command) => ({
      success: true,
      data: command === 'status' ? '# branch.head main\n# branch.upstream backup/main\n# branch.ab +0 -0\n' : '',
    }));
    vi.mocked(transferClient.request).mockImplementation(async (operation) => (operation === 'getPreferences' ? { fetchRemote: 'private' } : { output: '' }));
    const triggerRefresh = vi.fn();
    const setGitActionToast = vi.fn();
    const setActiveGitActionLabel = vi.fn();
    const isGitActionRunningRef = { current: false };
    const hook = renderHook(() =>
      useRepositoryRemoteSync({
        activeRepo: 'C:/repos/mirrored',
        refreshTrigger: 0,
        triggerRefresh,
        autoFetchIntervalMs: 60_000,
        language: 'en',
        hasAnyRemote: true,
        remotes: [
          { name: 'private', url: 'https://forgejo.example/team/private.git' },
          { name: 'backup', url: 'https://github.com/team/private.git' },
        ],
        setGitActionToast,
        setActiveGitActionLabel,
        isGitActionRunningRef,
      }),
    );
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    expect(transferClient.request).toHaveBeenCalledWith('fetch', { repoPath: 'C:/repos/mirrored', remote: 'private' });
    expect(transferClient.request).toHaveBeenCalledWith('fetch', { repoPath: 'C:/repos/mirrored', remote: 'private', tagsOnly: true });
    expect(vi.mocked(transferClient.request).mock.calls.filter(([operation]) => operation === 'fetch')).toHaveLength(2);
    expect(commands.mock.calls.some(([, command]) => command === 'fetch')).toBe(false);
    expect(hook.current.lastFetchedRemote).toBe('private');
    expect(triggerRefresh).toHaveBeenCalledOnce();
    hook.unmount();
  });

  it('surfaces private-account authentication failure without switching endpoint or using ambient Git credentials', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    const commands = vi
      .spyOn(gitClient, 'runGitCommandForRepo')
      .mockResolvedValue({ success: true, data: '# branch.head main\n# branch.upstream origin/main\n' });
    vi.mocked(transferClient.request).mockImplementation(async (operation) => {
      if (operation === 'getPreferences') return { fetchRemote: 'private' };
      throw new Error('The account bound to this private endpoint is not authenticated.');
    });
    const triggerRefresh = vi.fn();
    const setGitActionToast = vi.fn();
    const setActiveGitActionLabel = vi.fn();
    const isGitActionRunningRef = { current: false };
    const hook = renderHook(() =>
      useRepositoryRemoteSync({
        activeRepo: 'C:/repos/private',
        refreshTrigger: 0,
        triggerRefresh,
        autoFetchIntervalMs: 60_000,
        language: 'en',
        hasAnyRemote: true,
        remotes: [
          { name: 'private', url: 'https://forgejo.example/team/private.git' },
          { name: 'origin', url: 'https://github.com/team/private.git' },
        ],
        setGitActionToast,
        setActiveGitActionLabel,
        isGitActionRunningRef,
      }),
    );
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    expect(vi.mocked(transferClient.request).mock.calls.filter(([operation]) => operation === 'fetch')).toEqual([
      ['fetch', { repoPath: 'C:/repos/private', remote: 'private' }],
    ]);
    expect(commands.mock.calls.some(([, command]) => command === 'fetch')).toBe(false);
    expect(hook.current.remoteSync.lastFetchError).toContain('not authenticated');
    expect(hook.current.lastFetchedRemote).toBeNull();
    expect(triggerRefresh).not.toHaveBeenCalled();
    hook.unmount();
  });
});
