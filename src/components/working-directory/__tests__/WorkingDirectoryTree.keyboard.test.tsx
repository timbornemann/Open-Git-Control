// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkingDirectoryTree } from '../WorkingDirectoryTree';
import { gitClient } from '@/services/gitClient';
vi.mock('@/contexts/AppStateContext', () => ({
  useUIContext: () => ({ setConfirmDialog: vi.fn(), setInputDialog: vi.fn() }),
  useOptionalRepositoryContext: () => null,
}));
let root: Root;
let host: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'listWorkingDirectory').mockResolvedValue({ success: true, data: [{ path: 'note.md', name: 'note.md', kind: 'file', bytes: 0 }] });
  await act(async () => {
    root.render(
      createElement(WorkingDirectoryTree, {
        repoPath: 'C:/repos/keyboard',
        refreshTrigger: 0,
        expandedPaths: new Set<string>(),
        onExpandedPathsChange: vi.fn(),
        onOpenFile: vi.fn(),
        onRepoChanged: vi.fn(),
      }),
    );
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const key = (value: string, shift = false) =>
  act(() => {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey: shift, bubbles: true, cancelable: true }));
  });
it('keeps the root menu open after clicking its button, moves focus and restores it with Escape', () => {
  const trigger = host.querySelector<HTMLButtonElement>('[data-tree-action="root-menu"]')!;
  trigger.focus();
  act(() => trigger.click());
  expect(host.querySelector('[role="menu"]')).not.toBeNull();
  expect(document.activeElement?.getAttribute('data-tree-action')).toBe('create-file');
  key('ArrowDown');
  expect(document.activeElement?.getAttribute('data-tree-action')).toBe('create-folder');
  key('ArrowUp');
  expect(document.activeElement?.getAttribute('data-tree-action')).toBe('create-file');
  key('Escape');
  expect(host.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it.each(['F10', 'ContextMenu'])('opens a row menu with %s, wraps arrows and supports Home/End', (value) => {
  const row = host.querySelector<HTMLButtonElement>('[data-file-path="note.md"]')!;
  row.focus();
  key(value, value === 'F10');
  expect(document.activeElement?.getAttribute('data-tree-action')).toBe('open');
  key('ArrowUp');
  expect(document.activeElement?.getAttribute('data-tree-action')).toBe('delete');
  key('Home');
  expect(document.activeElement?.getAttribute('data-tree-action')).toBe('open');
  key('End');
  expect(document.activeElement?.getAttribute('data-tree-action')).toBe('delete');
  key('Escape');
  expect(host.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(row);
});
