// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { RepoList } from './RepoList';

vi.mock('@/services/gitClient', () => ({
  gitClient: {
    isAvailable: vi.fn(),
    openRepositoryPath: vi.fn(),
  },
}));

describe('RepoList context menu', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.mocked(gitClient.isAvailable).mockReset().mockReturnValue(true);
    vi.mocked(gitClient.openRepositoryPath).mockReset().mockResolvedValue({ success: true });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('opens a repository folder from the right-click menu without selecting it', async () => {
    await act(async () => {
      root.render(
        createElement(RepoList, {
          openRepos: ['C:/Repos/Example'],
          isRestoringRepos: false,
          repoMeta: {},
          sortBy: 'lastOpenedDesc',
          onSortChange: vi.fn(),
          activeRepo: null,
          onSwitchRepo: vi.fn(),
          onCloseRepo: vi.fn(),
          onOpenFolder: vi.fn(),
          onCloneByUrl: vi.fn(),
          onTogglePin: vi.fn(),
          collapsed: false,
          onToggleCollapsed: vi.fn(),
        }),
      );
    });

    const row = host.querySelector('.repo-list-item');
    expect(row).toBeTruthy();
    act(() => row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 40 })));

    const openFolderButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Ordner oeffnen'));
    expect(openFolderButton).toBeTruthy();
    await act(async () => openFolderButton?.click());

    expect(gitClient.openRepositoryPath).toHaveBeenCalledWith({ action: 'open', repoPath: 'C:/Repos/Example' });
  });
});
