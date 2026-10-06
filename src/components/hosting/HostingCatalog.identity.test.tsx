// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { queryClient } from '@/data/queryClient';
import { repositoryIconKey } from '@/data/repositoryIcons';
import type { RepositoryIconStateDto } from '@/shared/repositoryIcons';
import type { HostedRepository, HostingCapabilities, HostingConnection } from '@/types/hostingDtos';
import { HostingCatalog } from './HostingCatalog';
import { HostingRepositoryDetail } from './HostingRepositoryDetail';
import { hostedRepositoryKey, useHostingState } from './hostingState';
import type { useHostingCatalog } from './useHostingCatalog';

const mocks = vi.hoisted(() => ({ activeRepo: null as string | null, request: vi.fn(), activateLocal: vi.fn() }));
vi.mock('@/contexts/AppStateContext', () => ({
  useGitStore: (selector: (state: { activeRepo: string | null }) => unknown) => selector({ activeRepo: mocks.activeRepo }),
}));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: mocks.request } }));
vi.mock('./useRepositoryHosting', () => ({
  useRepositoryHosting: () => ({ endpoints: [], repository: null, choose: vi.fn() }),
}));

const local = 'C:/Work/project';
const otherLocal = 'D:/Work/project';
const firstClone = 'C:/Archive/project';
const firstLogo = 'data:image/png;base64,first-logo';
const secondLogo = 'data:image/png;base64,second-logo';
const accounts: HostingConnection[] = [
  { id: 'github', provider: 'github', label: 'GitHub', baseUrl: 'https://github.com' },
  { id: 'forgejo', provider: 'forgejo', label: 'Forgejo', baseUrl: 'https://forge.example' },
].map((account) => ({ ...account, apiBaseUrl: account.baseUrl, authenticated: true, hasCredentials: true, tokenPersisted: true })) as HostingConnection[];
const repos: HostedRepository[] = [
  ...accounts.map((account) => ({
    ref: { connectionId: account.id, repositoryId: '12', fullPath: 'team/project' },
    name: 'project',
    fullName: 'team/project',
    cloneUrl: `${account.baseUrl}/team/project.git`,
    htmlUrl: `${account.baseUrl}/team/project`,
    description: account.label,
    private: false,
    fork: false,
    defaultBranch: 'main',
  })),
  {
    ref: { connectionId: accounts[0].id, repositoryId: '13', fullPath: 'other/project' },
    name: 'project',
    fullName: 'other/project',
    cloneUrl: 'https://github.com/other/project.git',
    htmlUrl: 'https://github.com/other/project',
    description: null,
    private: true,
    fork: false,
    defaultBranch: 'main',
  },
];
const capabilities: HostingCapabilities = {
  createRepository: false,
  fork: false,
  defaultBranchOnlyFork: false,
  changeRequests: false,
  changeRequestLabel: 'Pull requests',
  mergeMethods: [],
  ciLabel: 'CI',
  runs: false,
  jobs: false,
  steps: false,
  logs: false,
  artifacts: false,
  cancelRun: false,
  retryRun: false,
  dispatch: false,
  releases: 'tags',
  releaseAssets: false,
  draftRelease: false,
  prerelease: false,
};

const cachedLogo = (path: string, dataUrl: string): RepositoryIconStateDto => ({
  repoPath: path,
  mode: 'auto',
  manualPath: null,
  selectionVersion: 'selection',
  revision: 1,
  thumbnail: { path: 'logo.png', version: dataUrl, dataUrl },
  candidates: ['logo.png'],
  limited: false,
  status: 'ready',
  error: null,
});

describe('hosting catalog local identity', () => {
  let host: HTMLDivElement;
  let root: Root;
  let catalog: ReturnType<typeof useHostingCatalog>;
  const render = (content: ReactNode = <HostingCatalog catalog={catalog} />) =>
    act(async () => root.render(<I18nProvider language="en">{content}</I18nProvider>));
  const rows = () => [...host.querySelectorAll<HTMLElement>('.hosting-catalog > article')];
  const icon = (element: Element) => element.querySelector<HTMLImageElement>('.hosting-signet img')?.getAttribute('src');

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    mocks.activeRepo = local;
    mocks.activateLocal.mockReset();
    mocks.request.mockReset().mockResolvedValue(capabilities);
    useHostingState.setState({ connections: accounts, selected: null, section: 'repositories', connectionFilter: '', revision: 0 });
    queryClient.setQueryData(repositoryIconKey(local), cachedLogo(local, firstLogo));
    queryClient.setQueryData(repositoryIconKey(otherLocal), cachedLogo(otherLocal, secondLogo));
    catalog = {
      activeRepo: local,
      repositories: repos,
      pages: {},
      refreshing: false,
      connections: accounts,
      clones: { [hostedRepositoryKey(repos[0])]: [local], [hostedRepositoryKey(repos[1])]: [otherLocal] },
      task: { busy: false, error: null, run: async () => undefined, setError: vi.fn(), cancel: vi.fn() },
      pins: [],
      togglePin: vi.fn(),
      activateLocal: mocks.activateLocal,
      clone: vi.fn(),
      loadMore: vi.fn(),
      providerFilter: '',
      setProviderFilter: vi.fn(),
      search: '',
      setSearch: vi.fn(),
    };
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('shows the shared local logos without confusing equal repository names or IDs across servers', async () => {
    await render();
    expect(icon(rows()[0])).toBe(firstLogo);
    expect(icon(rows()[1])).toBe(secondLogo);
    expect(rows()[0].classList.contains('is-active')).toBe(true);
    expect(rows()[0].querySelector('.hosting-repository-active')?.textContent).toBe('ACTIVE');
    expect(rows()[1].classList.contains('is-active')).toBe(false);
    expect(rows()[1].querySelector('.hosting-repository-active')).toBeNull();
    expect(rows()[2].querySelector('.repository-icon')).toBeNull();
    expect(rows()[2].querySelector('.hosting-signet > svg')).toBeTruthy();
    expect(rows()[2].querySelector('.hosting-repository-active')).toBeNull();
    const cloneButton = rows()[0].querySelector<HTMLButtonElement>('.hosting-local-clone')!;
    expect(cloneButton.getAttribute('aria-current')).toBe('true');
    expect(icon(cloneButton)).toBe(firstLogo);
    await act(async () => cloneButton.click());
    expect(mocks.activateLocal).toHaveBeenCalledExactlyOnceWith(local);
  });

  it('prefers the active clone, matches Windows path aliases and moves the marker after a repository switch', async () => {
    queryClient.setQueryData(repositoryIconKey(firstClone), cachedLogo(firstClone, secondLogo));
    catalog = { ...catalog, activeRepo: 'c:\\WORK\\project\\', clones: { ...catalog.clones, [hostedRepositoryKey(repos[0])]: [firstClone, local] } };
    await render();
    expect(icon(rows()[0])).toBe(firstLogo);
    expect(rows()[0].classList.contains('is-active')).toBe(true);
    expect(rows()[0].querySelectorAll('.hosting-local-clone[aria-current="true"]')).toHaveLength(1);
    catalog = { ...catalog, activeRepo: otherLocal };
    await render();
    expect(rows()[0].querySelector('.hosting-repository-active')).toBeNull();
    expect(icon(rows()[0])).toBe(secondLogo);
    expect(rows()[1].querySelector('.hosting-repository-active')?.textContent).toBe('ACTIVE');
  });

  it('updates a displayed logo through the existing shared cache', async () => {
    await render();
    await act(async () => queryClient.setQueryData(repositoryIconKey(local), { ...cachedLogo(local, secondLogo), revision: 2 }));
    expect(icon(rows()[0])).toBe(secondLogo);
    expect(icon(rows()[0].querySelector('.hosting-local-clone')!)).toBe(secondLogo);
  });

  it('shows the same logo and active marker on the detail subpage and its local clone list', async () => {
    mocks.activeRepo = 'c:\\WORK\\project\\';
    await render(<HostingRepositoryDetail repository={repos[0]} localPaths={[firstClone, local]} onActivateLocal={mocks.activateLocal} />);
    expect(icon(host.querySelector('.hosting-detail__identity')!)).toBe(firstLogo);
    expect(host.querySelector('.hosting-detail__account .hosting-repository-active')?.textContent).toBe('ACTIVE');
    const activeClone = host.querySelector<HTMLButtonElement>('.hosting-local-paths button[aria-current="true"]')!;
    expect(icon(activeClone)).toBe(firstLogo);
    expect(activeClone.textContent).toContain(local);
    await act(async () => activeClone.click());
    expect(mocks.activateLocal).toHaveBeenCalledExactlyOnceWith(local);
    await render(<HostingRepositoryDetail key="remote-only" repository={repos[2]} />);
    expect(host.querySelector('.hosting-detail__identity .repository-icon')).toBeNull();
    expect(host.querySelector('.hosting-detail__account .hosting-repository-active')).toBeNull();
  });
});
