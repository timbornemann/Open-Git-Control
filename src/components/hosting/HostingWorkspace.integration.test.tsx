// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostedRepository, HostingCapabilities, HostingConnection } from '@/types/hostingDtos';
import type { RemotePreferences } from '@/types/remoteTransfers';
import { HostingWorkspace } from './HostingWorkspace';
import { useHostingState } from './hostingState';

const mocks = vi.hoisted(() => ({
  request: vi.fn<(operation: string, input?: unknown) => Promise<unknown>>(),
  transfer: vi.fn<(operation: string, input?: unknown) => Promise<unknown>>(),
  switchRepo: vi.fn(),
  addRepo: vi.fn(),
  setTab: vi.fn(),
  openCreator: vi.fn(),
  openPublication: vi.fn(),
  refreshGit: vi.fn(),
  toast: vi.fn(),
  git: { activeRepo: 'C:/Code/mirrored' as string | null, openRepos: ['C:/Code/mirrored'], currentBranch: 'main' },
}));
vi.mock('@/services/hostingClient', () => ({
  hostingClient: { request: mocks.request, cachedRepositories: () => undefined },
  transferClient: { request: mocks.transfer },
}));
vi.mock('@/contexts/AppStateContext', () => ({
  useGitStore: (selector: (value: unknown) => unknown) =>
    selector({ ...mocks.git, onSwitchRepo: mocks.switchRepo, onAddRepo: mocks.addRepo, triggerRefresh: mocks.refreshGit, onToast: mocks.toast }),
  useUIStore: (selector: (value: unknown) => unknown) => selector({ setActiveTab: mocks.setTab, onOpenRepositoryPublication: mocks.openPublication }),
  useOptionalRepositoryContext: () => ({ onToast: mocks.toast }),
  useOptionalUIContext: () => ({ onOpenRepositoryPublication: mocks.openPublication }),
  useAppStateReader: () => () => ({ repository: { ...mocks.git, onSwitchRepo: mocks.switchRepo }, ui: { onOpenReleaseCreator: mocks.openCreator } }),
}));
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en }) }));
vi.mock('@/services/appClient', () => ({
  appClient: { selectProjectParentDirectory: async () => 'C:/Clones', selectFiles: async () => ['C:/Exports/source.zip'], openExternalUrl: vi.fn() },
}));

const mirror = 'C:/Code/mirrored';
const head = 'a'.repeat(40);
const capabilities: HostingCapabilities = {
  createRepository: true,
  fork: false,
  defaultBranchOnlyFork: false,
  changeRequests: true,
  changeRequestLabel: 'Pull requests',
  mergeMethods: ['merge'],
  ciLabel: 'CI',
  runs: true,
  jobs: true,
  steps: true,
  logs: true,
  artifacts: true,
  cancelRun: true,
  retryRun: true,
  dispatch: true,
  releases: 'native',
  releaseAssets: true,
  draftRelease: true,
  prerelease: true,
};
const connection = (id: string, provider: 'forgejo' | 'github'): HostingConnection => ({
  id,
  provider,
  label: provider === 'forgejo' ? 'Private Forgejo' : 'GitHub Backup',
  baseUrl: provider === 'forgejo' ? 'https://forge.example' : 'https://github.com',
  apiBaseUrl: provider === 'forgejo' ? 'https://forge.example/api/v1' : 'https://api.github.com',
  username: `${provider}-user`,
  userId: `${provider}-user-id`,
  authenticated: true,
  hasCredentials: true,
  tokenPersisted: true,
});
const repository = (account: HostingConnection): HostedRepository => ({
  ref: { connectionId: account.id, repositoryId: '12', fullPath: 'team/project' },
  name: 'project',
  fullName: 'team/project',
  private: account.provider === 'forgejo',
  cloneUrl: `${account.baseUrl}/team/project.git`,
  htmlUrl: `${account.baseUrl}/team/project`,
  description: `${account.provider} catalog entry`,
  defaultBranch: 'main',
  fork: false,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('multi-provider hosting acceptance', () => {
  let host: HTMLDivElement;
  let root: Root;
  let accounts: HostingConnection[];
  let repos: HostedRepository[];
  let preferences: RemotePreferences;
  let override: ((operation: string, input: Record<string, unknown>) => Promise<unknown> | undefined) | undefined;
  const page = <T,>(items: T[]) => ({ items, nextCursor: null });
  const buttons = (label: string, container: ParentNode = document.body) =>
    [...container.querySelectorAll<HTMLButtonElement>('button')].filter(
      (button) => (button.getAttribute('aria-label') ?? button.textContent?.trim()) === label,
    );
  const click = async (element: Element | undefined | null) => {
    expect(element).toBeTruthy();
    await act(async () => (element as HTMLElement).click());
  };
  const change = async (element: HTMLInputElement | HTMLSelectElement, value: string) => {
    await act(async () => {
      if (element instanceof HTMLSelectElement) {
        element.value = value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  };
  const rows = () => [...host.querySelectorAll<HTMLElement>('.hosting-catalog > article')];
  const row = (provider: string) => rows().find((item) => item.querySelector('p')?.textContent === `${provider} catalog entry`)!;
  const render = () => act(async () => root.render(createElement(HostingWorkspace)));

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, value: string) => storage.set(key, String(value)),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    mocks.request.mockReset();
    mocks.transfer.mockReset();
    mocks.refreshGit.mockReset();
    mocks.toast.mockReset();
    mocks.switchRepo.mockReset().mockResolvedValue(true);
    mocks.addRepo.mockReset().mockResolvedValue(true);
    mocks.setTab.mockReset();
    mocks.openCreator.mockReset();
    mocks.git = { activeRepo: mirror, openRepos: [mirror], currentBranch: 'main' };
    accounts = [connection('forgejo-private', 'forgejo'), connection('github-backup', 'github')];
    repos = accounts.map(repository);
    preferences = {
      hostingRemote: 'origin',
      hostingRepository: repos[0].ref,
      bindings: repos.map((repo, index) => ({ remoteName: index ? 'backup' : 'origin', url: repo.cloneUrl, repository: repo.ref })),
    };
    override = undefined;
    useHostingState.setState({ connections: [], selected: null, section: 'repositories', connectionFilter: '', revision: 0 });
    mocks.transfer.mockImplementation(async (operation, input) => {
      if (operation === 'getRemotes')
        return {
          repoPath: mirror,
          branch: 'main',
          upstream: { remote: 'origin', branch: 'main' },
          defaultPushRemote: 'origin',
          supportsPushUrlIsolation: true,
          remotes: repos.map((repo, index) => ({ name: index ? 'backup' : 'origin', fetchUrls: [repo.cloneUrl], pushUrls: [repo.cloneUrl] })),
        };
      if (operation === 'getPreferences') return preferences;
      if (operation === 'setPreferences') {
        preferences = (input as { preferences: RemotePreferences }).preferences;
        return preferences;
      }
      throw new Error(`Unexpected transfer operation: ${operation}`);
    });
    mocks.request.mockImplementation(async (operation, rawInput) => {
      const input = (rawInput || {}) as Record<string, unknown>;
      const overridden = override?.(operation, input);
      if (overridden) return overridden;
      const ref = input.repository as HostedRepository['ref'] | undefined;
      const repo = repos.find((candidate) => candidate.ref.connectionId === (ref?.connectionId || input.connectionId)) || repos[0];
      const provider = accounts.find((account) => account.id === repo.ref.connectionId)!.provider;
      if (operation === 'connections') return accounts;
      if (operation === 'repositories') return page([repo]);
      if (operation === 'creationTargets') return { ...page([]), requiresProject: false, allowsManual: true };
      if (operation === 'cachedRepositories') return { ...page([]), stale: true };
      if (operation === 'repository') return repo;
      if (operation === 'capabilities') return { ...capabilities, ciLabel: provider === 'github' ? 'GitHub Actions' : 'Forgejo Actions' };
      if (operation === 'resolveRepository')
        return repos.find((candidate) => candidate.ref.connectionId === input.connectionId && candidate.cloneUrl === input.url) || null;
      if (operation === 'changeRequests')
        return page([
          {
            id: '31',
            number: '31',
            title: `${provider} change request`,
            author: `${provider}-user`,
            state: 'open',
            draft: false,
            source: repo.ref,
            target: repo.ref,
            sourceBranch: 'feature',
            targetBranch: 'main',
            headSha: head,
            htmlUrl: `${repo.htmlUrl}/pulls/31`,
          },
        ]);
      if (operation === 'checkoutChangeRequest') return true;
      if (operation === 'status') return { state: 'success', checks: [] };
      if (operation === 'runs')
        return page([
          {
            id: '7',
            number: '7',
            name: `${provider} workflow`,
            branch: 'main',
            headSha: head,
            status: 'completed',
            conclusion: 'success',
            htmlUrl: `${repo.htmlUrl}/actions/runs/7`,
          },
        ]);
      if (operation === 'jobs') return page([{ id: '9', name: `${provider} build`, status: 'completed', conclusion: 'success', steps: [] }]);
      if (operation === 'artifacts') return page([{ id: '10', name: `${provider} artifact`, downloadable: true }]);
      if (operation === 'logs') return { text: `${provider} log text`, truncated: false, nextCursor: null };
      if (operation === 'downloadArtifact') return { path: `C:/Exports/${provider}.zip` };
      if (operation === 'dispatch') return true;
      if (operation === 'localWorkflows')
        return { provider, workflows: [{ id: 'ci.yml', name: `${provider} CI`, filePath: '.github/workflows/ci.yml' }], files: [], issues: [] };
      if (operation === 'releases' || operation === 'tags') return page([]);
      if (operation === 'inspectRelease')
        return {
          inspectionId: `${provider}-inspection`,
          localSha: head,
          remoteSha: head,
          ahead: 0,
          behind: 0,
          canPush: false,
          canReleaseRemote: true,
          pushBlockedReason: null,
        };
      if (operation === 'createRelease')
        return { id: `${provider}-release`, tagName: input.tagName, name: input.name, htmlUrl: `${repo.htmlUrl}/releases/v1`, draft: false, prerelease: false };
      if (operation === 'uploadAsset') return { id: 'asset-id', name: 'source.zip', htmlUrl: `${repo.htmlUrl}/download/source.zip` };
      throw new Error(`Unexpected hosting operation: ${operation}`);
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows private Forgejo and GitHub together even with identical repository IDs and namespaces, and filters/pins independently', async () => {
    await render();
    expect(rows()).toHaveLength(2);
    expect(row('forgejo').textContent).toContain('Private Forgejo');
    expect(row('forgejo').textContent).toContain('Private');
    expect(row('github').textContent).toContain('GitHub Backup');
    expect(row('github').textContent).toContain('Public');
    expect(buttons(`Open local clone · ${mirror}`)).toHaveLength(2);
    await click(row('forgejo').querySelector('button[aria-label="Pin repository"]'));
    expect(row('forgejo').querySelector('button[aria-label="Unpin repository"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(row('github').querySelector('button[aria-label="Pin repository"]')!.getAttribute('aria-pressed')).toBe('false');
    await change(host.querySelector<HTMLSelectElement>('select[aria-label="Filter provider"]')!, 'forgejo');
    expect(rows()).toHaveLength(1);
    expect(row('forgejo')).toBeTruthy();
    await change(host.querySelector<HTMLSelectElement>('select[aria-label="Filter provider"]')!, '');
    await change(host.querySelector<HTMLSelectElement>('select[aria-label="Filter server and account"]')!, 'github-backup');
    expect(rows()).toHaveLength(1);
    expect(row('github')).toBeTruthy();
  });

  it('ignores the old catalog completion after switching to another account', async () => {
    const old = deferred<unknown>();
    override = (operation, input) => (operation === 'repositories' && input.connectionId === 'forgejo-private' ? old.promise : undefined);
    await render();
    await change(host.querySelector<HTMLSelectElement>('select[aria-label="Filter server and account"]')!, 'github-backup');
    expect(row('github')).toBeTruthy();
    await act(async () => old.resolve(page([repos[0]])));
    expect(rows()).toHaveLength(1);
    expect(row('forgejo')).toBeUndefined();
  });

  it('opens a full detail subpage and returns to the same filtered catalog and scroll position', async () => {
    await render();
    await change(host.querySelector<HTMLInputElement>('input[aria-label="Search repositories"]')!, 'project');
    await change(host.querySelector<HTMLSelectElement>('select[aria-label="Filter provider"]')!, 'forgejo');
    await click(row('forgejo').querySelector('button[aria-label="Pin repository"]'));
    const scroller = host.querySelector<HTMLElement>('.hosting-workspace')!;
    scroller.scrollTop = 145;
    await act(async () => scroller.dispatchEvent(new Event('scroll', { bubbles: true })));
    await click(row('forgejo').querySelector('.hosting-repository-title'));
    expect(host.querySelector('.hosting-catalog')).toBeNull();
    expect(host.querySelector('.hosting-detail h1')?.textContent).toBe(repos[0].fullName);
    expect(host.querySelector('button[aria-pressed="true"]')?.textContent).toBe('Overview');
    expect(scroller.scrollTop).toBe(0);
    expect(mocks.request.mock.calls.some(([operation]) => ['changeRequests', 'runs', 'releases'].includes(operation))).toBe(false);
    await click(buttons('All repositories')[0]);
    expect(host.querySelector('.hosting-detail')).toBeNull();
    expect(rows()).toHaveLength(1);
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Search repositories"]')?.value).toBe('project');
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="Filter provider"]')?.value).toBe('forgejo');
    expect(row('forgejo').querySelector('button[aria-label="Unpin repository"]')).toBeTruthy();
    expect(scroller.scrollTop).toBe(145);
  });

  it('does not revive repository details when capabilities arrive after returning to the catalog', async () => {
    const pending = deferred<unknown>();
    override = (operation, input) => (operation === 'capabilities' && input.repository ? pending.promise : undefined);
    await render();
    await click(row('github').querySelector('.hosting-repository-title'));
    await click(buttons('All repositories')[0]);
    await act(async () => pending.resolve(capabilities));
    expect(rows()).toHaveLength(2);
    expect(host.querySelector('.hosting-detail')).toBeNull();
    expect(useHostingState.getState().selected).toBeNull();
  });

  it('keeps catalog action forms in dialogs and cancels them without creating or resolving a repository', async () => {
    await render();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await click(buttons('New repository')[0]);
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('New repository');
    expect(buttons('Create repository')[0].disabled).toBe(true);
    await click(buttons('Close')[0]);
    await click(buttons('Open repository by URL')[0]);
    await click(buttons('Close')[0]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(useHostingState.getState().selected).toBeNull();
    await click(buttons('Publish repository')[0]);
    expect(mocks.openPublication).toHaveBeenCalledTimes(1);
    expect(mocks.request.mock.calls.some(([operation]) => ['createRepository', 'clone', 'fork', 'connectPublication'].includes(operation))).toBe(false);
  });

  it('validates saved credentials at startup and then loads both catalogs', async () => {
    accounts = accounts.map((account) => ({ ...account, id: `startup-${account.id}`, authenticated: false }));
    repos = accounts.map(repository);
    override = (operation, input) => {
      if (operation === 'capabilities' && !input.repository) {
        accounts = accounts.map((account) => (account.id === input.connectionId ? { ...account, authenticated: true } : account));
        return Promise.resolve(capabilities);
      }
      return undefined;
    };
    await render();
    expect(useHostingState.getState().connections.every((account) => account.authenticated)).toBe(true);
    expect(rows()).toHaveLength(2);
    for (const account of accounts) expect(mocks.request).toHaveBeenCalledWith('capabilities', { connectionId: account.id });
  });

  it('uses the explicitly selected backup account for PR checkout, CI logs/artifacts/start and remote release publication', async () => {
    await render();
    await click(row('github').querySelector('.hosting-repository-title'));
    expect(host.querySelector('.hosting-detail')?.textContent).toContain('GitHub Backup');
    expect(host.querySelector('.hosting-catalog')).toBeNull();
    await click(buttons('Pull requests')[0]);
    await click(buttons('Checkout')[0]);
    expect(mocks.request).toHaveBeenCalledWith('checkoutChangeRequest', { repoPath: mirror, repository: repos[1].ref, id: '31', expectedHeadSha: head });
    await click(buttons('Check CI at the change request revision')[0]);
    expect(mocks.request).toHaveBeenCalledWith('status', { repository: repos[1].ref, ref: head });
    await click(buttons('Set as hosting target for local repository')[0]);
    expect(preferences.hostingRemote).toBe('backup');
    expect(preferences.hostingRepository).toEqual(repos[1].ref);
    expect(preferences.bindings).toHaveLength(2);
    await click(buttons('GitHub Actions')[0]);
    await click(host.querySelector('.hosting-run'));
    await click(buttons('Logs')[0]);
    expect(host.querySelector('.hosting-log')?.textContent).toBe('github log text');
    expect(mocks.request).toHaveBeenCalledWith('logs', { repository: repos[1].ref, runId: '7', jobId: '9', cursor: undefined });
    await click(buttons('Download')[0]);
    expect(mocks.request).toHaveBeenCalledWith('downloadArtifact', { repository: repos[1].ref, runId: '7', artifactId: '10' });
    await click(buttons('Start a new run')[0]);
    const startForm = host.querySelector<HTMLFormElement>('.hosting-ci form')!;
    await change(startForm.querySelector('select')!, '0');
    expect(mocks.request).toHaveBeenCalledWith('localWorkflows', { repository: repos[1].ref, repoPath: mirror });
    await act(async () => startForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(mocks.request).toHaveBeenCalledWith('dispatch', { repository: repos[1].ref, workflow: 'ci.yml', ref: 'main', inputs: {} });
    await click(buttons('Releases')[0]);
    expect(host.querySelector('.hosting-releases > form')).toBeNull();
    await click(buttons('Create release')[0]);
    expect(mocks.openCreator).toHaveBeenCalledWith(repos[1].ref);
    expect(mocks.request.mock.calls.some(([operation]) => operation === 'createRelease' || operation === 'inspectRelease')).toBe(false);
    await click(buttons('All repositories')[0]);
    await click(row('forgejo').querySelector('.hosting-repository-title'));
    expect(host.querySelector('.hosting-detail')?.textContent).toContain('Private Forgejo');
    expect(host.querySelector('.hosting-detail')?.textContent).not.toContain('github log text');
    await click(buttons('Releases')[0]);
    expect(mocks.request).toHaveBeenCalledWith('releases', { repository: repos[0].ref });
  });

  it('does not display a late private CI log after selecting the other provider', async () => {
    const oldLog = deferred<unknown>();
    override = (operation, input) =>
      operation === 'logs' && (input.repository as HostedRepository['ref']).connectionId === 'github-backup' ? oldLog.promise : undefined;
    await render();
    await click(row('github').querySelector('.hosting-repository-title'));
    await click(buttons('GitHub Actions')[0]);
    await click(host.querySelector('.hosting-run'));
    await click(buttons('Logs')[0]);
    await click(buttons('All repositories')[0]);
    await click(row('forgejo').querySelector('.hosting-repository-title'));
    await click(buttons('Forgejo Actions')[0]);
    expect(host.querySelector('.hosting-ci')?.textContent).toContain('forgejo workflow');
    await act(async () => oldLog.resolve({ text: 'late private GitHub log', truncated: false, nextCursor: null }));
    expect(host.textContent).not.toContain('late private GitHub log');
  });

  it('opens a repository outside the catalog through the explicit account and keeps its complete reference for clone and fork', async () => {
    const external: HostedRepository = {
      ...repos[0],
      ref: { connectionId: accounts[0].id, repositoryId: 'external-42', fullPath: 'outside/tools' },
      name: 'tools',
      fullName: 'outside/tools',
      cloneUrl: `${accounts[0].baseUrl}/outside/tools.git`,
      htmlUrl: `${accounts[0].baseUrl}/outside/tools`,
      description: 'Outside the current account catalog',
    };
    const forked = { ...external, ref: { ...external.ref, repositoryId: 'fork-43', fullPath: 'my-group/my-tools' }, fullName: 'my-group/my-tools' };
    override = (operation, input) => {
      if (operation === 'resolveRepository' && input.connectionId === accounts[0].id && input.url === external.htmlUrl) return Promise.resolve(external);
      if (operation === 'capabilities' && (input.repository as HostedRepository['ref'] | undefined)?.repositoryId === external.ref.repositoryId)
        return Promise.resolve({ ...capabilities, fork: true });
      if (operation === 'clone') return Promise.resolve({ path: 'C:/Clones/tools' });
      if (operation === 'fork') return Promise.resolve(forked);
      return undefined;
    };
    await render();
    expect(rows().some((item) => item.textContent?.includes(external.fullName))).toBe(false);
    await change(host.querySelector<HTMLSelectElement>('select[aria-label="Filter server and account"]')!, accounts[0].id);
    await click(buttons('Open repository by URL')[0]);
    const openButton = buttons('Open repository')[0];
    expect(openButton.disabled).toBe(true);
    const openForm = openButton.closest('form')!;
    await change(openForm.querySelector('input')!, external.htmlUrl);
    await act(async () => openForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(mocks.request).toHaveBeenCalledWith('resolveRepository', { connectionId: accounts[0].id, url: external.htmlUrl });
    expect(useHostingState.getState().selected?.ref).toEqual(external.ref);
    expect(host.querySelector('.hosting-detail h1')?.textContent).toBe(external.fullName);
    expect(host.querySelector('.hosting-detail')?.textContent).toContain('Private Forgejo');
    expect(mocks.request).toHaveBeenCalledWith('capabilities', { connectionId: accounts[0].id, repository: external.ref });
    await click(buttons('Clone this repository')[0]);
    expect(mocks.request).toHaveBeenCalledWith('clone', { repository: external.ref, targetDir: 'C:/Clones', targetName: 'tools', useSsh: false });
    expect(mocks.addRepo).toHaveBeenCalledWith('C:/Clones/tools');
    await click(buttons('Fork')[0]);
    const forkForm = buttons('Create fork')[0].closest('form')!;
    const forkInputs = forkForm.querySelectorAll('input');
    await change(forkInputs[0], 'my-group');
    await change(forkInputs[1], 'my-tools');
    await act(async () => forkForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(mocks.request).toHaveBeenCalledWith('fork', { repository: external.ref, namespace: 'my-group', name: 'my-tools', defaultBranchOnly: false });
    expect(useHostingState.getState().selected?.ref).toEqual(forked.ref);
  });

  it('loads merge methods for the change request target branch and confirms only an allowed method with the checked revision', async () => {
    const allowed = deferred<unknown>();
    const changeRequest = {
      id: '71',
      number: '71',
      title: 'Restricted target branch',
      author: 'github-user',
      state: 'open',
      draft: false,
      source: repos[1].ref,
      target: repos[1].ref,
      sourceBranch: 'feature',
      targetBranch: 'release/v1',
      headSha: head,
      version: 9,
      htmlUrl: `${repos[1].htmlUrl}/pulls/71`,
    };
    override = (operation, input) => {
      if (operation === 'capabilities')
        return input.targetBranch ? allowed.promise : Promise.resolve({ ...capabilities, mergeMethods: ['merge', 'squash', 'rebase'] });
      if (operation === 'changeRequests') return Promise.resolve(page([changeRequest]));
      if (operation === 'merge') return Promise.resolve({ merged: true, message: 'Merged checked revision' });
      return undefined;
    };
    await render();
    await click(row('github').querySelector('.hosting-repository-title'));
    await click(buttons('Pull requests')[0]);
    await click(buttons('Merge')[0]);
    expect(mocks.request).toHaveBeenCalledWith('capabilities', {
      connectionId: repos[1].ref.connectionId,
      repository: changeRequest.target,
      targetBranch: 'release/v1',
    });
    expect(buttons('Confirm merge')).toHaveLength(0);
    expect(mocks.request).not.toHaveBeenCalledWith('merge', expect.anything());
    await act(async () => allowed.resolve({ ...capabilities, mergeMethods: ['squash'] }));
    const confirmation = buttons('Confirm merge')[0].closest('.hosting-card')!;
    const selector = confirmation.querySelector<HTMLSelectElement>('select')!;
    expect([...selector.options].map((option) => option.value)).toEqual(['squash']);
    expect(selector.value).toBe('squash');
    expect(confirmation.textContent).toContain(head);
    await click(buttons('Confirm merge')[0]);
    expect(mocks.request).toHaveBeenCalledWith('merge', { repository: repos[1].ref, id: '71', expectedHeadSha: head, version: 9, method: 'squash' });
    expect(buttons('Confirm merge')).toHaveLength(0);
    expect(host.textContent).toContain('Merged checked revision');
    expect(mocks.refreshGit).toHaveBeenCalledOnce();
  });
});
