// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkingDirectoryTree } from '@/components/working-directory/WorkingDirectoryTree';
import { gitClient } from '@/services/gitClient';

vi.mock('@/contexts/AppStateContext', () => ({
  useUIContext: () => ({ setConfirmDialog: vi.fn(), setInputDialog: vi.fn() }),
  useOptionalRepositoryContext: () => null,
}));

describe('working-directory search integration', () => {
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

  it('opens and closes search from the repository row', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'listWorkingDirectory').mockResolvedValue({ success: true, data: [] });
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

    const openSearch = container.querySelector<HTMLButtonElement>('button[aria-label="Search working directory"]');
    if (!openSearch) throw new Error('Missing working-directory search action.');
    act(() => openSearch.click());
    expect(container.querySelector('input[aria-label="Search file names"]')).not.toBeNull();

    const closeSearch = container.querySelector<HTMLButtonElement>('button[aria-label="Close working directory search"]');
    if (!closeSearch) throw new Error('Missing close-search action.');
    act(() => closeSearch.click());
    expect(container.querySelector('input[aria-label="Search file names"]')).toBeNull();
  });
});
