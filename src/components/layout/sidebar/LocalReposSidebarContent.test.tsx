// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalReposSidebarContent } from './LocalReposSidebarContent';

describe('compact local repository sidebar', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('shows only count, active repository and creation actions', async () => {
    const onOpenRepoTab = vi.fn();
    const onOpenFolder = vi.fn();
    const onCloneByUrl = vi.fn();
    await act(async () =>
      root.render(
        createElement(LocalReposSidebarContent, {
          activeRepo: 'C:/Work/example',
          count: 3,
          isRestoringRepos: false,
          onOpenRepoTab,
          onOpenFolder,
          onCloneByUrl,
        }),
      ),
    );

    expect(host.querySelectorAll('.repo-list-item')).toHaveLength(0);
    expect(host.textContent).toContain('example');
    expect(host.textContent).toContain('3');
    act(() => host.querySelector<HTMLButtonElement>('.local-repos-sidebar__active')?.click());
    const actions = host.querySelectorAll<HTMLButtonElement>('.local-repos-sidebar__actions button');
    act(() => {
      actions[0].click();
      actions[1].click();
    });
    expect(onOpenRepoTab).toHaveBeenCalledTimes(1);
    expect(onOpenFolder).toHaveBeenCalledTimes(1);
    expect(onCloneByUrl).toHaveBeenCalledTimes(1);
  });

  it('does not show an empty repository message during restoration', async () => {
    await act(async () =>
      root.render(
        createElement(LocalReposSidebarContent, {
          activeRepo: null,
          count: 0,
          isRestoringRepos: true,
          onOpenRepoTab: vi.fn(),
          onOpenFolder: vi.fn(),
          onCloneByUrl: vi.fn(),
        }),
      ),
    );
    expect(host.textContent).toContain('wiederhergestellt');
    expect(host.textContent).not.toContain('Kein Repository aktiv');
  });
});
