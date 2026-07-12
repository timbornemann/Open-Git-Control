// @vitest-environment jsdom

import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkingDirectoryTree } from '@/components/working-directory/WorkingDirectoryTree';
import { gitClient } from '@/services/gitClient';

vi.mock('@/contexts/AppStateContext', () => ({
  useUIContext: () => ({ setConfirmDialog: vi.fn(), setInputDialog: vi.fn() }),
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
});
