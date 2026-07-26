// @vitest-environment jsdom

import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkingDirectoryTree } from '@/components/working-directory/WorkingDirectoryTree';
import { gitClient } from '@/services/gitClient';

const { copyTextToClipboardMock, setConfirmDialogMock, setInputDialogMock } = vi.hoisted(() => ({
  copyTextToClipboardMock: vi.fn(),
  setConfirmDialogMock: vi.fn(),
  setInputDialogMock: vi.fn(),
}));

vi.mock('@/contexts/AppStateContext', () => ({
  useUIContext: () => ({ setConfirmDialog: setConfirmDialogMock, setInputDialog: setInputDialogMock }),
  useOptionalRepositoryContext: () => null,
}));

vi.mock('@/utils/clipboard', () => ({ copyTextToClipboard: copyTextToClipboardMock }));

let root: Root | null = null;

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  setConfirmDialogMock.mockReset();
  setInputDialogMock.mockReset();
  copyTextToClipboardMock.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('WorkingDirectoryTree', () => {
  it('retries a directory load after its previous request failed', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    let folderRequests = 0;
    const listWorkingDirectory = vi.spyOn(gitClient, 'listWorkingDirectory').mockImplementation(async (_repoPath, parentPath) => {
      if (!parentPath) return { success: true, data: [{ path: 'folder', name: 'folder', kind: 'directory' }] };
      folderRequests += 1;
      return folderRequests === 1 ? { success: false, error: 'Temporary read failure.' } : { success: true, data: [] };
    });

    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);
    const TestTree = () => {
      const [expandedPaths, setExpandedPaths] = useState(new Set<string>());
      return createElement(WorkingDirectoryTree, {
        repoPath: 'C:/repos/demo',
        refreshTrigger: 0,
        expandedPaths,
        onExpandedPathsChange: setExpandedPaths,
        onOpenFile: vi.fn(),
        onRepoChanged: vi.fn(),
      });
    };
    act(() => root?.render(createElement(TestTree)));

    await act(async () => {
      await Promise.resolve();
    });
    const folder = container.querySelector<HTMLButtonElement>('.working-tree-row');
    if (!folder) throw new Error('Missing directory row.');

    await act(async () => {
      folder.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      folder.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      folder.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(listWorkingDirectory.mock.calls.filter(([, parentPath]) => parentPath === 'folder')).toHaveLength(2);
  });

  it('re-hydrates already-expanded directories on mount so their children render', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    const listWorkingDirectory = vi.spyOn(gitClient, 'listWorkingDirectory').mockImplementation(async (_repoPath, parentPath) => {
      if (!parentPath) return { success: true, data: [{ path: 'folder', name: 'folder', kind: 'directory' }] };
      if (parentPath === 'folder') return { success: true, data: [{ path: 'folder/child.txt', name: 'child.txt', kind: 'file' }] };
      return { success: true, data: [] };
    });

    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);
    // The parent owns the expanded-path set and keeps it while the tree unmounts,
    // so a remount starts with "folder" already marked open but no cached entries.
    act(() =>
      root?.render(
        createElement(WorkingDirectoryTree, {
          repoPath: 'C:/repos/demo',
          refreshTrigger: 0,
          expandedPaths: new Set<string>(['', 'folder']),
          onExpandedPathsChange: vi.fn(),
          onOpenFile: vi.fn(),
          onRepoChanged: vi.fn(),
        }),
      ),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(listWorkingDirectory.mock.calls.some(([, parentPath]) => parentPath === 'folder')).toBe(true);
    const labels = Array.from(container.querySelectorAll('.working-tree-row__label')).map((node) => node.textContent);
    expect(labels).toContain('child.txt');
  });

  it('retries a failed root-directory load on refresh', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    const listWorkingDirectory = vi
      .spyOn(gitClient, 'listWorkingDirectory')
      .mockResolvedValueOnce({ success: false, error: 'Temporary root read failure.' })
      .mockResolvedValueOnce({ success: true, data: [] });
    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);
    const props = (refreshTrigger: number) => ({
      repoPath: 'C:/repos/demo',
      refreshTrigger,
      expandedPaths: new Set<string>(),
      onExpandedPathsChange: vi.fn(),
      onOpenFile: vi.fn(),
      onRepoChanged: vi.fn(),
    });

    act(() => root?.render(createElement(WorkingDirectoryTree, props(0))));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => root?.render(createElement(WorkingDirectoryTree, props(1))));
    await act(async () => {
      await Promise.resolve();
    });

    expect(listWorkingDirectory.mock.calls.filter(([, parentPath]) => parentPath === '')).toHaveLength(2);
  });

  it('offers file information from a file context menu', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'listWorkingDirectory').mockResolvedValue({ success: true, data: [{ path: 'README.md', name: 'README.md', kind: 'file', bytes: 12 }] });
    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);
    act(() =>
      root?.render(
        createElement(WorkingDirectoryTree, {
          repoPath: 'C:/repos/demo',
          refreshTrigger: 0,
          expandedPaths: new Set<string>(),
          onExpandedPathsChange: vi.fn(),
          onOpenFile: vi.fn(),
          onRepoChanged: vi.fn(),
        }),
      ),
    );

    await act(async () => {
      await Promise.resolve();
    });
    const file = container.querySelector<HTMLButtonElement>('.working-tree-row');
    if (!file) throw new Error('Missing file row.');

    act(() => file.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 40 })));

    expect(Array.from(container.querySelectorAll('.working-tree-context-menu__item')).some((item) => item.textContent?.includes('File information'))).toBe(
      true,
    );
    expect(file.classList.contains('working-tree-row--context')).toBe(true);
    act(() => window.dispatchEvent(new window.MouseEvent('click')));
    expect(file.classList.contains('working-tree-row--context')).toBe(false);
  });

  it('selects a visible range without opening files and shows batch actions in the context menu', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'listWorkingDirectory').mockResolvedValue({
      success: true,
      data: [
        { path: 'alpha.txt', name: 'alpha.txt', kind: 'file' },
        { path: 'beta.txt', name: 'beta.txt', kind: 'file' },
        { path: 'gamma.txt', name: 'gamma.txt', kind: 'file' },
      ],
    });
    const onOpenFile = vi.fn();
    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);
    act(() =>
      root?.render(
        createElement(WorkingDirectoryTree, {
          repoPath: 'C:/repos/demo',
          refreshTrigger: 0,
          expandedPaths: new Set<string>(),
          onExpandedPathsChange: vi.fn(),
          onOpenFile,
          onRepoChanged: vi.fn(),
        }),
      ),
    );
    await act(async () => {
      await Promise.resolve();
    });
    const rowFor = (name: string) =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('.working-tree-row')).find((row) => row.textContent?.includes(name));
    const alpha = rowFor('alpha.txt');
    const beta = rowFor('beta.txt');
    const gamma = rowFor('gamma.txt');
    if (!alpha || !beta || !gamma) throw new Error('Missing file rows.');

    act(() => alpha.dispatchEvent(new window.MouseEvent('click', { bubbles: true, ctrlKey: true })));
    act(() => gamma.dispatchEvent(new window.MouseEvent('click', { bubbles: true, ctrlKey: true })));

    expect(alpha.classList.contains('working-tree-row--selected')).toBe(true);
    expect(beta.classList.contains('working-tree-row--selected')).toBe(false);
    expect(gamma.classList.contains('working-tree-row--selected')).toBe(true);

    act(() => alpha.dispatchEvent(new window.MouseEvent('click', { bubbles: true, shiftKey: true })));

    expect(onOpenFile).not.toHaveBeenCalled();
    expect(alpha.classList.contains('working-tree-row--selected')).toBe(true);
    expect(beta.classList.contains('working-tree-row--selected')).toBe(true);
    expect(gamma.classList.contains('working-tree-row--selected')).toBe(true);

    act(() => beta.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 40 })));

    expect(container.querySelector('.working-tree-context-menu__header')?.textContent).toBe('3 items selected');
    const actions = Array.from(container.querySelectorAll('.working-tree-context-menu__item')).map((item) => item.textContent);
    expect(actions).toContain('Copy paths');
    expect(actions).toContain('Delete selected');
    expect(actions).not.toContain('Open');
    expect(actions).not.toContain('Rename');

    const copyPaths = Array.from(container.querySelectorAll<HTMLButtonElement>('.working-tree-context-menu__item')).find(
      (item) => item.textContent === 'Copy paths',
    );
    if (!copyPaths) throw new Error('Missing copy paths action.');
    await act(async () => {
      copyPaths.click();
      await Promise.resolve();
    });
    expect(copyTextToClipboardMock).toHaveBeenCalledWith('alpha.txt\nbeta.txt\ngamma.txt');
  });

  it('offers adding files and folders from folder and repository-root context menus', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'listWorkingDirectory').mockResolvedValue({ success: true, data: [{ path: 'src', name: 'src', kind: 'directory' }] });
    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);
    act(() =>
      root?.render(
        createElement(WorkingDirectoryTree, {
          repoPath: 'C:/repos/demo',
          refreshTrigger: 0,
          expandedPaths: new Set<string>(),
          onExpandedPathsChange: vi.fn(),
          onOpenFile: vi.fn(),
          onRepoChanged: vi.fn(),
        }),
      ),
    );

    await act(async () => {
      await Promise.resolve();
    });
    const rootFolder = container.querySelector<HTMLElement>('.working-tree-root');
    const folder = container.querySelector<HTMLButtonElement>('.working-tree-row');
    if (!rootFolder || !folder) throw new Error('Missing working directory entries.');

    act(() => rootFolder.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 40 })));
    expect(Array.from(container.querySelectorAll('.working-tree-context-menu__item')).some((item) => item.textContent?.includes('Add file'))).toBe(true);
    expect(Array.from(container.querySelectorAll('.working-tree-context-menu__item')).some((item) => item.textContent?.includes('Add folder'))).toBe(true);

    act(() => folder.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 40 })));
    expect(Array.from(container.querySelectorAll('.working-tree-context-menu__item')).some((item) => item.textContent?.includes('Add file'))).toBe(true);
    expect(Array.from(container.querySelectorAll('.working-tree-context-menu__item')).some((item) => item.textContent?.includes('Add folder'))).toBe(true);
  });

  it('highlights the file open in the viewer', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'listWorkingDirectory').mockResolvedValue({ success: true, data: [{ path: 'README.md', name: 'README.md', kind: 'file', bytes: 12 }] });
    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);
    act(() =>
      root?.render(
        createElement(WorkingDirectoryTree, {
          repoPath: 'C:/repos/demo',
          refreshTrigger: 0,
          expandedPaths: new Set<string>(),
          onExpandedPathsChange: vi.fn(),
          onOpenFile: vi.fn(),
          activeFilePath: 'README.md',
          onRepoChanged: vi.fn(),
        }),
      ),
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('.working-tree-row--active')?.textContent).toContain('README.md');
  });

  it('does not re-load or report an error for a deleted expanded folder', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    const onEntryInvalidated = vi.fn();
    let folderExists = true;
    const listWorkingDirectory = vi.spyOn(gitClient, 'listWorkingDirectory').mockImplementation(async (_repoPath, parentPath) => {
      if (!parentPath) return { success: true, data: folderExists ? [{ path: 'Testtest', name: 'Testtest', kind: 'directory' }] : [] };
      if (parentPath === 'Testtest') return { success: true, data: [{ path: 'Testtest/example.txt', name: 'example.txt', kind: 'file' }] };
      return { success: true, data: [] };
    });
    vi.spyOn(gitClient, 'deleteWorkingDirectoryEntry').mockImplementation(async () => {
      folderExists = false;
      return { success: true };
    });
    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);
    const TestTree = () => {
      const [expandedPaths, setExpandedPaths] = useState(new Set<string>());
      return createElement(WorkingDirectoryTree, {
        repoPath: 'C:/repos/demo',
        refreshTrigger: 0,
        expandedPaths,
        onExpandedPathsChange: setExpandedPaths,
        onOpenFile: vi.fn(),
        onEntryInvalidated,
        onRepoChanged: vi.fn(),
      });
    };
    act(() => root?.render(createElement(TestTree)));
    await act(async () => {
      await Promise.resolve();
    });
    const folder = container.querySelector<HTMLButtonElement>('.working-tree-row');
    if (!folder) throw new Error('Missing directory row.');
    await act(async () => {
      folder.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    act(() => folder.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 40 })));
    const deleteItem = Array.from(container.querySelectorAll<HTMLButtonElement>('.working-tree-context-menu__item')).find(
      (item) => item.textContent === 'Delete',
    );
    if (!deleteItem) throw new Error('Missing delete action.');
    act(() => deleteItem.click());
    const confirmDialog = setConfirmDialogMock.mock.calls.at(-1)?.[0];
    if (!confirmDialog) throw new Error('Missing delete confirmation.');
    await act(async () => {
      await confirmDialog.onConfirm();
    });

    expect(listWorkingDirectory.mock.calls.filter(([, parentPath]) => parentPath === 'Testtest')).toHaveLength(1);
    expect(onEntryInvalidated).toHaveBeenCalledWith('Testtest');
  });
});
