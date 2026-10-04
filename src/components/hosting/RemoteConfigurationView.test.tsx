// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { hostingClient, transferClient } from '@/services/hostingClient';
import type { GitRemoteSnapshotDto, RemotePreferences } from '@/types/remoteTransfers';
import type { HostingConnection, HostedRepositoryRef, HostedRepository } from '@/types/hostingDtos';
import { RemoteConfigurationView } from './RemoteConfigurationView';

const snapshot = (repoPath: string): GitRemoteSnapshotDto => ({
  repoPath,
  branch: 'main',
  upstream: { remote: 'backup', branch: 'main' },
  defaultPushRemote: 'backup',
  supportsPushUrlIsolation: true,
  remotes: [
    { name: 'private', fetchUrls: ['https://forgejo.example/team/repo.git'], pushUrls: ['https://forgejo.example/team/repo.git'] },
    { name: 'backup', fetchUrls: ['https://github.com/team/repo.git'], pushUrls: ['https://github.com/team/repo.git'] },
  ],
});
let root: Root;
let host: HTMLDivElement;
let persisted: Record<string, RemotePreferences>;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  persisted = {};
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(transferClient, 'request').mockImplementation(async (operation, input) => {
    const values = input as { repoPath: string; preferences?: RemotePreferences };
    if (operation === 'getRemotes') return snapshot(values.repoPath);
    if (operation === 'getPreferences') return persisted[values.repoPath] ?? {};
    if (operation === 'setPreferences') {
      persisted[values.repoPath] = values.preferences!;
      return values.preferences!;
    }
    throw new Error(`Unexpected transfer ${operation}`);
  });
  vi.spyOn(hostingClient, 'request').mockImplementation(async (operation) => {
    if (operation === 'connections') return [];
    throw new Error(`Unexpected hosting ${operation}`);
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
const render = async (repoPath = 'C:/repo') => {
  await act(async () => root.render(createElement(I18nProvider, { language: 'en', children: createElement(RemoteConfigurationView, { repoPath }) })));
};
const select = async (label: string, value: string) => {
  const element = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  expect(element).toBeTruthy();
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const click = async (label: string) => {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent?.trim() === label)!;
  expect(button).toBeTruthy();
  await act(async () => button.click());
};

it('opens and edits a draft without transferring or persisting, then saves independent selections with current identities', async () => {
  await render();
  await select('Fetch source', 'private');
  await select('Pull source', 'backup');
  await select('fetch selection mode', 'remember');
  expect(vi.mocked(transferClient.request).mock.calls.every(([operation]) => operation === 'getRemotes' || operation === 'getPreferences')).toBe(true);
  expect(host.textContent).toContain('Unsaved draft');
  await click('Save');
  expect(persisted['C:/repo']).toMatchObject({
    fetchRemote: 'private',
    pullRemote: 'backup',
    selectionModes: { fetch: 'remember', pull: 'ask', push: 'ask' },
    selectionSnapshots: {
      fetch: { remotes: [{ name: 'private', urls: ['https://forgejo.example/team/repo.git'] }] },
      pull: { remotes: [{ name: 'backup' }] },
    },
  });
  expect(vi.mocked(transferClient.request).mock.calls.some(([operation]) => ['fetch', 'pull', 'planPush', 'executePush'].includes(operation))).toBe(false);
  expect(host.textContent).toContain('Remote configuration saved.');
  expect(persisted['C:/repo'].pullBranches).toBeUndefined();
  expect(persisted['C:/repo'].pushBranches).toBeUndefined();
});

it('restores an unsaved draft only for the same repository and clears it when discarded', async () => {
  await render('C:/one');
  await select('Fetch source', 'private');
  await render('C:/two');
  expect(host.querySelector<HTMLSelectElement>('select[aria-label="Fetch source"]')?.value).toBe('');
  await render('C:/one');
  expect(host.querySelector<HTMLSelectElement>('select[aria-label="Fetch source"]')?.value).toBe('private');
  await click('Discard draft');
  expect(host.querySelector<HTMLSelectElement>('select[aria-label="Fetch source"]')?.value).toBe('');
  expect(vi.mocked(transferClient.request).mock.calls.some(([operation]) => operation === 'setPreferences')).toBe(false);
});

it('does not overwrite saved preferences when they changed since the session draft was made', async () => {
  await render();
  await select('Fetch source', 'private');
  await render('C:/other');
  persisted['C:/repo'] = { fetchRemote: 'backup' };
  await render();
  expect(host.querySelector<HTMLSelectElement>('select[aria-label="Fetch source"]')?.value).toBe('backup');
});

it('rejects saving a draft when endpoint URLs changed outside the app', async () => {
  await render();
  await select('Fetch source', 'private');
  vi.mocked(transferClient.request).mockImplementation(async (operation) => {
    if (operation === 'getRemotes') {
      const next = snapshot('C:/repo');
      next.remotes[0].fetchUrls = ['https://other.example/team/repo.git'];
      return next;
    }
    throw new Error('Must not persist stale endpoints.');
  });
  await click('Save');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Remotes changed outside the app');
  expect(persisted['C:/repo']).toBeUndefined();
});

it('keeps binding and credential-mode changes in the draft until Save', async () => {
  persisted['C:/repo'] = {
    bindings: [
      {
        remoteName: 'private',
        url: 'https://forgejo.example/team/repo.git',
        repository: { connectionId: 'account', repositoryId: '1', fullPath: 'team/repo' },
        credentialMode: 'hosting',
      },
    ],
  };
  await render();
  const authentication = [...host.querySelectorAll<HTMLSelectElement>('select')].find(
    (element) => element.parentElement?.textContent?.includes('Git authentication for this endpoint') && !element.disabled,
  )!;
  await act(async () => {
    authentication.value = 'system';
    authentication.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(persisted['C:/repo'].bindings?.[0].credentialMode).toBe('hosting');
  await click('Save');
  expect(persisted['C:/repo'].bindings?.[0].credentialMode).toBe('system');
});

const account = {
  id: 'account',
  provider: 'forgejo',
  label: 'Personal Forgejo',
  baseUrl: 'https://forgejo.example',
  apiBaseUrl: 'https://forgejo.example/api/v1',
  authenticated: true,
  username: 'alice',
} as HostingConnection;
const repository: HostedRepositoryRef = { connectionId: 'account', repositoryId: '1', fullPath: 'team/repo' };
const resolvedRepository: HostedRepository = {
  ref: repository,
  name: 'repo',
  fullName: 'team/repo',
  private: true,
  cloneUrl: 'https://forgejo.example/team/repo.git',
  htmlUrl: 'https://forgejo.example/team/repo',
  description: null,
  defaultBranch: 'main',
  fork: false,
};
const chooseAccount = async () => {
  const element = [...host.querySelectorAll<HTMLSelectElement>('select')].find((candidate) =>
    candidate.parentElement?.textContent?.includes('Bind hosting account'),
  )!;
  await act(async () => {
    element.value = 'account';
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
it('resolves an SSH alias through the explicit repository web URL and saves its separate endpoint binding', async () => {
  vi.spyOn(window, 'prompt').mockReturnValue('https://forgejo.example/team/repo');
  vi.mocked(hostingClient.request).mockImplementation(async (operation) => (operation === 'connections' ? [account] : resolvedRepository));
  vi.mocked(transferClient.request).mockImplementation(async (operation, input) => {
    const args = input as { repoPath: string; preferences?: RemotePreferences };
    if (operation === 'getRemotes') {
      const next = snapshot(args.repoPath);
      next.remotes[0].fetchUrls = next.remotes[0].pushUrls = ['git@private-alias:team/repo.git'];
      return next;
    }
    if (operation === 'getPreferences') return {};
    if (operation === 'setPreferences') {
      persisted[args.repoPath] = args.preferences!;
      return args.preferences!;
    }
    throw new Error('Unexpected transfer.');
  });
  await render();
  await chooseAccount();
  await click('Bind account to this endpoint');
  expect(hostingClient.request).toHaveBeenCalledWith('resolveRepository', { connectionId: 'account', url: 'https://forgejo.example/team/repo' });
  expect(persisted['C:/repo']).toBeUndefined();
  await select('Fetch source', 'private');
  await click('Save');
  expect(persisted['C:/repo'].bindings).toEqual([{ remoteName: 'private', url: 'git@private-alias:team/repo.git', repository, credentialMode: 'hosting' }]);
  expect(persisted['C:/repo'].selectionSnapshots?.fetch?.remotes[0].bindings).toMatchObject([{ repository, credentialMode: 'hosting' }]);
});

it('ignores a repository-resolution result after switching to another repository', async () => {
  let resolve!: (value: HostedRepository) => void;
  vi.spyOn(window, 'prompt').mockReturnValue('https://forgejo.example/team/repo');
  vi.mocked(hostingClient.request).mockImplementation(async (operation) =>
    operation === 'connections'
      ? [account]
      : new Promise<HostedRepository>((done) => {
          resolve = done;
        }),
  );
  await render('C:/one');
  await chooseAccount();
  await click('Bind account to this endpoint');
  await render('C:/two');
  await act(async () => {
    resolve(resolvedRepository);
    await Promise.resolve();
  });
  await click('Save');
  expect(persisted['C:/two'].bindings).toBeUndefined();
  expect(persisted['C:/one']).toBeUndefined();
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it('sets upstream as an explicit Git action while leaving the page preferences unsaved', async () => {
  let upstream = snapshot('C:/repo').upstream;
  vi.mocked(transferClient.request).mockImplementation(async (operation, input) => {
    if (operation === 'getRemotes') return { ...snapshot('C:/repo'), upstream };
    if (operation === 'getPreferences') return {};
    if (operation === 'setUpstream') {
      const next = input as { remote: string; branch: string };
      upstream = next;
      return true;
    }
    throw new Error('No preference save or transfer is allowed.');
  });
  await render();
  await select('Pull source', 'private');
  await click('Set as upstream');
  expect(transferClient.request).toHaveBeenCalledWith('setUpstream', { repoPath: 'C:/repo', remote: 'private', branch: 'main' });
  expect(upstream).toMatchObject({ remote: 'private', branch: 'main' });
  expect(host.textContent).toContain('Unsaved draft');
  expect(persisted['C:/repo']).toBeUndefined();
  expect(vi.mocked(transferClient.request).mock.calls.some(([operation]) => ['fetch', 'pull', 'setPreferences'].includes(operation))).toBe(false);
});

it('clears pull mappings from the previous source without freezing the new Git default', async () => {
  persisted['C:/repo'] = { pullRemote: 'backup', pullBranches: { main: 'production', feature: 'release' } };
  await render();
  await select('Pull source', 'private');
  await click('Save');
  expect(persisted['C:/repo'].pullRemote).toBe('private');
  expect(persisted['C:/repo'].pullBranches).toBeUndefined();
});

it('rejects saving when the current local branch changed after the page loaded', async () => {
  await render();
  await select('Pull source', 'private');
  vi.mocked(transferClient.request).mockImplementation(async (operation) => {
    if (operation === 'getRemotes') return { ...snapshot('C:/repo'), branch: 'different' };
    throw new Error('Must not save a draft against another branch.');
  });
  await click('Save');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('current branch changed');
  expect(persisted['C:/repo']).toBeUndefined();
});

it('renames and updates an existing push profile in the draft without replacing its identity', async () => {
  persisted['C:/repo'] = { activeProfileId: 'profile', pushRemotes: ['private'], profiles: [{ id: 'profile', name: 'Old profile', remoteNames: ['private'] }] };
  await render();
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Profile name"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'New profile');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const backup = [...host.querySelectorAll<HTMLInputElement>('fieldset input[type="checkbox"]')].find(
    (element) => element.parentElement?.textContent === 'backup',
  )!;
  await act(async () => backup.click());
  await click('Update profile');
  expect(persisted['C:/repo'].profiles?.[0].name).toBe('Old profile');
  await click('Save');
  expect(persisted['C:/repo'].profiles).toMatchObject([{ id: 'profile', name: 'New profile', remoteNames: ['private', 'backup'] }]);
});
