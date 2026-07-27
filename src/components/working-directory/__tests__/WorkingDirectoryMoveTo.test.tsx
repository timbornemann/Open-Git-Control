// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkingDirectoryTree } from '@/components/working-directory/WorkingDirectoryTree';
import { gitClient } from '@/services/gitClient';

const { setConfirmDialogMock, setInputDialogMock, setToastMock } = vi.hoisted(() => ({
  setConfirmDialogMock: vi.fn(),
  setInputDialogMock: vi.fn(),
  setToastMock: vi.fn(),
}));

vi.mock('@/contexts/AppStateContext', () => ({
  useUIContext: () => ({ setConfirmDialog: setConfirmDialogMock, setInputDialog: setInputDialogMock }),
  useOptionalRepositoryContext: () => null,
}));
vi.mock('@/hooks/useAppToast', () => ({ useAppToastSetter: () => setToastMock }));

let root: Root | null = null;

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  setConfirmDialogMock.mockReset();
  setInputDialogMock.mockReset();
  setToastMock.mockReset();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('WorkingDirectoryTree move-to selection', () => {
  it('rejects moving a folder together with a selected descendant', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'listWorkingDirectory').mockImplementation(async (_repoPath, parentPath) => {
      if (!parentPath) return { success: true, data: [{ path: 'docs', name: 'docs', kind: 'directory' }] };
      if (parentPath === 'docs') return { success: true, data: [{ path: 'docs/guide.md', name: 'guide.md', kind: 'file' }] };
      return { success: true, data: [] };
    });
    const listWorkingDirectoryFolders = vi.spyOn(gitClient, 'listWorkingDirectoryFolders');
    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);
    act(() =>
      root?.render(
        createElement(WorkingDirectoryTree, {
          repoPath: 'C:/repos/demo',
          refreshTrigger: 0,
          expandedPaths: new Set<string>(['docs']),
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
    const rowFor = (name: string) =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('.working-tree-row')).find((row) => row.textContent?.includes(name));
    const docs = rowFor('docs');
    const guide = rowFor('guide.md');
    if (!docs || !guide) throw new Error('Missing parent and child rows.');

    act(() => docs.dispatchEvent(new window.MouseEvent('click', { bubbles: true, ctrlKey: true })));
    act(() => guide.dispatchEvent(new window.MouseEvent('click', { bubbles: true, ctrlKey: true })));
    act(() => guide.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 40 })));
    const moveTo = Array.from(container.querySelectorAll<HTMLButtonElement>('.working-tree-context-menu__item')).find(
      (item) => item.textContent === 'Move to...',
    );
    if (!moveTo) throw new Error('Missing move-to action.');
    act(() => moveTo.click());

    expect(setToastMock).toHaveBeenCalledWith({
      msg: 'The selection contains a folder and entries inside it. Select either the folder or its contents before moving.',
      isError: true,
    });
    expect(listWorkingDirectoryFolders).not.toHaveBeenCalled();
    expect(setInputDialogMock).not.toHaveBeenCalled();
  });
});
