// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitRemoteSnapshotDto, RemotePreferences } from '@/types/remoteTransfers';
import { RemoteTransferHost } from './RemoteTransferHost';
import { requestRemoteTransfer, useRemoteTransferDialogState } from './remoteTransferDialogState';
import { initialRemoteTransferState, useRemoteTransferState } from './remoteTransferState';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { ActionToastViewport } from '@/components/ActionToastViewport';
import { useToastQueue } from '@/hooks/useToastQueue';
import type { GitJobEventDto } from '@/types/aiDtos';

const mocked = vi.hoisted(() => ({
  request: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
  command: vi.fn(),
  scan: vi.fn(),
  approve: vi.fn(),
  scanEnabled: false,
  openConfig: vi.fn(),
  setTab: vi.fn(),
  connections: [],
}));
vi.mock('@/services/hostingClient', () => ({ transferClient: { request: mocked.request } }));
vi.mock('@/services/gitClient', () => ({
  gitClient: { cancelSecretScan: vi.fn(), runGitCommandForRepo: mocked.command, scanPushSecrets: mocked.scan, approveSecretScanPush: mocked.approve },
}));
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en, t: (key: string) => key }) }));
vi.mock('@/contexts/AppStateContext', () => ({
  useGitStore: (select: (state: unknown) => unknown) => select(repository),
  useSettingsStore: (select: (state: unknown) => unknown) => select({ settings: { secretScanBeforePushEnabled: mocked.scanEnabled } }),
  useUIStore: (select: (state: unknown) => unknown) => select({ setActiveTab: mocked.setTab }),
  useWorkflowStore: (select: (state: unknown) => unknown) => select({ jobs }),
}));
vi.mock('./hostingState', () => ({ useHostingState: (select: (state: unknown) => unknown) => select({ connections: mocked.connections }) }));
let root: Root;
let container: HTMLDivElement;
let preferences: RemotePreferences;
let repository: { activeRepo: string; currentBranch: string; tags: string[]; triggerRefresh: typeof mocked.refresh; onToast: typeof mocked.toast };
let snapshot: GitRemoteSnapshotDto;
let jobs: GitJobEventDto[];
let queue: ReturnType<typeof useToastQueue>;
function Harness() {
  queue = useToastQueue({ autoHideMs: 3000, errorAutoHideMs: null });
  return createElement(
    NotificationProvider,
    { value: queue.notifications },
    createElement(
      Fragment,
      null,
      createElement(RemoteTransferHost, { onOpenConfiguration: mocked.openConfig }),
      createElement(ActionToastViewport, { toasts: queue.toasts, onDismiss: queue.dismiss }),
    ),
  );
}
async function settle() {
  for (let index = 0; index < 40; index++) await Promise.resolve();
}
async function render() {
  await act(async () => {
    root.render(createElement(Harness));
    await settle();
  });
}
async function start(mode: 'push' | 'pull' | 'fetch', extra: object = {}) {
  await act(async () => {
    requestRemoteTransfer({ repoPath: repository.activeRepo, mode, ...extra });
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
  vi.useFakeTimers();
  jobs = [];
  useRemoteTransferState.setState(initialRemoteTransferState());
  useRemoteTransferDialogState.getState().close();
  preferences = {};
  mocked.scanEnabled = false;
  mocked.scan.mockResolvedValue({
    success: true,
    data: { scanned: true, strictness: 'balanced', findings: [], notes: [], stats: { checkedLines: 1, stagedLines: 0, toPushLines: 1, tagLines: 0 } },
  });
  mocked.approve.mockResolvedValue({ success: true, data: true });
  repository = { activeRepo: '/repo', currentBranch: 'main', tags: ['v1', 'v2'], triggerRefresh: mocked.refresh, onToast: mocked.toast };
  snapshot = {
    repoPath: '/repo',
    branch: 'main',
    upstream: { remote: 'forgejo', branch: 'tracking-main' },
    defaultPushRemote: 'forgejo',
    supportsPushUrlIsolation: true,
    remotes: [
      { name: 'forgejo', fetchUrls: ['forgejo'], pushUrls: ['forgejo'] },
      { name: 'backup', fetchUrls: ['github'], pushUrls: ['github'] },
    ],
  };
  mocked.request.mockImplementation(async (operation: string, input: { preferences?: RemotePreferences }) => {
    if (operation === 'getRemotes') return structuredClone(snapshot);
    if (operation === 'getPreferences') return structuredClone(preferences);
    if (operation === 'setPreferences') {
      preferences = structuredClone(input.preferences!);
      return preferences;
    }
    if (operation === 'planPush')
      return {
        id: 'plan',
        repoPath: '/repo',
        sourceOid: 'a'.repeat(40),
        branch: 'main',
        tagNames: [],
        force: false,
        secretScanArgs: ['__ogc_transfer_scan_plan__', `${'a'.repeat(40)}:refs/heads/main`],
        targets: [],
      };
    if (operation === 'executePush') return { id: 'batch', planId: 'plan', repoPath: '/repo', sourceOid: 'a'.repeat(40), state: 'success', targets: [] };
    return { output: 'ok' };
  });
  mocked.command.mockResolvedValue({ success: true, data: '' });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('remote transfer host and selection UI', () => {
  it('pushes with scanning enabled and pulls a sole remote without any configuration or dialog', async () => {
    snapshot.remotes = [snapshot.remotes[0]];
    mocked.scanEnabled = true;
    await render();
    await start('push');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocked.scan).toHaveBeenCalledWith({
      repoPath: '/repo',
      pushArgs: ['__ogc_transfer_scan_plan__', `${'a'.repeat(40)}:refs/heads/main`],
      progressId: expect.any(String),
    });
    expect(mocked.request.mock.calls.filter(([operation]) => operation === 'executePush')).toHaveLength(1);
    expect(mocked.approve).not.toHaveBeenCalled();
    await start('pull');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocked.request).toHaveBeenCalledWith('pull', { repoPath: '/repo', remote: 'forgejo', branch: 'tracking-main', mode: 'default' });
    expect(mocked.request.mock.calls.some(([operation]) => operation === 'setPreferences')).toBe(false);
  });
  it('explains incomplete scans and lets the user retry without changing remote settings', async () => {
    snapshot.remotes = [snapshot.remotes[0]];
    mocked.scanEnabled = true;
    mocked.scan.mockResolvedValueOnce({
      success: true,
      data: {
        scanned: true,
        strictness: 'balanced',
        findings: [],
        notes: ['History could not be read.'],
        historyScanIncomplete: true,
        stats: { checkedLines: 0, stagedLines: 0, toPushLines: 0, tagLines: 0 },
      },
    });
    await render();
    await start('push');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Nothing has been pushed yet');
    expect([...container.querySelectorAll('button')].find((button) => button.textContent === 'Push to these targets')?.disabled).toBe(true);
    expect(mocked.request.mock.calls.some(([operation]) => operation === 'executePush')).toBe(false);
    await click('Retry check');
    expect(mocked.scan).toHaveBeenCalledTimes(2);
    expect(mocked.request.mock.calls.filter(([operation]) => operation === 'executePush')).toHaveLength(1);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocked.request.mock.calls.some(([operation]) => operation === 'setPreferences')).toBe(false);
  });
  it('executes a sole-remote fetch without opening a dialog', async () => {
    snapshot.remotes = [snapshot.remotes[0]];
    await render();
    await start('fetch');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocked.request.mock.calls.filter(([operation]) => operation === 'fetch').map(([, input]) => input)).toEqual([
      { repoPath: '/repo', remote: 'forgejo' },
      { repoPath: '/repo', remote: 'forgejo', tagsOnly: true },
    ]);
    expect(container.querySelector('.action-toast.success')?.textContent).toContain('Fetch from forgejo completed.');
  });
  it('offers independent remember and ask choices, and executes a remembered selection without a new dialog', async () => {
    await render();
    await start('fetch');
    expect(container.textContent).toContain('Save and execute');
    expect(container.textContent).toContain('Ask every time');
    await select('Fetch remote', 'backup');
    await click('Save and execute');
    expect(preferences.selectionModes).toEqual({ fetch: 'remember' });
    expect(preferences.fetchRemote).toBe('backup');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await start('fetch');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await start('pull');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });
  it('resets the pull branch when switching away from its tracking source', async () => {
    await render();
    await start('pull');
    expect(container.querySelector('input')?.value).toBe('tracking-main');
    await select('Pull remote', 'backup');
    expect(container.querySelector('input')?.value).toBe('main');
    await click('Ask every time');
    expect(mocked.request).toHaveBeenCalledWith('pull', { repoPath: '/repo', remote: 'backup', branch: 'main', mode: 'default' });
    expect(preferences.selectionModes).toEqual({ pull: 'ask' });
    await start('pull');
    expect(container.textContent).toContain('Ask every time');
  });
  it('opens configuration without initiating a transfer from its link', async () => {
    await render();
    await start('push');
    await click('Open remote configuration');
    expect(mocked.openConfig).toHaveBeenCalledWith('/repo');
    expect(mocked.request.mock.calls.some(([operation]) => operation === 'planPush')).toBe(false);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
  it('keeps progress and cancellation outside the selection dialog', async () => {
    snapshot.remotes = [snapshot.remotes[0]];
    let finish!: (result: unknown) => void;
    const original = mocked.request.getMockImplementation()!;
    mocked.request.mockImplementation((operation, input) =>
      operation === 'executePush'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : original(operation, input),
    );
    await render();
    await start('push');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('.toast-container .action-toast.progress')).not.toBeNull();
    const id = queue.toast!.id;
    await click('Cancel');
    expect(container.textContent).toContain('Cancelling transfer');
    expect([...container.querySelectorAll('button')].find((button) => button.textContent === 'Cancel')?.disabled).toBe(true);
    await act(async () => {
      finish({ id: 'batch', planId: 'plan', repoPath: '/repo', sourceOid: 'a'.repeat(40), state: 'cancelled', targets: [] });
      await settle();
    });
    expect(mocked.request).toHaveBeenCalledWith('cancel', { repoPath: '/repo' });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('.action-toast.info')?.textContent).toContain('Push cancelled.');
    expect(queue.toast!.id).toBe(id);
    expect(container.querySelector('.remote-transfer-progress')).toBeNull();
    await click('Open transfer result');
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Push result: cancelled');
    await click('Close');
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(container.querySelector('.toast-container')).toBeNull();
    expect(container.textContent).not.toContain('Open transfer result');
  });
  it('discards an earlier snapshot after switching repository', async () => {
    let finish!: (result: GitRemoteSnapshotDto) => void;
    const original = mocked.request.getMockImplementation()!;
    mocked.request.mockImplementation((operation, input) =>
      operation === 'getRemotes'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : original(operation, input),
    );
    await render();
    await start('fetch');
    repository = { ...repository, activeRepo: '/other', currentBranch: 'other-main' };
    await render();
    await act(async () => {
      finish(snapshot);
      await settle();
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocked.request.mock.calls.some(([operation]) => operation === 'fetch')).toBe(false);
    expect(mocked.toast).not.toHaveBeenCalled();
    expect(container.querySelector('.toast-container')).toBeNull();
  });
  it('keeps ordinary pushes free of tag controls while explicit tag pushes show them', async () => {
    await render();
    await start('push');
    expect(container.textContent).not.toContain('Explicitly select tags');
    await click('Close');
    snapshot.remotes = [snapshot.remotes[0]];
    await start('push', { selectTags: true, tagNames: ['v1'] });
    expect(container.textContent).toContain('Explicitly select tags');
    const tag = [...container.querySelectorAll('label')].find((label) => label.textContent === 'v1')?.querySelector('input');
    expect(tag?.checked).toBe(true);
  });
  it('keeps the failed pull available while opening the workspace to resolve conflicts', async () => {
    snapshot.remotes = [snapshot.remotes[0]];
    const original = mocked.request.getMockImplementation()!;
    let pulls = 0;
    mocked.request.mockImplementation(async (operation, input) => {
      if (operation === 'pull' && pulls++ === 0) throw new Error('Resolve conflicts first');
      return original(operation, input);
    });
    await render();
    await start('pull', { pullMode: 'rebase' });
    await click('Resume pull');
    await click('Open workspace');
    expect(mocked.setTab).toHaveBeenCalledWith('repo');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await click('Resume pull');
    await click('Retry this pull source');
    expect(mocked.request.mock.calls.filter(([operation]) => operation === 'pull').map(([, input]) => input)).toEqual([
      { repoPath: '/repo', remote: 'forgejo', branch: 'tracking-main', mode: 'rebase' },
      { repoPath: '/repo', remote: 'forgejo', branch: 'tracking-main', mode: 'rebase' },
    ]);
    expect(container.textContent).not.toContain('Resume pull');
    expect(container.querySelector('.action-toast.success')?.textContent).toContain('Pull from forgejo/tracking-main completed.');
  });
  it('explains a detached checkout and provides a way back to the workspace', async () => {
    snapshot.branch = '';
    snapshot.upstream = null;
    repository.currentBranch = '';
    await render();
    await start('push');
    expect(container.textContent).toContain('Check out a local branch');
    await click('Open workspace');
    expect(mocked.setTab).toHaveBeenCalledWith('repo');
    expect(mocked.request.mock.calls.some(([operation]) => operation === 'planPush')).toBe(false);
  });
  it('stores the selected profile with its branch targets before executing it', async () => {
    preferences = {
      activeProfileId: 'primary',
      profiles: [
        { id: 'primary', name: 'Primary', remoteNames: ['forgejo'] },
        { id: 'mirror', name: 'Mirror', remoteNames: ['backup'], targetBranches: { backup: 'mirror-main' } },
      ],
    };
    await render();
    await start('push');
    await select('Push profile', 'mirror');
    await click('Save and execute');
    expect(preferences.activeProfileId).toBe('mirror');
    expect(preferences.pushRemotes).toEqual(['backup']);
    expect(preferences.pushBranches).toEqual({ main: { backup: 'mirror-main' } });
    expect(mocked.request).toHaveBeenCalledWith('planPush', expect.objectContaining({ remoteNames: ['backup'], targetBranches: { backup: 'mirror-main' } }));
  });
  it('keeps force confirmation explicit and invalidates it on a branch switch', async () => {
    snapshot.remotes = [snapshot.remotes[0]];
    await render();
    await start('push', { force: true });
    expect(container.textContent).toContain('Confirm force with lease');
    expect(mocked.request.mock.calls.some(([operation]) => operation === 'executePush')).toBe(false);
    repository = { ...repository, currentBranch: 'other' };
    await render();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocked.request.mock.calls.some(([operation]) => operation === 'executePush')).toBe(false);
  });
  it.each(['fetch', 'pull'] as const)('uses one expiring central message when %s is cancelled', async (mode) => {
    snapshot.remotes = [snapshot.remotes[0]];
    let fail!: (error: Error) => void;
    const original = mocked.request.getMockImplementation()!;
    mocked.request.mockImplementation((operation, input) =>
      operation === mode
        ? new Promise((_resolve, reject) => {
            fail = reject;
          })
        : original(operation, input),
    );
    await render();
    await start(mode);
    expect(container.querySelectorAll('.action-toast')).toHaveLength(1);
    const id = queue.toast!.id;
    await click('Cancel');
    await act(async () => {
      fail(new Error('Git operation was aborted.'));
      await settle();
    });
    expect(queue.toast).toMatchObject({ id, kind: 'info', msg: 'Transfer cancelled.', isError: false });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).not.toContain('Resume pull');
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(container.querySelector('.toast-container')).toBeNull();
  });
  it('retains partial results and retries only through their central detail action', async () => {
    snapshot.remotes = [snapshot.remotes[0]];
    const original = mocked.request.getMockImplementation()!;
    const target = { id: 't', remoteName: 'forgejo', url: 'forgejo', sourceOid: 'a'.repeat(40), destinationRef: 'refs/heads/main' };
    mocked.request.mockImplementation((operation, input) =>
      operation === 'executePush' || operation === 'retryPush'
        ? Promise.resolve({
            id: 'batch',
            planId: 'plan',
            repoPath: '/repo',
            state: operation === 'executePush' ? 'partial' : 'success',
            targets: [{ ...target, status: operation === 'executePush' ? 'unknown' : 'success', message: 'Retry this endpoint' }],
          })
        : original(operation, input),
    );
    await render();
    await start('push');
    expect(container.querySelector('.action-toast.warning')?.textContent).toContain('Some targets were not published');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    await click('Open transfer result');
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('forgejo: unknown');
    await click('Retry unsuccessful targets only');
    expect(mocked.request).toHaveBeenCalledWith('retryPush', { repoPath: '/repo', batchId: 'batch', targetIds: ['t'] });
    expect(container.querySelectorAll('.action-toast')).toHaveLength(1);
    expect(container.querySelector('.action-toast.success')?.textContent).toContain('Push completed');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
  it('updates current progress without reviving old jobs or interfering with ordinary notifications', async () => {
    snapshot.remotes = [snapshot.remotes[0]];
    const original = mocked.request.getMockImplementation()!;
    mocked.request.mockImplementation((operation, input) => (operation === 'executePush' ? new Promise(() => {}) : original(operation, input)));
    jobs = [
      { id: 'old', operation: 'git:executePush', status: 'done', message: 'Old push completed', timestamp: Date.now() - 1000, details: { repoPath: '/repo' } },
    ];
    await render();
    await start('push');
    expect(container.textContent).not.toContain('Old push completed');
    const id = queue.toast!.id;
    jobs = [
      {
        id: 'new',
        operation: 'git:executePush',
        status: 'progress',
        message: 'origin: Writing objects: 50%',
        timestamp: Date.now(),
        details: { repoPath: '/repo' },
      },
      ...jobs,
    ];
    await render();
    expect(queue.toasts).toHaveLength(1);
    expect(queue.toast).toMatchObject({ id, msg: 'origin: Writing objects: 50%' });
    await act(async () => {
      queue.pushSuccess('File saved');
    });
    expect(container.querySelectorAll('.toast-container')).toHaveLength(1);
    expect(container.querySelectorAll('.action-toast')).toHaveLength(2);
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(queue.toasts).toHaveLength(1);
    expect(queue.toast!.kind).toBe('progress');
  });
});
