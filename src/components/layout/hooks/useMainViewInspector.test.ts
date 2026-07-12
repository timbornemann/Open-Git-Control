import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getActiveWorkingDirectoryFilePath, useMainViewInspector } from './useMainViewInspector';

type Inspector = ReturnType<typeof useMainViewInspector>;

const renderInspector = (initialRepo: string | null) => {
  let current: Inspector | null = null;
  let currentRepo = initialRepo;
  let autoOpenConflictResolverPath: string | null = null;
  const root: Root = createRoot(document.createElement('div'));
  const setSelectedCommit = vi.fn();
  const onAutoOpenConflictResolverConsumed = vi.fn();
  const Harness = () => {
    current = useMainViewInspector({
      activeRepo: currentRepo,
      autoOpenConflictResolverPath,
      onAutoOpenConflictResolverConsumed,
      setSelectedCommit,
      onOpenRepoWorkspace: vi.fn(),
      onCloseReleaseCreator: vi.fn(),
    });
    return null;
  };
  const render = () => {
    act(() => root.render(createElement(Harness)));
  };

  render();
  return {
    get current() {
      if (!current) throw new Error('Inspector hook did not render.');
      return current;
    },
    rerender: (activeRepo: string | null) => {
      currentRepo = activeRepo;
      render();
    },
    autoOpenConflict: (path: string) => {
      autoOpenConflictResolverPath = path;
      render();
    },
    onAutoOpenConflictResolverConsumed,
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

describe('useMainViewInspector working-directory viewer binding', () => {
  it('hides a working-directory file immediately when it belongs to another repository', () => {
    expect(getActiveWorkingDirectoryFilePath({ path: 'src/index.ts', repoPath: 'C:/repositories/a' }, 'C:/repositories/b')).toBeNull();
  });

  it('does not expose a file selected in repository A after switching to repository B', () => {
    const hook = renderInspector('C:/repositories/a');

    act(() => hook.current.handleOpenWorkingDirectoryFile('src/index.ts'));
    expect(hook.current.workingDirectoryFilePath).toBe('src/index.ts');

    hook.rerender('C:/repositories/b');
    expect(hook.current.workingDirectoryFilePath).toBeNull();
    hook.unmount();
  });

  it('keeps the working file open until guarded staging navigation proceeds', () => {
    const hook = renderInspector('C:/repositories/a');
    let proceed: (() => void) | undefined;
    act(() => hook.current.handleOpenWorkingDirectoryFile('src/index.ts'));
    act(() => hook.current.setWorkingDirectoryNavigationGuard((_target, next) => (proceed = next)));

    act(() => hook.current.handleStageCommitOpen());
    expect(hook.current.workingDirectoryFilePath).toBe('src/index.ts');
    act(() => proceed?.());
    expect(hook.current.workingDirectoryFilePath).toBeNull();
    hook.unmount();
  });

  it('defers diff routes that would replace the working-file editor', () => {
    const hook = renderInspector('C:/repositories/a');
    let proceed: (() => void) | undefined;
    act(() => hook.current.handleOpenWorkingDirectoryFile('src/index.ts'));
    act(() => hook.current.setWorkingDirectoryNavigationGuard((_target, next) => (proceed = next)));

    act(() => hook.current.handleOpenDiff({ source: 'unstaged', path: 'src/index.ts' }));
    expect(hook.current.activeDiffRequest).toBeNull();
    act(() => proceed?.());
    expect(hook.current.activeDiffRequest).toEqual({ source: 'unstaged', path: 'src/index.ts' });
    expect(hook.current.workingDirectoryFilePath).toBeNull();
    hook.unmount();
  });

  it('closes the working-file editor when guarded automatic conflict navigation proceeds', () => {
    const hook = renderInspector('C:/repositories/a');
    let proceed: (() => void) | undefined;
    act(() => hook.current.handleOpenWorkingDirectoryFile('src/index.ts'));
    act(() => hook.current.setWorkingDirectoryNavigationGuard((_target, next) => (proceed = next)));

    hook.autoOpenConflict('src/conflicted.ts');
    expect(hook.current.activeConflictPath).toBeNull();
    expect(hook.current.workingDirectoryFilePath).toBe('src/index.ts');

    act(() => proceed?.());
    expect(hook.current.activeConflictPath).toBe('src/conflicted.ts');
    expect(hook.current.workingDirectoryFilePath).toBeNull();
    expect(hook.onAutoOpenConflictResolverConsumed).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it('closes the working-file editor for recovery and manual conflict destinations', () => {
    const hook = renderInspector('C:/repositories/a');

    act(() => hook.current.handleOpenWorkingDirectoryFile('src/index.ts'));
    act(() => hook.current.handleToggleRecoveryCenter());
    expect(hook.current.showRecoveryCenter).toBe(true);
    expect(hook.current.workingDirectoryFilePath).toBeNull();

    act(() => hook.current.handleOpenWorkingDirectoryFile('src/index.ts'));
    act(() => hook.current.handleOpenConflictResolver('src/conflicted.ts'));
    expect(hook.current.activeConflictPath).toBe('src/conflicted.ts');
    expect(hook.current.workingDirectoryFilePath).toBeNull();
    hook.unmount();
  });
});
