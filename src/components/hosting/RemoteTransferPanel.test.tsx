// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitRemoteSnapshotDto } from '@/types/remoteTransfers';
import { RemoteTransferPanel } from './RemoteTransferPanel';

const mocked = vi.hoisted(() => ({ request: vi.fn(), hostingRequest: vi.fn(), refresh: vi.fn(), command: vi.fn() }));
vi.mock('@/services/hostingClient', () => ({
  transferClient: { request: mocked.request },
  hostingClient: { request: mocked.hostingRequest },
}));
vi.mock('@/services/gitClient', () => ({ gitClient: { cancelSecretScan: vi.fn(), runGitCommandForRepo: mocked.command } }));
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en }) }));
vi.mock('@/contexts/AppStateContext', () => ({
  useGitStore: (select: (state: unknown) => unknown) => select({ tags: [], triggerRefresh: mocked.refresh }),
  useSettingsStore: (select: (state: unknown) => unknown) => select({ settings: { secretScanBeforePushEnabled: false } }),
  useUIStore: (select: (state: unknown) => unknown) => select({ setActiveTab: vi.fn() }),
  useWorkflowStore: (select: (state: unknown) => unknown) => select({ jobs: [] }),
}));
vi.mock('./hostingState', () => ({
  useHostingState: () => ({
    connections: [{ id: 'forgejo-account', authenticated: true, label: 'Personal Forgejo', username: 'alice' }],
    refresh: mocked.refresh,
  }),
}));

let root: Root;
let container: HTMLDivElement;
function snapshot(repoPath: string, branch = 'main'): GitRemoteSnapshotDto {
  return {
    repoPath,
    branch,
    upstream: { remote: 'forgejo', branch },
    defaultPushRemote: 'forgejo',
    supportsPushUrlIsolation: true,
    remotes: [
      { name: 'forgejo', fetchUrls: ['git@private-alias:alice/project.git'], pushUrls: ['git@private-alias:alice/project.git'] },
      { name: 'backup', fetchUrls: ['https://github.com/alice/project.git'], pushUrls: ['https://github.com/alice/project.git'] },
    ],
  };
}
async function settle() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}
async function render(repoPath: string, mode: 'remotes' | 'pull' | 'fetch' = 'remotes') {
  await act(async () => {
    root.render(createElement(RemoteTransferPanel, { repoPath, mode }));
    await settle();
  });
}
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find((node) => node.textContent === text);
  expect(button).toBeDefined();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
  });
}
async function select(label: string, value: string) {
  const input = [...container.querySelectorAll('label')].find((node) => node.textContent?.startsWith(label))?.querySelector('select');
  expect(input).toBeDefined();
  await act(async () => {
    input!.value = value;
    input!.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocked.request.mockImplementation(async (operation: string, input: { repoPath: string; preferences?: unknown }) => {
    if (operation === 'getRemotes') return snapshot(input.repoPath);
    if (operation === 'getPreferences') return {};
    if (operation === 'setPreferences') return input.preferences;
    return { output: 'ok' };
  });
  mocked.hostingRequest.mockResolvedValue({ ref: { connectionId: 'forgejo-account', repositoryId: '42', fullPath: 'alice/project' } });
  mocked.command.mockResolvedValue({ success: true, data: '' });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('remote transfer pane destination isolation', () => {
  it('manually fetches branches and tags from the same selected source and adopts only missing tags', async () => {
    mocked.command.mockImplementation(async (_repo: string, operation: string) => ({
      success: true,
      data:
        operation === 'forEachRef'
          ? `refs/tags/conflict\0${'a'.repeat(40)}\0\nrefs/ogc/remote-tags/backup/conflict\0${'b'.repeat(40)}\0\nrefs/ogc/remote-tags/backup/missing\0${'c'.repeat(40)}\0`
          : '',
    }));
    await render('/repo/mixed', 'fetch');
    await select('Fetch/pull remote', 'backup');
    await click('Fetch');

    expect(mocked.request.mock.calls.filter(([operation]) => operation === 'fetch').map(([, input]) => input)).toEqual([
      { repoPath: '/repo/mixed', remote: 'backup' },
      { repoPath: '/repo/mixed', remote: 'backup', tagsOnly: true },
    ]);
    expect(mocked.command.mock.calls.filter(([, operation]) => operation === 'adoptRemoteTag')).toEqual([
      ['/repo/mixed', 'adoptRemoteTag', 'backup', 'missing'],
    ]);
    expect(mocked.refresh).toHaveBeenCalled();
  });

  it('discards an earlier repository snapshot after switching repositories', async () => {
    let finishEarlier!: (value: GitRemoteSnapshotDto) => void;
    mocked.request.mockImplementation(async (operation: string, input: { repoPath: string }) => {
      if (operation === 'getRemotes' && input.repoPath === '/repo/first')
        return new Promise((resolve) => {
          finishEarlier = resolve;
        });
      if (operation === 'getRemotes') return snapshot(input.repoPath, 'second-branch');
      return {};
    });
    await render('/repo/first');
    await render('/repo/second');
    await act(async () => {
      finishEarlier(snapshot('/repo/first', 'first-branch'));
      await settle();
    });
    expect(container.textContent).toContain('/repo/second');
    expect(container.textContent).toContain('second-branch');
    expect(container.textContent).not.toContain('first-branch');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('uses a web URL only for resolution and persists the actual SSH endpoint binding', async () => {
    await render('/repo/private');
    await select('Bind hosting account', 'forgejo-account');
    vi.spyOn(window, 'prompt').mockReturnValue('https://forgejo.example/alice/project');
    await click('Bind account to this endpoint');
    expect(mocked.hostingRequest).toHaveBeenCalledWith('resolveRepository', {
      connectionId: 'forgejo-account',
      url: 'https://forgejo.example/alice/project',
    });
    const stored = mocked.request.mock.calls.find(([operation]) => operation === 'setPreferences')?.[1];
    expect(stored.preferences.bindings).toEqual([
      {
        remoteName: 'forgejo',
        url: 'git@private-alias:alice/project.git',
        repository: { connectionId: 'forgejo-account', repositoryId: '42', fullPath: 'alice/project' },
        credentialMode: 'hosting',
      },
    ]);
    await select('Git authentication for this endpoint', 'system');
    const changed = mocked.request.mock.calls.filter(([operation]) => operation === 'setPreferences').at(-1)?.[1];
    expect(changed.preferences.bindings[0]).toEqual({ ...stored.preferences.bindings[0], credentialMode: 'system' });
  });

  it('retries a failed pull against its original source despite a changed source selection', async () => {
    let pullCount = 0;
    const previous = mocked.request.getMockImplementation()!;
    mocked.request.mockImplementation(async (operation: string, input: { repoPath: string }) => {
      if (operation === 'pull' && pullCount++ === 0) throw new Error('Local changes would be overwritten.');
      return previous(operation, input);
    });
    await render('/repo/mixed', 'pull');
    await click('Pull');
    expect(container.textContent).toContain('Local changes would be overwritten.');
    await select('Fetch/pull remote', 'backup');
    await click('Retry this pull source');
    const calls = mocked.request.mock.calls.filter(([operation]) => operation === 'pull').map(([, input]) => input);
    expect(calls).toEqual([
      { repoPath: '/repo/mixed', remote: 'forgejo', branch: 'main', mode: 'default' },
      { repoPath: '/repo/mixed', remote: 'forgejo', branch: 'main', mode: 'default' },
    ]);
    expect(container.textContent).toContain('Pull from forgejo/main completed.');
  });
});
