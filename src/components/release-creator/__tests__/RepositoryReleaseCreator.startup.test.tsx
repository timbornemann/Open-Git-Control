// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { useHostingState } from '@/components/hosting/hostingState';
import { useHostingConnections } from '@/components/hosting/useHostingConnections';
import type { HostedRepository, HostingConnection } from '@/types/hostingDtos';
import { RepositoryReleaseCreator } from '../RepositoryReleaseCreator';
import { useReleaseDraftState } from '../releaseDraftState';

const mocks = vi.hoisted(() => ({ request: vi.fn(), transfer: vi.fn(), toast: vi.fn(), activeRepo: 'C:/repo' }));
vi.mock('@/services/hostingClient', () => ({
  hostingClient: { request: mocks.request, sessionVersion: () => 0 },
  transferClient: { request: mocks.transfer },
}));
vi.mock('@/hooks/useAppToast', () => ({ useAppToast: () => mocks.toast }));
vi.mock('@/contexts/AppStateContext', () => ({
  useGitStore: (select: (state: unknown) => unknown) => select({ currentBranch: 'main', refreshTrigger: 0, triggerRefresh: vi.fn() }),
  useSettingsStore: (select: (state: unknown) => unknown) => select({ settings: { language: 'en' } }),
  useUIStore: (select: (state: unknown) => unknown) => select({ onOpenRemoteConfig: vi.fn(), setActiveTab: vi.fn(), setConfirmDialog: vi.fn() }),
  useAppStateReader: () => () => ({ repository: { activeRepo: mocks.activeRepo } }),
}));

const caps = { releases: 'native', releaseAssets: true, draftRelease: true, prerelease: true };
const history = {
  existingTags: ['v1.0.0'],
  lastReleaseTag: 'v1.0.0',
  targetOid: 'a'.repeat(40),
  commitsTarget: 'main',
  fallbackUsed: false,
  commitsSinceLastRelease: [],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function AnotherConsumer() {
  useHostingConnections();
  return null;
}
function Harness({ repoPath = 'C:/repo', visible = true, sibling = false }: { repoPath?: string; visible?: boolean; sibling?: boolean }) {
  return (
    <I18nProvider language="en">
      {sibling && <AnotherConsumer />}
      {visible && <RepositoryReleaseCreator repoPath={repoPath} requestedTarget={null} />}
    </I18nProvider>
  );
}
let host: HTMLDivElement;
let root: Root;
let account: HostingConnection;
let repository: HostedRepository;
let serial = 0;
const render = async (props = {}) => act(async () => root.render(createElement(Harness, props)));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  account = {
    id: `release-startup-${++serial}`,
    provider: 'github',
    baseUrl: 'https://github.com',
    apiBaseUrl: 'https://api.github.com',
    label: 'GitHub',
    username: 'user',
    authenticated: true,
    hasCredentials: true,
  };
  repository = {
    ref: { connectionId: account.id, repositoryId: '1', fullPath: 'team/repo' },
    name: 'repo',
    fullName: 'team/repo',
    description: null,
    cloneUrl: 'https://github.com/team/repo.git',
    htmlUrl: 'https://github.com/team/repo',
    defaultBranch: 'main',
    private: false,
    fork: false,
  };
  mocks.activeRepo = 'C:/repo';
  mocks.toast.mockReset();
  mocks.request.mockReset().mockImplementation(async (operation) => {
    if (operation === 'connections') return [account];
    if (operation === 'resolveRepository' || operation === 'repository') return repository;
    if (operation === 'capabilities') return caps;
    if (operation === 'releaseContext') return history;
    throw new Error(`Unexpected request: ${operation}`);
  });
  mocks.transfer
    .mockReset()
    .mockImplementation(async (operation) =>
      operation === 'getRemotes' ? { remotes: [{ name: 'origin', fetchUrls: [repository.cloneUrl], pushUrls: [repository.cloneUrl] }] } : {},
    );
  useHostingState.setState({ connections: [], revision: 0 });
  useReleaseDraftState.setState({ sessions: {} });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('release creator startup feedback', () => {
  it('waits for accounts, remote discovery, metadata and history without a missing-target warning', async () => {
    const accounts = deferred<HostingConnection[]>();
    const metadata = deferred<HostedRepository>();
    const context = deferred<typeof history>();
    mocks.request.mockImplementation(async (operation) => {
      if (operation === 'connections') return accounts.promise;
      if (operation === 'repository') return metadata.promise;
      if (operation === 'resolveRepository') return repository;
      if (operation === 'capabilities') return caps;
      if (operation === 'releaseContext') return context.promise;
    });
    await render();
    expect(host.textContent).toContain('Loading hosting target');
    expect(host.textContent).not.toContain('Hosting target missing');
    expect(mocks.toast).not.toHaveBeenCalled();
    await act(async () => accounts.resolve([account]));
    expect(mocks.toast).not.toHaveBeenCalled();
    await act(async () => metadata.resolve(repository));
    expect(mocks.toast).not.toHaveBeenCalled();
    await act(async () => context.resolve(history));
    expect(host.textContent).toContain('origin · GitHub');
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('v1.0.1');
    expect(host.querySelectorAll('.release-alert, .release-page-message, [role="alert"]')).toHaveLength(0);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('waits for an authentication restoration already started by another consumer', async () => {
    account = { ...account, authenticated: false };
    const restoration = deferred<typeof caps>();
    mocks.request.mockImplementation(async (operation, input) => {
      if (operation === 'connections') return [account];
      if (operation === 'capabilities' && !input.repository) {
        const result = await restoration.promise;
        account = { ...account, authenticated: true };
        return result;
      }
      if (operation === 'capabilities') return caps;
      if (operation === 'repository' || operation === 'resolveRepository') return repository;
      if (operation === 'releaseContext') return history;
    });
    await render({ visible: false, sibling: true });
    await render({ visible: true, sibling: true });
    expect(host.textContent).toContain('Loading hosting target');
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.request.mock.calls.filter(([operation, input]) => operation === 'capabilities' && !input.repository)).toHaveLength(1);
    await act(async () => restoration.resolve(caps));
    expect(host.textContent).toContain('origin · GitHub');
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('reports a truly missing mapping once through central feedback after initialization', async () => {
    mocks.request.mockImplementation(async (operation) => (operation === 'connections' ? [] : null));
    await render();
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Hosting target missing'), true);
    expect(host.textContent).toContain('No target configured');
    expect(host.textContent).not.toContain('Hosting target missing');
    await render();
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it('reports account loading failures as errors rather than a missing configuration', async () => {
    mocks.request.mockRejectedValue(new Error('Could not load saved accounts'));
    await render();
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith('Could not load saved accounts', true);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('ignores an old repository failure after switching to another local repository', async () => {
    const old = deferred<HostedRepository>();
    const next = {
      ...repository,
      ref: { ...repository.ref, repositoryId: '2', fullPath: 'team/next' },
      fullName: 'team/next',
      cloneUrl: 'https://github.com/team/next.git',
    };
    mocks.request.mockImplementation(async (operation, input) => {
      if (operation === 'connections') return [account];
      if (operation === 'resolveRepository') return input.url === next.cloneUrl ? next : repository;
      if (operation === 'repository') return input.repository.repositoryId === '2' ? next : old.promise;
      if (operation === 'capabilities') return caps;
      if (operation === 'releaseContext') return history;
    });
    mocks.transfer.mockImplementation(async (operation, input) =>
      operation === 'getRemotes'
        ? { remotes: [{ name: 'origin', fetchUrls: [input.repoPath === 'C:/next' ? next.cloneUrl : repository.cloneUrl], pushUrls: [] }] }
        : {},
    );
    await render();
    mocks.activeRepo = 'C:/next';
    await render({ repoPath: 'C:/next' });
    await act(async () => old.reject(new Error('Obsolete repository access denied')));
    expect(host.textContent).toContain('team/next');
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
