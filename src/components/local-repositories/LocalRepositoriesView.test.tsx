// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepositoryContext, useUIContext } from '@/contexts/AppStateContext';
import { useCachedRepoOrigins } from '@/hooks/useRepoOrigins';
import { useAppToast } from '@/hooks/useAppToast';
import type { RepositoryContextValue, UIContextValue } from '@/contexts/AppStateContext';
import { appClient } from '@/services/appClient';
import { gitClient } from '@/services/gitClient';
import { LocalRepositoriesView } from './LocalRepositoriesView';

vi.mock('@/contexts/AppStateContext', () => ({ useRepositoryContext: vi.fn(), useUIContext: vi.fn() }));
vi.mock('@/hooks/useRepoOrigins', () => ({ useCachedRepoOrigins: vi.fn() }));
vi.mock('@/hooks/useAppToast', () => ({ useAppToast: vi.fn() }));

const first = 'C:/Code/alpha';
const second = 'D:/Projects/Beta';

describe('LocalRepositoriesView', () => {
  let host: HTMLDivElement;
  let root: Root;
  let repository: RepositoryContextValue;
  let setActiveTab: ReturnType<typeof vi.fn<UIContextValue['setActiveTab']>>;
  let onOpenRepositoryAnalytics: ReturnType<typeof vi.fn>;
  let onOpenRunConfig: ReturnType<typeof vi.fn>;
  let onCloseRunConfig: ReturnType<typeof vi.fn>;
  let onOpenRemoteConfig: ReturnType<typeof vi.fn>;
  let onCloseRemoteConfig: ReturnType<typeof vi.fn>;
  let toast: ReturnType<typeof vi.fn<(message: string, isError: boolean) => void>>;

  const render = async () => {
    await act(async () => root.render(createElement(LocalRepositoriesView)));
  };

  const click = async (element: Element | null) => {
    expect(element).toBeTruthy();
    await act(async () => (element as HTMLElement).click());
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    setActiveTab = vi.fn<UIContextValue['setActiveTab']>();
    onOpenRepositoryAnalytics = vi.fn(() => setActiveTab('repo'));
    onOpenRunConfig = vi.fn();
    onCloseRunConfig = vi.fn();
    onOpenRemoteConfig = vi.fn();
    onCloseRemoteConfig = vi.fn();
    toast = vi.fn<(message: string, isError: boolean) => void>();
    repository = {
      openRepos: [first, second],
      activeRepo: first,
      isRestoringRepos: false,
      repoMeta: {
        [first]: { pinned: true, lastOpened: 100000, createdAt: 1000 },
        [second]: { pinned: false, lastOpened: 200000, createdAt: 2000 },
      },
      repoSortBy: 'lastOpenedDesc',
      onSwitchRepo: vi.fn().mockResolvedValue(true),
      onCloseRepo: vi.fn(),
      onToggleRepoPin: vi.fn(),
      onSetRepoSortBy: vi.fn(),
      onOpenFolder: vi.fn(),
      onCloneByUrl: vi.fn(),
    } as unknown as RepositoryContextValue;
    vi.mocked(useRepositoryContext).mockReturnValue(repository);
    vi.mocked(useUIContext).mockReturnValue({
      setActiveTab,
      onOpenRepositoryAnalytics,
      onOpenRunConfig,
      onCloseRunConfig,
      onOpenRemoteConfig,
      onCloseRemoteConfig,
    } as unknown as UIContextValue);
    vi.mocked(useCachedRepoOrigins).mockReturnValue({ [first]: 'https://github.com/team/alpha.git', [second]: 'git@github.com:team/Beta.git' });
    vi.mocked(useAppToast).mockReturnValue(toast);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    document.querySelector('.repo-list-context-backdrop')?.remove();
  });

  it('renders saved rows without switching, and keeps restoration distinct from empty state', async () => {
    repository.isRestoringRepos = true;
    await render();
    expect(host.querySelectorAll('.local-repositories-view__row')).toHaveLength(2);
    expect(host.textContent).toContain('C:/Code/alpha');
    expect(repository.onSwitchRepo).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();

    repository.openRepos = [];
    await render();
    expect(host.querySelector('.local-repositories-view__placeholder')).toBeTruthy();
    expect(host.textContent).not.toContain('Noch keine Repositories');
  });

  it('opens the repository tab only after a successful switch', async () => {
    vi.mocked(repository.onSwitchRepo).mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(true);
    await render();
    const row = host.querySelectorAll('.local-repositories-view__row-main')[1];
    await click(row);
    expect(setActiveTab).not.toHaveBeenCalled();
    await click(row);
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('Unavailable', true);
    await click(row);
    expect(setActiveTab).toHaveBeenCalledWith('repo');
    expect(onCloseRunConfig).toHaveBeenCalledOnce();
  });

  it('opens run configuration only after the selected repository is activated', async () => {
    vi.mocked(repository.onSwitchRepo).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await render();
    const row = host.querySelectorAll('.local-repositories-view__row')[1];
    const openRunConfig = async () => {
      await act(async () => row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 60 })));
      await click(
        Array.from(document.querySelectorAll<HTMLButtonElement>('.repo-list-context-action')).find((item) => item.textContent?.includes('Run-Konfiguration')) ||
          null,
      );
    };
    await openRunConfig();
    expect(repository.onSwitchRepo).toHaveBeenCalledWith(second);
    expect(onOpenRunConfig).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
    await openRunConfig();
    expect(setActiveTab).toHaveBeenCalledWith('repo');
    expect(onOpenRunConfig).toHaveBeenCalledOnce();
  });

  it.each([first, second])('opens analytics from the context menu after activation succeeds for %s', async (path) => {
    let activate!: (success: boolean) => void;
    vi.mocked(repository.onSwitchRepo)
      .mockResolvedValueOnce(false)
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            activate = resolve;
          }),
      );
    await render();
    const row = host.querySelectorAll('.local-repositories-view__row')[path === first ? 0 : 1];
    const openAnalytics = async () => {
      const switchCalls = vi.mocked(repository.onSwitchRepo).mock.calls.length;
      await act(async () => row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 60 })));
      expect(repository.onSwitchRepo).toHaveBeenCalledTimes(switchCalls);
      await click(
        Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find((item) => item.textContent?.includes('Statistik & Analyse')) ?? null,
      );
      expect(document.querySelector('.local-repository-context-menu')).toBeNull();
    };
    await openAnalytics();
    expect(repository.onSwitchRepo).toHaveBeenCalledWith(path);
    expect(onOpenRepositoryAnalytics).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
    await openAnalytics();
    expect(onOpenRepositoryAnalytics).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
    await act(async () => activate(true));
    expect(onOpenRepositoryAnalytics).toHaveBeenCalledOnce();
    expect(setActiveTab).toHaveBeenCalledWith('repo');
    expect(onOpenRunConfig).not.toHaveBeenCalled();
    expect(onOpenRemoteConfig).not.toHaveBeenCalled();
  });

  it('filters by path and pin, keeps sort persistence, and isolates row controls', async () => {
    await render();
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(search, 'Projects');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.querySelectorAll('.local-repositories-view__row')).toHaveLength(1);
    expect(host.textContent).toContain('Beta');

    const pinnedFilter = host.querySelector<HTMLButtonElement>('.local-repositories-view__toolbar > button')!;
    await click(pinnedFilter);
    expect(host.querySelectorAll('.local-repositories-view__row')).toHaveLength(0);
    await click(pinnedFilter);
    await click(host.querySelector('.local-repositories-view__row-action'));
    expect(repository.onToggleRepoPin).toHaveBeenCalledWith(second);
    expect(repository.onSwitchRepo).not.toHaveBeenCalled();

    const sort = host.querySelector<HTMLSelectElement>('.local-repositories-view__toolbar select')!;
    await act(async () => {
      sort.value = 'nameAsc';
      sort.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(repository.onSetRepoSortBy).toHaveBeenCalledWith('nameAsc');
  });

  it('uses the shared context menu for safe actions without selecting a row', async () => {
    const openFolder = vi.spyOn(gitClient, 'openRepositoryPath').mockResolvedValue({ success: true });
    const openExternal = vi.spyOn(appClient, 'openExternalUrl').mockResolvedValue({ success: true });
    await render();
    const rows = host.querySelectorAll('.local-repositories-view__row');
    await act(async () => rows[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 60 })));
    expect(document.querySelectorAll('.repo-list-context-menu')).toHaveLength(1);
    const actions = Array.from(document.querySelectorAll<HTMLButtonElement>('.repo-list-context-action'));
    await click(actions.find((button) => button.textContent?.includes('Im Dateimanager')) || null);
    expect(openFolder).toHaveBeenCalledWith({ action: 'open', repoPath: first });
    expect(repository.onSwitchRepo).not.toHaveBeenCalled();

    await act(async () => rows[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 60 })));
    await click(
      Array.from(document.querySelectorAll<HTMLButtonElement>('.repo-list-context-action')).find((button) =>
        button.textContent?.includes('Remote im Browser'),
      ) || null,
    );
    expect(openExternal).toHaveBeenCalledWith('https://github.com/team/alpha.git');

    await act(async () => rows[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 60 })));
    expect(Array.from(document.querySelectorAll('.repo-list-context-action')).some((button) => button.textContent?.includes('Remote im Browser'))).toBe(false);
    await click(
      Array.from(document.querySelectorAll<HTMLButtonElement>('.repo-list-context-action')).find((button) =>
        button.textContent?.includes('Aus Liste entfernen'),
      ) || null,
    );
    expect(repository.onCloseRepo).toHaveBeenCalledWith(second);
    expect(repository.onSwitchRepo).not.toHaveBeenCalled();
  });

  it('reuses add and clone workflows from the page header', async () => {
    await render();
    const actions = host.querySelectorAll('.local-repositories-view__hero-actions button');
    await click(actions[0]);
    await click(actions[1]);
    expect(repository.onOpenFolder).toHaveBeenCalledTimes(1);
    expect(repository.onCloneByUrl).toHaveBeenCalledTimes(1);
  });
  it('opens remote configuration only after the selected repository is activated', async () => {
    await render();
    const row = host.querySelectorAll('.local-repositories-view__row')[1];
    await act(async () => row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 60 })));
    await click(
      Array.from(document.querySelectorAll<HTMLButtonElement>('.repo-list-context-action')).find((button) =>
        button.textContent?.includes('Remote-Konfiguration'),
      ) ?? null,
    );
    expect(repository.onSwitchRepo).toHaveBeenCalledWith(second);
    expect(setActiveTab).toHaveBeenCalledWith('repo');
    expect(onOpenRemoteConfig).toHaveBeenCalledOnce();
    expect(onOpenRunConfig).not.toHaveBeenCalled();
  });
});
