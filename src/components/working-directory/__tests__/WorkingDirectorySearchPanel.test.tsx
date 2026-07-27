// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkingDirectorySearchPanel } from '@/components/working-directory/WorkingDirectorySearchPanel';
import {
  resetWorkingDirectoryNavigationGuardForTests,
  setActiveWorkingDirectoryNavigationGuard,
} from '@/components/working-directory/workingDirectoryNavigationGuard';
import { gitClient } from '@/services/gitClient';

const { setConfirmDialogMock, setToastMock } = vi.hoisted(() => ({
  setConfirmDialogMock: vi.fn(),
  setToastMock: vi.fn(),
}));

vi.mock('@/contexts/AppStateContext', () => ({
  useUIContext: () => ({ setConfirmDialog: setConfirmDialogMock }),
}));
vi.mock('@/hooks/useAppToast', () => ({
  useAppToastSetter: () => setToastMock,
}));

describe('WorkingDirectorySearchPanel', () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="root"></div>';
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    setConfirmDialogMock.mockReset();
    setToastMock.mockReset();
    resetWorkingDirectoryNavigationGuardForTests();
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetWorkingDirectoryNavigationGuardForTests();
    document.body.innerHTML = '';
  });

  const renderPanel = (onOpenFile = vi.fn(), onFilesChanged = vi.fn().mockResolvedValue(undefined), activeFilePath?: string) => {
    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);
    act(() =>
      root?.render(
        createElement(WorkingDirectorySearchPanel, {
          repoPath: 'C:/repos/demo',
          onOpenFile,
          onFilesChanged,
          activeFilePath,
        }),
      ),
    );
    return { container, onOpenFile, onFilesChanged };
  };

  const enterText = (input: HTMLInputElement, value: string) => {
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, value);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  };

  const flushSearch = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
  };

  it('searches file names by default and opens a selected result', async () => {
    vi.spyOn(gitClient, 'searchWorkingDirectory').mockResolvedValue({
      success: true,
      data: {
        files: [{ path: 'src/app.ts', name: 'app.ts', matches: [] }],
        totalMatches: 1,
        scannedFiles: 5,
        truncated: false,
      },
    });
    const { container, onOpenFile } = renderPanel();
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search file names"]');
    if (!input) throw new Error('Missing search input.');

    enterText(input, 'app');
    await flushSearch();

    expect(gitClient.searchWorkingDirectory).toHaveBeenCalledWith({ query: 'app', mode: 'filename', caseSensitive: false }, 'C:/repos/demo');
    const result = container.querySelector<HTMLButtonElement>('.working-search-file-result');
    if (!result) throw new Error('Missing file result.');
    act(() => result.click());
    expect(onOpenFile).toHaveBeenCalledWith('src/app.ts');
  });

  it('shows line results and replaces a selected occurrence', async () => {
    vi.spyOn(gitClient, 'searchWorkingDirectory').mockResolvedValue({
      success: true,
      data: {
        files: [
          {
            path: 'src/app.ts',
            name: 'app.ts',
            matches: [{ line: 3, column: 7, preview: 'const app = true;', previewMatchStart: 6, matchLength: 3 }],
          },
        ],
        totalMatches: 1,
        scannedFiles: 5,
        truncated: false,
      },
    });
    vi.spyOn(gitClient, 'replaceWorkingDirectory').mockResolvedValue({
      success: true,
      data: { replacements: 1, paths: ['src/app.ts'] },
    });
    const { container, onFilesChanged } = renderPanel();
    const contentTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((button) =>
      button.textContent?.includes('File contents'),
    );
    if (!contentTab) throw new Error('Missing content tab.');
    act(() => contentTab.click());
    const searchInput = container.querySelector<HTMLInputElement>('input[aria-label="Search file contents"]');
    if (!searchInput) throw new Error('Missing content input.');
    enterText(searchInput, 'app');
    await flushSearch();
    const replacementInput = container.querySelector<HTMLInputElement>('input[aria-label="Replacement text"]');
    if (!replacementInput) throw new Error('Missing replacement input.');
    enterText(replacementInput, 'service');

    const replaceButton = container.querySelector<HTMLButtonElement>('.working-search-match__replace');
    if (!replaceButton) throw new Error('Missing replace button.');
    await act(async () => {
      replaceButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(gitClient.replaceWorkingDirectory).toHaveBeenCalledWith(
      {
        query: 'app',
        replacement: 'service',
        caseSensitive: false,
        target: { path: 'src/app.ts', line: 3, column: 7 },
      },
      'C:/repos/demo',
    );
    expect(onFilesChanged).toHaveBeenCalledWith(['src/app.ts']);
  });

  it('waits for unsaved-editor navigation approval before replacing the open file', async () => {
    vi.spyOn(gitClient, 'searchWorkingDirectory').mockResolvedValue({
      success: true,
      data: {
        files: [
          {
            path: 'src/app.ts',
            name: 'app.ts',
            matches: [{ line: 1, column: 1, preview: 'app', previewMatchStart: 0, matchLength: 3 }],
          },
        ],
        totalMatches: 1,
        scannedFiles: 1,
        truncated: false,
      },
    });
    const replaceWorkingDirectory = vi.spyOn(gitClient, 'replaceWorkingDirectory').mockResolvedValue({
      success: true,
      data: { replacements: 1, paths: ['src/app.ts'] },
    });
    let proceed: (() => void) | null = null;
    setActiveWorkingDirectoryNavigationGuard((_target, allow) => {
      proceed = allow;
    });
    const { container } = renderPanel(vi.fn(), vi.fn().mockResolvedValue(undefined), 'src/app.ts');
    const contentTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((button) =>
      button.textContent?.includes('File contents'),
    );
    if (!contentTab) throw new Error('Missing content tab.');
    act(() => contentTab.click());
    const searchInput = container.querySelector<HTMLInputElement>('input[aria-label="Search file contents"]');
    if (!searchInput) throw new Error('Missing content input.');
    enterText(searchInput, 'app');
    await flushSearch();
    const replaceButton = container.querySelector<HTMLButtonElement>('.working-search-match__replace');
    if (!replaceButton) throw new Error('Missing replace button.');

    act(() => replaceButton.click());
    expect(replaceWorkingDirectory).not.toHaveBeenCalled();
    if (!proceed) throw new Error('Navigation approval was not requested.');
    await act(async () => {
      proceed?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(replaceWorkingDirectory).toHaveBeenCalledOnce();
  });

  it('confirms replace all and sends a complete-working-tree request', async () => {
    vi.spyOn(gitClient, 'searchWorkingDirectory').mockResolvedValue({
      success: true,
      data: {
        files: [{ path: 'src/app.ts', name: 'app.ts', matches: [{ line: 1, column: 1, preview: 'app', previewMatchStart: 0, matchLength: 3 }] }],
        totalMatches: 4,
        scannedFiles: 5,
        truncated: false,
      },
    });
    vi.spyOn(gitClient, 'replaceWorkingDirectory').mockResolvedValue({
      success: true,
      data: { replacements: 4, paths: ['src/app.ts'] },
    });
    const { container } = renderPanel();
    const contentTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((button) =>
      button.textContent?.includes('File contents'),
    );
    if (!contentTab) throw new Error('Missing content tab.');
    act(() => contentTab.click());
    const searchInput = container.querySelector<HTMLInputElement>('input[aria-label="Search file contents"]');
    if (!searchInput) throw new Error('Missing content input.');
    enterText(searchInput, 'app');
    await flushSearch();

    const replaceAllButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.trim() === 'All');
    if (!replaceAllButton) throw new Error('Missing replace all button.');
    act(() => replaceAllButton.click());
    const dialog = setConfirmDialogMock.mock.calls.at(-1)?.[0];
    expect(dialog).toMatchObject({ title: 'Replace all occurrences?', confirmLabel: 'Replace all' });
    await act(async () => {
      await dialog.onConfirm();
    });

    expect(gitClient.replaceWorkingDirectory).toHaveBeenCalledWith({ query: 'app', replacement: '', caseSensitive: false, all: true }, 'C:/repos/demo');
  });
});
