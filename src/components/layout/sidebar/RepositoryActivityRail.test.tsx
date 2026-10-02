// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGitStore, useUIStore, type RepositoryContextValue, type UIContextValue } from '@/contexts/AppStateContext';
import { useAppToast } from '@/hooks/useAppToast';
import { publishRepositoryActivity, repositoryActivityKey } from '@/data/repositoryActivityCache';
import { queryClient, readResource } from '@/data/queryClient';
import { RepositoryActivityRail } from './RepositoryActivityRail';

vi.mock('@/contexts/AppStateContext', () => ({ useGitStore: vi.fn(), useUIStore: vi.fn() }));
vi.mock('@/hooks/useAppToast', () => ({ useAppToast: vi.fn() }));

describe('repository activity rail', () => {
  let host: HTMLDivElement;
  let root: Root;
  let repository: RepositoryContextValue;
  const switchRepo = vi.fn();
  const setActiveTab = vi.fn();
  const closeRunConfig = vi.fn();
  const toggleSidebar = vi.fn();
  const toast = vi.fn();
  const render = () => act(async () => root.render(createElement(RepositoryActivityRail)));
  const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('button')];
  const click = (index = 0) => act(async () => buttons()[index].click());

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    switchRepo.mockReset().mockResolvedValue(true);
    setActiveTab.mockReset();
    closeRunConfig.mockReset();
    toggleSidebar.mockReset();
    toast.mockReset();
    repository = {
      openRepos: ['/work/Alpha', '/work/Beta'],
      activeRepo: '/work/Alpha',
      isRestoringRepos: true,
      onSwitchRepo: switchRepo,
    } as unknown as RepositoryContextValue;
    vi.mocked(useGitStore).mockImplementation((selector) => selector(repository));
    vi.mocked(useUIStore).mockImplementation((selector) =>
      selector({ setActiveTab, onCloseRunConfig: closeRunConfig, onToggleSidebar: toggleSidebar } as unknown as UIContextValue),
    );
    vi.mocked(useAppToast).mockReturnValue(toast);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('renders nothing for unknown or clean repositories, including the active repository', async () => {
    await render();
    expect(host.childElementCount).toBe(0);
    await act(async () => publishRepositoryActivity('/work/Alpha', 0));
    expect(host.childElementCount).toBe(0);
    expect(switchRepo).not.toHaveBeenCalled();
  });

  it.each([1, 5, 8])('renders all %i dirty repositories in the bounded scroll container', async (count) => {
    repository.openRepos = Array.from({ length: count }, (_, index) => `/work/Repo${index}`);
    repository.openRepos.forEach((path, index) => publishRepositoryActivity(path, index + 1));
    await render();
    expect(buttons()).toHaveLength(count);
    expect(host.querySelectorAll('.repository-activity-rail')).toHaveLength(1);
    expect(buttons()[0].title).toContain(count === 1 ? '1 geänderte Datei' : `${count} geänderte Dateien`);
    expect(switchRepo).not.toHaveBeenCalled();
  });

  it('sorts by count then name/path and highlights the active repo independently of the current tab', async () => {
    repository.openRepos = ['/z/Beta', '/a/Beta', '/work/Alpha'];
    repository.openRepos.forEach((path) => publishRepositoryActivity(path, 2));
    await render();
    expect(buttons().map((button) => button.title.split('\n')[1])).toEqual(['/work/Alpha', '/a/Beta', '/z/Beta']);
    expect(buttons()[0].getAttribute('aria-current')).toBe('true');
    expect(buttons()[0].classList.contains('active')).toBe(true);
    expect(buttons()[0].querySelector('.repository-activity-initial')?.textContent).toBe('AL');
    await act(async () => publishRepositoryActivity('/z/Beta', 12345));
    expect(buttons()[0].title).toContain('/z/Beta');
    expect(buttons()[0].querySelector('.repository-activity-count')?.textContent).toBe('12345');
    await act(async () => publishRepositoryActivity('/work/Alpha', 0));
    expect(buttons()).toHaveLength(2);
  });

  it('keeps stale entries visible with a failure tooltip', async () => {
    publishRepositoryActivity('/work/Alpha', 3);
    await render();
    await act(async () => {
      await readResource(repositoryActivityKey('/work/Alpha'), async () => ({ success: false, error: 'offline' }), { force: true, automaticRefresh: false });
    });
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0].title).toContain('Aktualisierung fehlgeschlagen');
  });

  it('only navigates on successful switching and preserves collapsed sidebar state', async () => {
    publishRepositoryActivity('/work/Alpha', 1);
    switchRepo.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(true);
    await render();
    await click();
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(closeRunConfig).not.toHaveBeenCalled();
    await click();
    expect(toast).toHaveBeenCalledWith('Unavailable', true);
    expect(setActiveTab).not.toHaveBeenCalled();
    await click();
    expect(setActiveTab).toHaveBeenCalledExactlyOnceWith('repo');
    expect(closeRunConfig).toHaveBeenCalledOnce();
    expect(toggleSidebar).not.toHaveBeenCalled();
  });

  it('guards repeated clicks while preserving focus, then removes closed entries', async () => {
    let resolve!: (value: boolean) => void;
    switchRepo.mockReturnValue(
      new Promise<boolean>((done) => {
        resolve = done;
      }),
    );
    publishRepositoryActivity('/work/Alpha', 1);
    publishRepositoryActivity('/work/Beta', 1);
    await render();
    await click();
    await click(1);
    expect(switchRepo).toHaveBeenCalledOnce();
    expect(buttons()[0].getAttribute('aria-disabled')).toBe('true');
    await act(async () => resolve(true));
    repository.openRepos = ['/work/Beta'];
    await render();
    expect(buttons()).toHaveLength(1);
    expect(queryClient.getQueryData(repositoryActivityKey('/work/Alpha'))).toBeUndefined();
  });
});
