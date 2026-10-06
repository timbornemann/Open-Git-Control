// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/data/queryClient';
import { resourceKey } from '@/data/clientCache';
import { hostingClient } from '@/services/hostingClient';
import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';
import type { RepositoryIconStateDto } from '@/shared/repositoryIcons';
import type { HostedRepository, HostingConnection, HostingPage } from '@/types/hostingDtos';
import { HostingCatalog } from './HostingCatalog';
import { useHostingCatalog } from './useHostingCatalog';
import { useHostingConnections } from './useHostingConnections';
import { useHostingState } from './hostingState';

const mocks = vi.hoisted(() => ({
  git: { activeRepo: 'C:/Work/project', openRepos: ['C:/Work/project'] },
  switchRepo: vi.fn(),
  request: vi.fn(),
  transfer: vi.fn(),
  icon: vi.fn(),
}));
vi.mock('@/contexts/AppStateContext', () => ({
  useGitStore: (selector: (value: unknown) => unknown) => selector({ ...mocks.git, onSwitchRepo: mocks.switchRepo, onAddRepo: vi.fn() }),
  useUIStore: (selector: (value: unknown) => unknown) => selector({ setActiveTab: vi.fn() }),
}));
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en }) }));

type Page = HostingPage<HostedRepository>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const page = (items: HostedRepository[], nextCursor: string | null = null): Page => ({ items, nextCursor });
let lastCatalog: ReturnType<typeof useHostingCatalog>;
function Harness() {
  useHostingConnections();
  lastCatalog = useHostingCatalog();
  return <HostingCatalog catalog={lastCatalog} />;
}

describe('hosting startup previews and independent background refreshes', () => {
  let host: HTMLDivElement;
  let root: Root;
  let accounts: HostingConnection[];
  let repos: HostedRepository[];
  let cached: Map<string, Page | ReturnType<typeof deferred<Page>>>;
  let online: Map<string, ReturnType<typeof deferred<Page>>>;
  let remoteChecks: ReturnType<typeof deferred<unknown>>;
  let restoration: ReturnType<typeof deferred<unknown>>;
  let serial = 0;
  const local = 'C:/Work/project';
  const logo = 'data:image/png;base64,saved-local-logo';
  const rows = () => [...host.querySelectorAll<HTMLElement>('.hosting-catalog > article')];
  const render = () => act(async () => root.render(<Harness />));

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    queryClient.clear();
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
    accounts = ['github', 'forgejo'].map((provider, index) => ({
      id: `startup-${++serial}`,
      provider: provider as HostingConnection['provider'],
      label: provider,
      baseUrl: index ? 'https://forge.example' : 'https://github.com',
      apiBaseUrl: index ? 'https://forge.example/api/v1' : 'https://api.github.com',
      userId: '7',
      username: 'user',
      authenticated: false,
      hasCredentials: true,
    }));
    repos = accounts.map((account) => ({
      ref: { connectionId: account.id, repositoryId: '12', fullPath: 'team/project' },
      name: 'project',
      fullName: 'team/project',
      cloneUrl: `${account.baseUrl}/team/project.git`,
      htmlUrl: `${account.baseUrl}/team/project`,
      description: `Saved ${account.label} description`,
      private: true,
      fork: false,
      defaultBranch: 'main',
    }));
    cached = new Map(repos.map((repo) => [repo.ref.connectionId, { ...page([repo]), stale: true }]));
    online = new Map(accounts.map((account) => [account.id, deferred<Page>()]));
    remoteChecks = deferred<unknown>();
    restoration = deferred<unknown>();
    mocks.git = { activeRepo: local, openRepos: [local] };
    mocks.switchRepo.mockReset().mockResolvedValue(true);
    mocks.request.mockReset().mockImplementation(async (operation, input) => {
      if (operation === 'connections') return { success: true, data: accounts };
      if (operation === 'capabilities') {
        await restoration.promise;
        return { success: true, data: {} };
      }
      if (operation === 'cachedRepositories') {
        const saved = cached.get(input.connectionId)!;
        return { success: true, data: 'promise' in saved ? await saved.promise : saved };
      }
      if (operation === 'repositories') {
        const data = await online.get(input.connectionId)!.promise;
        cached.set(input.connectionId, data);
        return { success: true, data };
      }
      if (operation === 'resolveRepository') {
        const stored = cached.get(input.connectionId)!;
        const items = input.cachedOnly ? ('items' in stored ? stored.items : []) : repos;
        const repo = items.find((r) => r.ref.connectionId === input.connectionId && [r.cloneUrl, r.sshUrl].includes(input.url));
        return { success: true, data: repo ?? null };
      }
      if (operation === 'logout') {
        accounts = accounts.map((account) => (account.id === input.connectionId ? { ...account, authenticated: false, hasCredentials: false } : account));
        return { success: true, data: true };
      }
      throw new Error(`Unexpected operation ${operation}`);
    });
    mocks.transfer.mockReset().mockImplementation(async (operation) => ({ success: true, data: operation === 'getRemotes' ? await remoteChecks.promise : {} }));
    mocks.icon.mockReset().mockImplementation(async (repoPath: string) => ({
      success: true,
      data: {
        repoPath,
        mode: 'auto',
        manualPath: null,
        selectionVersion: 'saved-selection',
        revision: 1,
        thumbnail: { path: 'logo.png', version: 'saved-version', dataUrl: logo },
        candidates: ['logo.png'],
        limited: false,
        status: 'ready',
        error: null,
      } satisfies RepositoryIconStateDto,
    }));
    window.electronAPI = {
      hosting: { hostingRequest: mocks.request },
      transfers: { remoteTransferRequest: mocks.transfer },
      repos: {
        getRepositoryIcon: mocks.icon,
        onRepositoryIconChanged: () => () => {},
      },
    } as unknown as ElectronAPI;
    queryClient.setQueryData(resourceKey('git', 'getRepoOriginUrl', [local]), { success: true, data: repos[0].cloneUrl });
    useHostingState.setState({ connections: [], selected: null, section: 'repositories', connectionFilter: '', revision: 0 });
  });
  afterEach(async () => {
    await act(async () => {
      root.unmount();
      queryClient.clear();
    });
    host.remove();
    delete (window as { electronAPI?: unknown }).electronAPI;
    vi.unstubAllGlobals();
  });

  it('shows saved descriptions, the local logo and the active mark while authentication, Git checks and both network catalogs are still pending', async () => {
    await render();
    expect(rows()).toHaveLength(2);
    expect(host.textContent).toContain('Saved github description');
    expect(host.textContent).toContain('Saved forgejo description');
    const active = rows().find((row) => row.classList.contains('is-active'))!;
    expect(active.querySelector('.hosting-signet img')?.getAttribute('src')).toBe(logo);
    expect(active.querySelector('.hosting-repository-active')?.textContent).toBe('ACTIVE');
    expect(lastCatalog.refreshing).toBe(true);
    const open = active.querySelector<HTMLButtonElement>('.hosting-local-clone')!;
    expect(open.disabled).toBe(false);
    await act(async () => open.click());
    expect(mocks.switchRepo).toHaveBeenCalledWith(local);
    expect(mocks.request.mock.calls.filter(([operation]) => operation === 'repositories')).toHaveLength(2);
    expect(accounts.every((account) => !account.authenticated)).toBe(true);
  });

  it('applies one refreshed account without waiting for a slower account and keeps its local logo', async () => {
    await render();
    await act(async () => online.get(accounts[0].id)!.resolve(page([{ ...repos[0], description: 'Fresh GitHub description' }])));
    expect(host.textContent).toContain('Fresh GitHub description');
    expect(host.textContent).toContain('Saved forgejo description');
    expect(
      rows()
        .find((row) => row.classList.contains('is-active'))!
        .querySelector('img')
        ?.getAttribute('src'),
    ).toBe(logo);
    expect(lastCatalog.refreshing).toBe(true);
  });

  it('resolves local clones from the disk catalog before authentication even without a restored origin preview', async () => {
    queryClient.removeQueries({ queryKey: resourceKey('git', 'getRepoOriginUrl', [local]), exact: true });
    const url = 'ssh://git@github.com:2222/team/project.git';
    repos[0] = { ...repos[0], sshUrl: url };
    cached.set(accounts[0].id, { ...page([repos[0]]), stale: true });
    mocks.git.openRepos = [local, 'D:/Work/unavailable'];
    mocks.transfer.mockImplementation(async (operation, input) => ({
      success: true,
      data: operation === 'getRemotes' ? (input.repoPath === local ? await remoteChecks.promise : await new Promise(() => {})) : {},
    }));
    remoteChecks.resolve({ repoPath: local, remotes: [{ name: 'origin', fetchUrls: [url], pushUrls: [url] }] });
    await render();
    expect(
      rows()
        .find((row) => row.classList.contains('is-active'))!
        .querySelector('img')
        ?.getAttribute('src'),
    ).toBe(logo);
    expect(mocks.request).toHaveBeenCalledWith('resolveRepository', { connectionId: accounts[0].id, url, cachedOnly: true });
    expect(mocks.request.mock.calls.filter(([operation, input]) => operation === 'resolveRepository' && !input.cachedOnly)).toHaveLength(0);
    expect(accounts.every((account) => !account.authenticated)).toBe(true);
  });

  it('rechecks an early cache miss when the first online catalog becomes available', async () => {
    queryClient.removeQueries({ queryKey: resourceKey('git', 'getRepoOriginUrl', [local]), exact: true });
    cached.set(accounts[0].id, { ...page([]), stale: true });
    remoteChecks.resolve({ repoPath: local, remotes: [{ name: 'origin', fetchUrls: [repos[0].cloneUrl], pushUrls: [repos[0].cloneUrl] }] });
    await render();
    expect(rows()).toHaveLength(1);
    await act(async () => online.get(accounts[0].id)!.resolve(page([repos[0]])));
    expect(rows()).toHaveLength(2);
    expect(
      rows()
        .find((row) => row.classList.contains('is-active'))!
        .querySelector('img')
        ?.getAttribute('src'),
    ).toBe(logo);
    expect(accounts.every((account) => !account.authenticated)).toBe(true);
  });

  it('does not replace fresh data with a late disk preview', async () => {
    const slowDisk = deferred<Page>();
    cached.set(accounts[0].id, slowDisk);
    await render();
    await act(async () => online.get(accounts[0].id)!.resolve(page([{ ...repos[0], description: 'New description' }])));
    await act(async () => slowDisk.resolve({ ...page([repos[0]]), stale: true }));
    expect(host.textContent).toContain('New description');
    expect(host.textContent).not.toContain('Saved github description');
  });

  it('retains previews after refresh errors and never shows an account snapshot after logout', async () => {
    await render();
    await act(async () => online.get(accounts[1].id)!.reject(new Error('Offline Forgejo')));
    expect(host.textContent).toContain('Saved forgejo description');
    await act(async () => {
      await hostingClient.request('logout', { connectionId: accounts[0].id });
      useHostingState.getState().setConnections(accounts);
    });
    await act(async () => online.get(accounts[0].id)!.resolve(page([repos[0]])));
    expect(rows()).toHaveLength(1);
    expect(host.textContent).not.toContain('Saved github description');
    expect(host.querySelector('.hosting-repository-active')).toBeNull();
  });

  it('keeps later cached pages until pagination finishes, then removes obsolete entries', async () => {
    const obsolete = {
      ...repos[0],
      ref: { ...repos[0].ref, repositoryId: 'gone', fullPath: 'team/gone' },
      name: 'gone',
      fullName: 'team/gone',
      cloneUrl: 'https://github.com/team/gone.git',
    };
    cached.set(accounts[0].id, { ...page([repos[0], obsolete]), stale: true });
    await render();
    await act(async () => {
      online.get(accounts[0].id)!.resolve(page([{ ...repos[0], description: 'Fresh first page' }], 'page-2'));
      online.get(accounts[1].id)!.resolve(page([repos[1]]));
    });
    expect(host.querySelector('button[aria-label="team/gone"]')).toBeTruthy();
    const second = { ...repos[0], ref: { ...repos[0].ref, repositoryId: 'new', fullPath: 'team/new' }, name: 'new', fullName: 'team/new' };
    mocks.request.mockImplementationOnce(async () => ({ success: true, data: page([second]) }));
    await act(async () => lastCatalog.loadMore(accounts[0].id, 'page-2'));
    expect(host.querySelector('button[aria-label="team/new"]')).toBeTruthy();
    expect(host.querySelector('button[aria-label="team/gone"]')).toBeNull();
    expect(host.textContent).toContain('Fresh first page');
  });
});
