import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepositoryRemoteSync } from '@/components/layout/hooks/useRepositoryRemoteSync';
import { gitClient } from '@/services/gitClient';

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
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useRepositoryRemoteSync', () => {
  it('fetches only the resolved remote and never removes it after an ambiguous 404 response', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'getBranchStatusPorcelainV2').mockResolvedValue({ success: true, data: '# branch.head main\n' });
    const runGitCommand = vi.spyOn(gitClient, 'runGitCommand').mockResolvedValue({
      success: false,
      error: "fatal: unable to access 'https://github.com/acme/demo.git/': The requested URL returned error: 404",
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

    expect(runGitCommand).toHaveBeenCalledWith('fetch', 'origin', '--prune', '--tags', '--quiet');
    expect(runGitCommand.mock.calls.some(([command, ...args]) => command === 'fetch' && args.includes('--all'))).toBe(false);
    expect(removeRemote).not.toHaveBeenCalled();
    expect(hook.current.remoteSync.lastFetchError).toContain('404');

    hook.unmount();
  });

  it('does not attempt a fetch when the repository has no remote', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'getBranchStatusPorcelainV2').mockResolvedValue({ success: true, data: '# branch.head main\n' });
    const runGitCommand = vi.spyOn(gitClient, 'runGitCommand').mockResolvedValue({ success: true, data: '' });
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

    expect(runGitCommand).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('fetches the tracked upstream remote when it is not named origin', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'getBranchStatusPorcelainV2').mockResolvedValue({
      success: true,
      data: '# branch.head feature\n# branch.upstream upstream/feature\n# branch.ab +0 -0\n',
    });
    const runGitCommand = vi.spyOn(gitClient, 'runGitCommand').mockResolvedValue({ success: true, data: '' });
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

    expect(runGitCommand).toHaveBeenCalledWith('fetch', 'upstream', '--prune', '--tags', '--quiet');
    expect(runGitCommand.mock.calls.some(([command, ...args]) => command === 'fetch' && args.includes('origin'))).toBe(false);
    hook.unmount();
  });
});
