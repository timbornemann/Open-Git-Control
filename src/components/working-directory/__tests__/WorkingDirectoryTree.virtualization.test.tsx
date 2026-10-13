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

describe('WorkingDirectoryTree virtualization', () => {
  it('renders a bounded window of a large directory and keeps range selection across scrolled rows', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'listWorkingDirectory').mockResolvedValue({
      success: true,
      data: Array.from({ length: 5000 }, (_, i) => ({
        path: `file-${String(i).padStart(5, '0')}.txt`,
        name: `file-${String(i).padStart(5, '0')}.txt`,
        kind: 'file',
      })),
    });
    const container = document.getElementById('root')!;
    root = createRoot(container);
    await act(async () =>
      root?.render(
        createElement(WorkingDirectoryTree, {
          repoPath: 'C:/repos/demo',
          refreshTrigger: 0,
          expandedPaths: new Set(),
          onExpandedPathsChange: vi.fn(),
          onOpenFile: vi.fn(),
          onRepoChanged: vi.fn(),
        }),
      ),
    );
    expect(container.querySelectorAll('.working-tree-row').length).toBeLessThan(100);
    const first = container.querySelector<HTMLButtonElement>('.working-tree-row')!;
    act(() => first.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })));
    const list = container.querySelector<HTMLElement>('.working-tree-list')!;
    act(() => {
      list.scrollTop = 2000 * 25;
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    const distant = Array.from(container.querySelectorAll<HTMLButtonElement>('.working-tree-row')).find((row) => row.textContent?.includes('file-02000.txt'))!;
    expect(distant).toBeDefined();
    act(() => distant.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })));
    act(() => distant.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })));
    expect(container.querySelector('.working-tree-context-menu__header')?.textContent).toBe('2001 items selected');
    expect(container.querySelectorAll('.working-tree-row').length).toBeLessThan(100);
  });

  it('keeps Tab navigation working through rows that were not mounted initially', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'getWorkingDirectoryPreview').mockResolvedValue({ success: false, error: 'Unused preview.' });
    vi.spyOn(gitClient, 'listWorkingDirectory').mockResolvedValue({
      success: true,
      data: Array.from({ length: 128 }, (_, i) => ({
        path: `file-${String(i).padStart(3, '0')}`,
        name: `file-${String(i).padStart(3, '0')}`,
        kind: 'file',
      })),
    });
    const container = document.getElementById('root')!;
    root = createRoot(container);
    await act(async () =>
      root?.render(
        createElement(WorkingDirectoryTree, {
          repoPath: 'C:/repos/demo',
          refreshTrigger: 0,
          expandedPaths: new Set(),
          onExpandedPathsChange: vi.fn(),
          onOpenFile: vi.fn(),
          onRepoChanged: vi.fn(),
        }),
      ),
    );
    act(() => container.querySelector<HTMLButtonElement>('.working-tree-row')!.focus());
    for (let i = 1; i <= 48; i++) {
      await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
      expect(document.activeElement?.textContent).toContain(`file-${String(i).padStart(3, '0')}`);
    }
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement?.textContent).toContain('file-047');
  });
});
