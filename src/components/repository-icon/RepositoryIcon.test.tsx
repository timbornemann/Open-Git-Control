// @vitest-environment jsdom
import { act, Fragment, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { useGitStore, useRepositoryContext, useUIContext, useUIStore, type RepositoryContextValue, type UIContextValue } from '@/contexts/AppStateContext';
import { useCachedRepoOrigins } from '@/hooks/useRepoOrigins';
import { useAppToast } from '@/hooks/useAppToast';
import { publishRepositoryIcon, refreshRepositoryIcon, repositoryIconKey } from '@/data/repositoryIcons';
import { publishRepositoryActivity } from '@/data/repositoryActivityCache';
import { queryClient } from '@/data/queryClient';
import { createRepositoryIconThumbnail } from '@/utils/repositoryIconImage';
import type { RepositoryIconStateDto } from '@/shared/repositoryIcons';
import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';
import { RepositoryActivityRail } from '@/components/layout/sidebar/RepositoryActivityRail';
import { LocalReposSidebarContent } from '@/components/layout/sidebar/LocalReposSidebarContent';
import { LocalRepositoriesView } from '@/components/local-repositories/LocalRepositoriesView';
import { RepositoryIcon } from './RepositoryIcon';
import { RepositoryIconDialog, RepositoryIconDialogHost } from './RepositoryIconDialog';

vi.mock('@/contexts/AppStateContext', () => ({ useGitStore: vi.fn(), useRepositoryContext: vi.fn(), useUIContext: vi.fn(), useUIStore: vi.fn() }));
vi.mock('@/hooks/useRepoOrigins', () => ({ useCachedRepoOrigins: vi.fn() }));
vi.mock('@/hooks/useAppToast', () => ({ useAppToast: vi.fn() }));
vi.mock('@/utils/repositoryIconImage', () => ({ createRepositoryIconThumbnail: vi.fn() }));

const repo = 'C:/Projects/Alpha',
  other = 'D:/Projects/Alpha';
const png = 'data:image/png;base64,small',
  nextPng = 'data:image/png;base64,new';
const initial = (path = repo): RepositoryIconStateDto => ({
  repoPath: path,
  mode: 'auto',
  manualPath: null,
  selectionVersion: 'selection-1',
  revision: 3,
  thumbnail: null,
  candidates: ['logo.svg', 'assets/icon.svg'],
  limited: false,
  status: 'ready',
  error: null,
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('shared repository logos and selection', () => {
  let host: HTMLDivElement, root: Root, state: RepositoryIconStateDto;
  let listener: ((state: RepositoryIconStateDto) => void) | undefined;
  let repository: RepositoryContextValue;
  const get = vi.fn(),
    readSource = vi.fn(),
    choose = vi.fn(),
    cache = vi.fn(),
    selectFile = vi.fn(),
    unsubscribe = vi.fn(),
    subscribe = vi.fn();
  const closed = vi.fn();
  const render = (children: ReactNode) => act(async () => root.render(<I18nProvider language="en">{children}</I18nProvider>));
  const click = async (text: string) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === text);
    expect(button).toBeTruthy();
    await act(async () => button!.click());
  };
  const dialog = () => <RepositoryIconDialog repoPath={repo} onClose={closed} />;
  const cached = () => ({ ...initial(), thumbnail: { path: 'logo.svg', version: 'source-1', dataUrl: png } });

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    state = initial();
    listener = undefined;
    for (const mock of [get, readSource, choose, cache, selectFile, subscribe, unsubscribe, closed]) mock.mockReset();
    get.mockImplementation(async (path: string) => ({ success: true, data: { ...state, repoPath: path } }));
    readSource.mockResolvedValue({
      success: true,
      data: { path: 'logo.svg', version: 'source-1', dataUrl: 'data:image/svg+xml;base64,source', bytes: 12, mtimeMs: 1 },
    });
    vi.mocked(createRepositoryIconThumbnail).mockReset().mockResolvedValue(png);
    cache.mockImplementation(async (path, request) => {
      state = {
        ...state,
        repoPath: path,
        revision: state.revision + 1,
        thumbnail: { path: request.path, version: request.sourceVersion, dataUrl: request.dataUrl },
      };
      return { success: true, data: state };
    });
    choose.mockImplementation(async (_path, choice) => {
      state = { ...state, mode: choice.mode, manualPath: choice.path || null, selectionVersion: 'selection-2', revision: state.revision + 1, thumbnail: null };
      return { success: true, data: state };
    });
    selectFile.mockResolvedValue({ success: true, data: 'custom/photo.svg' });
    subscribe.mockImplementation((callback) => {
      listener = callback;
      return unsubscribe;
    });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        repos: {
          getRepositoryIcon: get,
          readRepositoryIconSource: readSource,
          saveRepositoryIconChoice: choose,
          cacheRepositoryIconThumbnail: cache,
          selectRepositoryIconFile: selectFile,
          onRepositoryIconChanged: subscribe,
        },
      } as unknown as ElectronAPI,
    });
    repository = {
      openRepos: [repo],
      activeRepo: repo,
      isRestoringRepos: true,
      repoMeta: {},
      repoSortBy: 'nameAsc',
      onSwitchRepo: vi.fn(),
      onOpenFolder: vi.fn(),
      onCloneByUrl: vi.fn(),
      onToggleRepoPin: vi.fn(),
      onCloseRepo: vi.fn(),
      onSetRepoSortBy: vi.fn(),
    } as unknown as RepositoryContextValue;
    const ui = { setActiveTab: vi.fn(), onCloseRunConfig: vi.fn(), onCloseRemoteConfig: vi.fn() } as unknown as UIContextValue;
    vi.mocked(useGitStore).mockImplementation((selector) => selector(repository));
    vi.mocked(useRepositoryContext).mockReturnValue(repository);
    vi.mocked(useUIContext).mockReturnValue(ui);
    vi.mocked(useUIStore).mockImplementation((selector) => selector(ui));
    vi.mocked(useCachedRepoOrigins).mockReturnValue({});
    vi.mocked(useAppToast).mockReturnValue(vi.fn());
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    delete (window as { electronAPI?: ElectronAPI }).electronAPI;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders and updates the same logo at all three entry points with one load and thumbnail generation', async () => {
    publishRepositoryActivity(repo, 7);
    await render(
      <Fragment>
        <RepositoryActivityRail />
        <LocalReposSidebarContent activeRepo={repo} count={1} isRestoringRepos={false} onOpenRepoTab={vi.fn()} onOpenFolder={vi.fn()} onCloneByUrl={vi.fn()} />
        <LocalRepositoriesView />
      </Fragment>,
    );
    expect(host.querySelectorAll('.repository-icon img')).toHaveLength(3);
    expect(get).toHaveBeenCalledOnce();
    expect(readSource).toHaveBeenCalledOnce();
    expect(cache).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledOnce();
    expect(cache).toHaveBeenCalledWith(repo, expect.objectContaining({ path: 'logo.svg', expectedRevision: 3, selectionVersion: 'selection-1' }));
    await act(async () => listener!({ ...state, revision: 9, thumbnail: { path: 'assets/icon.svg', version: 'source-2', dataUrl: nextPng } }));
    expect([...host.querySelectorAll('img')].map((image) => image.getAttribute('src'))).toEqual([nextPng, nextPng, nextPng]);
    expect(repository.onSwitchRepo).not.toHaveBeenCalled();
  });
  it('keeps accessible names and counts and opens the picker from the collapsed rail without switching repositories', async () => {
    state = cached();
    publishRepositoryActivity(repo, 3);
    await render(
      <>
        <RepositoryActivityRail />
        <RepositoryIconDialogHost />
      </>,
    );
    const entry =
      host.querySelector<HTMLButtonElement>('.repository-activity-button') || host.querySelector<HTMLButtonElement>('.repository-activity-rail button')!;
    expect(entry.getAttribute('aria-label')).toContain('Alpha');
    expect(entry.title).toContain('3 changed files');
    expect(entry.querySelector('.repository-activity-count')?.textContent).toBe('3');
    await act(async () => entry.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true })));
    await click('Repository logo …');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(repo);
    expect(repository.onSwitchRepo).not.toHaveBeenCalled();
  });
  it('falls back to initials on missing or broken images and retries a different thumbnail', async () => {
    state = { ...initial(), candidates: [] };
    await render(<RepositoryIcon repoPath={repo} name="Alpha" />);
    expect(host.textContent).toBe('AL');
    await act(async () => publishRepositoryIcon(cached()));
    await act(async () => host.querySelector('img')!.dispatchEvent(new Event('error')));
    expect(host.textContent).toBe('AL');
    await act(async () => publishRepositoryIcon({ ...cached(), revision: 5, thumbnail: { path: 'logo.svg', version: 'source-2', dataUrl: nextPng } }));
    expect(host.querySelector('img')?.src).toBe(nextPng);
  });
  it('skips invalid automatic image candidates', async () => {
    readSource.mockResolvedValueOnce({ success: false, error: 'not an image' });
    await render(<RepositoryIcon repoPath={repo} name="Alpha" />);
    expect(readSource.mock.calls.map((args) => args[1])).toEqual(['logo.svg', 'assets/icon.svg']);
    expect(host.querySelector('img')).toBeTruthy();
  });
  it('does not let late previews overwrite new preferences or a different repository', async () => {
    const pending = deferred<string>();
    vi.mocked(createRepositoryIconThumbnail).mockReturnValueOnce(pending.promise);
    await render(<RepositoryIcon repoPath={repo} name="Alpha" />);
    await act(async () => listener!({ ...initial(), mode: 'initials', selectionVersion: 'new', revision: 5 }));
    await act(async () => pending.resolve(png));
    expect(cache).not.toHaveBeenCalled();
    expect(host.textContent).toBe('AL');
    const read = deferred<{ success: true; data: RepositoryIconStateDto }>();
    get.mockReturnValueOnce(read.promise);
    await render(<RepositoryIcon key="new-repo" repoPath={other} name="Alpha" />);
    await render(<RepositoryIcon key="old-repo" repoPath={repo} name="Alpha" />);
    await act(async () => read.resolve({ success: true, data: { ...cached(), repoPath: other } }));
    expect(queryClient.getQueryData(repositoryIconKey(other))).toBeUndefined();
  });
  it('ignores outdated state events and reads, and releases the shared subscription on unmount', async () => {
    state = cached();
    await render(<RepositoryIcon repoPath={repo} name="Alpha" />);
    await act(async () => listener!({ ...initial(), revision: 1, mode: 'initials' }));
    expect(host.querySelector('img')).toBeTruthy();
    await render(null);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(repositoryIconKey(repo))).toBeUndefined();
  });
  it('changes manual selection as a draft, and cancel preserves the stored preference', async () => {
    state = cached();
    await render(dialog());
    await click('assets/icon.svg');
    await click('Cancel');
    expect(choose).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledOnce();
    expect(state.mode).toBe('auto');
  });
  it('saves a manually browsed file only after explicit Save without activating a repository', async () => {
    state = cached();
    await render(dialog());
    await click('Choose another image in the repository');
    expect(choose).not.toHaveBeenCalled();
    expect(document.querySelector('[title="custom/photo.svg"]')).toBeTruthy();
    await click('Save');
    expect(selectFile).toHaveBeenCalledExactlyOnceWith(repo);
    expect(choose).toHaveBeenCalledWith(repo, { mode: 'manual', path: 'custom/photo.svg', expectedSelectionVersion: 'selection-1' });
    expect(closed).toHaveBeenCalledOnce();
    expect(repository.onSwitchRepo).not.toHaveBeenCalled();
  });
  it('keeps the draft and error visible on a failed save or missing source', async () => {
    state = cached();
    choose.mockResolvedValue({ success: false, error: 'Cache directory is read-only' });
    await render(dialog());
    await click('assets/icon.svg');
    await click('Save');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('read-only');
    expect(document.querySelector('[title="assets/icon.svg"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(closed).not.toHaveBeenCalled();
    readSource.mockResolvedValue({ success: false, error: 'The file was deleted' });
    await click('Save');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('deleted');
    expect(choose).toHaveBeenCalledOnce();
  });
  it('keeps a stale dialog open when another window changes the preference', async () => {
    state = cached();
    await render(dialog());
    await act(async () => listener!({ ...state, selectionVersion: 'changed-in-other-window', revision: 9 }));
    choose.mockResolvedValue({ success: false, error: 'Repository logo selection changed' });
    await click('Save');
    expect(choose).toHaveBeenCalledWith(repo, expect.objectContaining({ expectedSelectionVersion: 'selection-1' }));
    expect(closed).not.toHaveBeenCalled();
  });
  it('rescan is explicit and does not save the dialog draft; reload failures are explained', async () => {
    state = cached();
    await render(dialog());
    await click('Search again');
    expect(get).toHaveBeenCalledWith(repo, true);
    expect(choose).not.toHaveBeenCalled();
    get.mockResolvedValue({ success: false, error: 'Repository removed' });
    await click('Search again');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('removed');
    await render(null);
    await render(dialog());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('removed');
  });
  it('cancels a file picker without changing the draft and supports the initials setting', async () => {
    state = cached();
    selectFile.mockResolvedValue({ success: true, data: null });
    await render(dialog());
    await click('Choose another image in the repository');
    expect(document.querySelectorAll('input[type="radio"]')[0].hasAttribute('checked')).toBe(true);
    await act(async () => document.querySelectorAll<HTMLInputElement>('input[type="radio"]')[2].click());
    await click('Save');
    expect(choose).toHaveBeenCalledWith(repo, { mode: 'initials', expectedSelectionVersion: 'selection-1' });
  });
  it('does not publish a dialog save completing after close', async () => {
    state = cached();
    const pending = deferred<{ success: true; data: RepositoryIconStateDto }>();
    choose.mockReturnValue(pending.promise);
    await render(dialog());
    await click('Save');
    await render(null);
    await act(async () => pending.resolve({ success: true, data: initial() }));
    expect(closed).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(repositoryIconKey(repo))).toBeUndefined();
  });
  it('background refresh never creates duplicate reads for the same displayed repository', async () => {
    state = cached();
    const pending = deferred<{ success: true; data: RepositoryIconStateDto }>();
    get.mockReturnValueOnce(pending.promise);
    await render(<RepositoryIcon repoPath={repo} name="Alpha" />);
    const one = refreshRepositoryIcon(repo),
      two = refreshRepositoryIcon(repo);
    expect(get).toHaveBeenCalledOnce();
    await act(async () => pending.resolve({ success: true, data: state }));
    await Promise.all([one, two]);
    expect(host.querySelector('img')).toBeTruthy();
  });
  it('discovers newly added repositories once asynchronous workspace persistence has registered them', async () => {
    vi.useFakeTimers();
    state = cached();
    get.mockResolvedValueOnce({ success: false, error: 'Repository logos are only available for saved repositories.' });
    await render(dialog());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('saved repositories');
    await act(async () => vi.advanceTimersByTimeAsync(750));
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('[role="dialog"] button.is-primary')?.hasAttribute('disabled')).toBe(false);
    expect(get).toHaveBeenCalledTimes(2);
  });
  it('bounds failed initial retries and cancels them when the repository is no longer displayed', async () => {
    vi.useFakeTimers();
    get.mockResolvedValue({ success: false, error: 'Repository removed' });
    await render(<RepositoryIcon repoPath={repo} name="Alpha" />);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(get).toHaveBeenCalledTimes(3);
    await render(null);
    await render(<RepositoryIcon repoPath={other} name="Alpha" />);
    await render(null);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(get).toHaveBeenCalledTimes(4);
  });
});
