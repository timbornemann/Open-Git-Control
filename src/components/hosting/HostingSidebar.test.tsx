// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostedRepository, HostingConnection } from '@/types/hostingDtos';
import type { RemotePreferences } from '@/types/remoteTransfers';
import { HostingSidebar } from './HostingSidebar';
import { useHostingState } from './hostingState';

const mocks = vi.hoisted(() => ({
  request: vi.fn<(operation: string, input?: unknown) => Promise<unknown>>(),
  transfer: vi.fn<(operation: string, input?: unknown) => Promise<unknown>>(),
  setTab: vi.fn(),
  openRemotes: vi.fn(),
  toast: vi.fn(),
  activeTab: 'repo',
}));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: mocks.request }, transferClient: { request: mocks.transfer } }));
vi.mock('@/contexts/AppStateContext', () => ({
  useGitStore: (selector: (value: unknown) => unknown) => selector({ activeRepo: 'C:/Code/project', onToast: mocks.toast }),
  useUIStore: (selector: (value: unknown) => unknown) =>
    selector({ activeTab: mocks.activeTab, setActiveTab: mocks.setTab, onOpenRemoteConfig: mocks.openRemotes }),
}));
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en }) }));

const connection = (id: string, provider: HostingConnection['provider'], baseUrl: string): HostingConnection => ({
  id,
  provider,
  baseUrl,
  apiBaseUrl: `${baseUrl}/api`,
  label: `${provider} · ${id}`,
  username: id,
  userId: id,
  authenticated: true,
  hasCredentials: true,
});
const repository = (account: HostingConnection): HostedRepository => ({
  ref: { connectionId: account.id, repositoryId: '12', fullPath: 'team/project' },
  name: 'project',
  fullName: 'team/project',
  cloneUrl: `${account.baseUrl}/team/project.git`,
  htmlUrl: `${account.baseUrl}/team/project`,
  private: true,
  description: '',
  defaultBranch: 'main',
  fork: false,
});

describe('hosting sidebar navigation', () => {
  let host: HTMLDivElement;
  let root: Root;
  let accounts: HostingConnection[];
  let repos: HostedRepository[];
  let preferences: RemotePreferences;
  let saveError: Error | undefined;
  const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent?.trim() === label)!;
  const render = (local = true) => act(async () => root.render(createElement(HostingSidebar, { local })));
  const click = async (label: string) => {
    expect(button(label)).toBeTruthy();
    await act(async () => button(label).click());
  };
  const choose = async (index: number) => {
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Hosting target"]')!;
    expect(select).toBeTruthy();
    await act(async () => {
      select.value = String(index);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  const expectNoTransfers = () => {
    expect(mocks.transfer.mock.calls.every(([operation]) => ['getRemotes', 'getPreferences', 'setPreferences'].includes(operation))).toBe(true);
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.clearAllMocks();
    mocks.activeTab = 'repo';
    accounts = [connection('personal', 'github', 'https://github.com')];
    repos = accounts.map(repository);
    preferences = {};
    saveError = undefined;
    useHostingState.setState({ connections: [], selected: null, section: 'repositories', connectionFilter: '', revision: 0 });
    mocks.request.mockImplementation(async (operation, rawInput) => {
      const input = rawInput as { connectionId?: string; url?: string; repository?: HostedRepository['ref'] } | undefined;
      if (operation === 'connections') return accounts;
      if (operation === 'resolveRepository') return repos.find((repo) => repo.ref.connectionId === input?.connectionId && repo.cloneUrl === input?.url) ?? null;
      if (operation === 'repository') return repos.find((repo) => repo.ref.connectionId === input?.repository?.connectionId);
      throw new Error(`Unexpected hosting operation: ${operation}`);
    });
    mocks.transfer.mockImplementation(async (operation, rawInput) => {
      if (operation === 'getRemotes')
        return {
          repoPath: 'C:/Code/project',
          branch: 'main',
          upstream: { remote: 'origin', branch: 'main' },
          defaultPushRemote: 'origin',
          supportsPushUrlIsolation: true,
          remotes: repos.map((repo, index) => ({ name: index ? `backup-${index}` : 'origin', fetchUrls: [repo.cloneUrl], pushUrls: [repo.cloneUrl] })),
        };
      if (operation === 'getPreferences') return preferences;
      if (operation === 'setPreferences') {
        if (saveError) throw saveError;
        preferences = (rawInput as { preferences: RemotePreferences }).preferences;
        return preferences;
      }
      throw new Error(`Unexpected transfer operation: ${operation}`);
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('shows one target without redundant selection and opens its features or remote configuration without a transfer', async () => {
    await render();
    expect(host.querySelector('select')).toBeNull();
    expect(host.textContent).toContain('team/project');
    expect(host.textContent).toContain('github.com');
    expect(host.textContent).toContain('@personal');
    await click('GitHub Actions');
    expect(useHostingState.getState().selected?.ref).toEqual(repos[0].ref);
    expect(useHostingState.getState().section).toBe('ci');
    expect(mocks.setTab).toHaveBeenCalledWith('hosting');
    mocks.setTab.mockClear();
    await click('Remote configuration');
    expect(mocks.openRemotes).toHaveBeenCalledOnce();
    expect(mocks.setTab).not.toHaveBeenCalled();
    expectNoTransfers();
  });

  it('keeps complete target identities across providers, servers and accounts with the same repository ID and namespace', async () => {
    accounts.push(connection('private', 'forgejo', 'https://forge.example:3443/git'), connection('company', 'gitlab', 'https://gitlab.example'));
    repos = accounts.map(repository);
    preferences = {
      hostingRemote: 'origin',
      hostingRepository: repos[0].ref,
      fetchRemote: 'origin',
      bindings: repos.map((repo, index) => ({ remoteName: index ? `backup-${index}` : 'origin', url: repo.cloneUrl, repository: repo.ref })),
    };
    await render();
    expect(host.querySelectorAll('option')).toHaveLength(3);
    await choose(1);
    expect(preferences.hostingRemote).toBe('backup-1');
    expect(preferences.hostingRepository).toEqual(repos[1].ref);
    expect(preferences.fetchRemote).toBe('origin');
    expect(preferences.bindings).toHaveLength(3);
    expect(host.textContent).toContain('forge.example:3443/git');
    expect(host.textContent).toContain('@private');
    await click('Forgejo Actions');
    expect(useHostingState.getState().selected?.ref).toEqual(repos[1].ref);
    await choose(2);
    expect(button('Merge Requests')).toBeTruthy();
    await click('Merge Requests');
    expect(useHostingState.getState().selected?.ref).toEqual(repos[2].ref);
    expect(useHostingState.getState().section).toBe('changes');
    expectNoTransfers();
  });

  it('requests an ambiguous target explicitly and preserves it when saving another target fails', async () => {
    accounts.push(connection('work', 'github', 'https://github.com'));
    repos = accounts.map(repository);
    await render();
    expect(host.textContent).toContain('Choose a hosting target');
    expect(button('Pull Requests')).toBeUndefined();
    await choose(0);
    expect(preferences.hostingRepository).toEqual(repos[0].ref);
    saveError = new Error('Cannot save hosting target');
    await choose(1);
    expect(mocks.toast).toHaveBeenCalledWith('Cannot save hosting target', true);
    expect(preferences.hostingRepository).toEqual(repos[0].ref);
    expect(host.textContent).toContain('@personal');
    expectNoTransfers();
  });

  it('uses the shared collapsible section and highlights the active global hosting destination', async () => {
    mocks.activeTab = 'hosting';
    useHostingState.setState({ section: 'connections' });
    await render(false);
    expect(button('Accounts & servers').getAttribute('aria-current')).toBe('page');
    expect(button('Repository catalog').hasAttribute('aria-current')).toBe(false);
    await click('Hosting');
    expect(button('Accounts & servers')).toBeUndefined();
    await click('Hosting');
    await click('Repository catalog');
    expect(useHostingState.getState().section).toBe('repositories');
    expectNoTransfers();
  });
});
