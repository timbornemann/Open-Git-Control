// @vitest-environment jsdom

import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkingDirectoryTree } from '@/components/working-directory/WorkingDirectoryTree';
import { gitClient } from '@/services/gitClient';

vi.mock('@/contexts/AppStateContext', () => ({
  useUIContext: () => ({ setConfirmDialog: vi.fn(), setInputDialog: vi.fn() }),
  useOptionalRepositoryContext: () => null,
}));

let root: Root | null = null;

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
});
