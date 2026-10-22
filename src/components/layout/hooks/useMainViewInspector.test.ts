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
    setSelectedCommit,
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
  it.each(['staged', 'unstaged'] as const)('opens one %s diff and restores it after visiting file history', (source) => {
    const hook = renderInspector('C:/repositories/a');
    const hash = 'a'.repeat(40);
    const guard = vi.fn((_target, proceed: () => void) => proceed());
    act(() => hook.current.setWorkingDirectoryNavigationGuard(guard));
    act(() => hook.current.handleSelectWorkingTreeFile('renamed.ts', source));
    expect(guard).toHaveBeenCalledOnce();
    expect(hook.current.activeDiffRequest).toEqual({ source, path: 'renamed.ts' });
    act(() => hook.current.handleSelectCommitFromWorkingTree(hash, 'original.ts'));
    expect(hook.current.activeDiffRequest).toEqual({ source: 'commit', path: 'original.ts', commitHash: hash });
    expect(hook.current.workingTreeSelection).toBeNull();
    expect(hook.current.isCommitInspectorOpen).toBe(true);
    act(() => hook.current.handleCommitBack());
    expect(hook.current.activeDiffRequest).toEqual({ source, path: 'renamed.ts' });
    expect(hook.current.workingTreeSelection).toEqual({ source, path: 'renamed.ts' });
    expect(hook.current.isCommitInspectorOpen).toBe(false);
    expect(hook.setSelectedCommit).toHaveBeenLastCalledWith(null);
    hook.unmount();
  });

  it('closes working-file details while keeping the diff open', () => {
    const hook = renderInspector('C:/repositories/a');
    act(() => hook.current.handleSelectWorkingTreeFile('file.ts', 'unstaged'));
    act(() => hook.current.closeWorkingTreeFileDetails());
    expect(hook.current.workingTreeSelection).toBeNull();
    expect(hook.current.activeDiffRequest).toEqual({ source: 'unstaged', path: 'file.ts' });
    hook.unmount();
  });

  it('guards file history and drops a delayed working-file navigation after a repository switch', () => {
    const hook = renderInspector('C:/repositories/a');
    act(() => hook.current.handleSelectWorkingTreeFile('file.ts', 'unstaged'));
    let proceed: (() => void) | undefined;
    act(() =>
      hook.current.setWorkingDirectoryNavigationGuard((_target, next) => {
        proceed = next;
      }),
    );
    act(() => hook.current.handleSelectCommitFromWorkingTree('a'.repeat(40)));
    expect(hook.current.activeDiffRequest?.source).toBe('unstaged');
    hook.rerender('C:/repositories/b');
    act(() => proceed?.());
    expect(hook.current.activeDiffRequest).toBeNull();
    expect(hook.current.commitHistoryStack).toHaveLength(0);
    hook.unmount();
  });

  it('restores the captured commit diff only after the navigation guard proceeds', () => {
    const hook = renderInspector('C:/repositories/a');
    const first = 'a'.repeat(40),
      second = 'b'.repeat(40);
    const original = { source: 'commit' as const, path: 'original/file.ts', commitHash: first };
    act(() => hook.current.handleOpenDiff(original));
    act(() => hook.current.handleSelectCommitFromHistory(second, first));
    act(() => hook.current.handleOpenWorkingDirectoryFile('unsaved.ts'));
    let proceed: (() => void) | undefined;
    act(() =>
      hook.current.setWorkingDirectoryNavigationGuard((_target, next) => {
        proceed = next;
      }),
    );
    act(() => hook.current.handleCommitBack());
    expect(hook.current.workingDirectoryFilePath).toBe('unsaved.ts');
    expect(hook.current.commitHistoryStack).toHaveLength(1);
    act(() => proceed?.());
    expect(hook.current.activeDiffRequest).toEqual(original);
    expect(hook.current.workingDirectoryFilePath).toBeNull();
    expect(hook.current.commitHistoryStack).toHaveLength(0);
    expect(hook.setSelectedCommit).toHaveBeenLastCalledWith(first);
    hook.unmount();
  });

  it('does not restore a captured diff into a different repository after a delayed guard', () => {
    const hook = renderInspector('C:/repositories/a');
    const first = 'a'.repeat(40),
      second = 'b'.repeat(40);
    act(() => hook.current.handleOpenDiff({ source: 'commit', path: 'file.ts', commitHash: first }));
    act(() => hook.current.handleSelectCommitFromHistory(second, first));
    let proceed: (() => void) | undefined;
    act(() =>
      hook.current.setWorkingDirectoryNavigationGuard((_target, next) => {
        proceed = next;
      }),
    );
    act(() => hook.current.handleCommitBack());
    hook.rerender('C:/repositories/b');
    act(() => proceed?.());
    expect(hook.current.activeDiffRequest).toBeNull();
    expect(hook.current.commitHistoryStack).toHaveLength(0);
    hook.unmount();
  });
  it('preserves requested editor positions through guarded navigation and removes them on repository change', () => {
    const hook = renderInspector('C:/repositories/a');
    let proceed: (() => void) | undefined;
    act(() => hook.current.setWorkingDirectoryNavigationGuard((_target, next) => (proceed = next)));
    act(() => hook.current.handleOpenWorkingDirectoryFile('src/index.ts', { line: 17, column: 4 }));
    expect(hook.current.workingDirectoryFilePath).toBeNull();
    expect(hook.current.workingDirectoryFilePosition).toBeUndefined();
    act(() => proceed?.());
    expect(hook.current.workingDirectoryFilePath).toBe('src/index.ts');
    expect(hook.current.workingDirectoryFilePosition).toEqual({ line: 17, column: 4 });
    hook.rerender('C:/repositories/b');
    expect(hook.current.workingDirectoryFilePosition).toBeUndefined();
    hook.unmount();
  });
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

  it('closes the working-file editor when its file or parent folder is invalidated', () => {
    const hook = renderInspector('C:/repositories/a');

    act(() => hook.current.handleOpenWorkingDirectoryFile('src/index.ts'));
    act(() => hook.current.handleWorkingDirectoryEntryInvalidated('src/index.ts'));
    expect(hook.current.workingDirectoryFilePath).toBeNull();

    act(() => hook.current.handleOpenWorkingDirectoryFile('src/index.ts'));
    act(() => hook.current.handleWorkingDirectoryEntryInvalidated('src'));
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
  it('runs a commit shortcut only after accepting the working-file navigation guard', () => {
    const hook = renderInspector('C:/repositories/a');
    let proceed: (() => void) | undefined;
    act(() => hook.current.handleOpenWorkingDirectoryFile('src/index.ts'));
    act(() =>
      hook.current.setWorkingDirectoryNavigationGuard((_target, next) => {
        proceed = next;
      }),
    );
    const opened = vi.fn();
    const beforeOpen = vi.fn();
    act(() => hook.current.handleStageCommitOpen(opened, beforeOpen));
    expect(opened).not.toHaveBeenCalled();
    expect(beforeOpen).not.toHaveBeenCalled();
    expect(hook.current.workingDirectoryFilePath).toBe('src/index.ts');
    act(() => proceed?.());
    expect(opened).toHaveBeenCalledOnce();
    expect(beforeOpen).toHaveBeenCalledOnce();
    expect(beforeOpen.mock.invocationCallOrder[0]).toBeLessThan(opened.mock.invocationCallOrder[0]);
    expect(hook.current.workingDirectoryFilePath).toBeNull();
    hook.unmount();
  });
});
