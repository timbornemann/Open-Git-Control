// @vitest-environment jsdom

import { act, createElement } from 'react';
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

describe('WorkingDirectoryTree context menu positioning', () => {
  it('keeps the file context menu fully on-screen when opened near the bottom-right edge', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'listWorkingDirectory').mockResolvedValue({ success: true, data: [{ path: 'README.md', name: 'README.md', kind: 'file', bytes: 12 }] });
    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLDivElement.prototype, 'offsetWidth');
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLDivElement.prototype, 'offsetHeight');
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
      Object.defineProperty(HTMLDivElement.prototype, 'offsetWidth', { configurable: true, value: 260 });
      Object.defineProperty(HTMLDivElement.prototype, 'offsetHeight', { configurable: true, value: 400 });

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

      act(() => file.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 980, clientY: 690 })));

      const menu = container.querySelector<HTMLElement>('.working-tree-context-menu');
      if (!menu) throw new Error('Missing context menu.');
      const left = Number.parseFloat(menu.style.left);
      const top = Number.parseFloat(menu.style.top);

      // The raw click point (980, 690) leaves no room for a 260x400 menu in a
      // 1000x700 viewport; the position must be pulled back on-screen instead
      // of letting the lower/trailing part of the menu render past the edge.
      expect(left).toBeLessThanOrEqual(1000 - 260);
      expect(top).toBeLessThanOrEqual(700 - 400);
    } finally {
      if (originalOffsetWidth) Object.defineProperty(HTMLDivElement.prototype, 'offsetWidth', originalOffsetWidth);
      if (originalOffsetHeight) Object.defineProperty(HTMLDivElement.prototype, 'offsetHeight', originalOffsetHeight);
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });
});
