// @vitest-environment jsdom
import { act, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionToastViewport } from '@/components/ActionToastViewport';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { useToastQueue } from '@/hooks/useToastQueue';
import type { GitJobEventDto } from '@/types/aiDtos';
import type { SecretScanResultDto } from '@/types/gitDtos';
import type { SecretScanProgressDto } from '@/types/secretScan';
import { RemoteTransferHost } from './RemoteTransferHost';
import { requestRemoteTransfer, useRemoteTransferDialogState } from './remoteTransferDialogState';
import { initialRemoteTransferState, useRemoteTransferState } from './remoteTransferState';

const mocked = vi.hoisted(() => ({ request: vi.fn(), scan: vi.fn(), cancelScan: vi.fn(), command: vi.fn(), refresh: vi.fn() }));
vi.mock('@/services/hostingClient', () => ({ transferClient: { request: mocked.request } }));
vi.mock('@/services/gitClient', () => ({
  gitClient: {
    scanPushSecrets: mocked.scan,
    cancelSecretScan: mocked.cancelScan,
    runGitCommandForRepo: mocked.command,
  },
}));
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en, t: (key: string) => key }) }));
vi.mock('@/contexts/AppStateContext', () => ({
  useGitStore: (select: (state: unknown) => unknown) => select(repository),
  useSettingsStore: (select: (state: unknown) => unknown) => select({ settings: { secretScanBeforePushEnabled: true } }),
  useUIStore: (select: (state: unknown) => unknown) => select({ setActiveTab: vi.fn() }),
  useWorkflowStore: (select: (state: unknown) => unknown) => select({ jobs }),
}));
vi.mock('./hostingState', () => ({ useHostingState: (select: (state: unknown) => unknown) => select({ connections: [] }) }));

let root: Root;
let container: HTMLDivElement;
let jobs: GitJobEventDto[];
let repository: { activeRepo: string; currentBranch: string; tags: string[]; triggerRefresh: typeof mocked.refresh };
let queue: ReturnType<typeof useToastQueue>;
let completeScan: (result: { success: boolean; data?: SecretScanResultDto; error?: string }) => void;
let completePush: (result: unknown) => void;
const cleanScan: SecretScanResultDto = {
  scanned: true,
  strictness: 'medium',
  findings: [],
  notes: [],
  stats: { checkedLines: 32001, stagedLines: 0, toPushLines: 32001, tagLines: 0 },
};
const plan = {
  id: 'plan',
  repoPath: '/repo',
  branch: 'main',
  sourceOid: 'a'.repeat(40),
  tagNames: [],
  force: false,
  targets: [],
  secretScanArgs: ['scan-plan'],
};
function Harness() {
  queue = useToastQueue({ autoHideMs: 3000, errorAutoHideMs: null });
  return (
    <NotificationProvider value={queue.notifications}>
      <Fragment>
        <RemoteTransferHost onOpenConfiguration={() => {}} />
        <ActionToastViewport toasts={queue.toasts} onDismiss={queue.dismiss} />
      </Fragment>
    </NotificationProvider>
  );
}
async function flush(operation: () => void = () => {}) {
  await act(async () => {
    operation();
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });
}
const render = () => flush(() => root.render(<Harness />));
async function start() {
  await render();
  await flush(() => requestRemoteTransfer({ repoPath: '/repo', mode: 'push' }));
  expect(useRemoteTransferState.getState().transferStage).toBe('scanning');
}
async function progress(secretScan: SecretScanProgressDto, extra: { repoPath?: string; progressId?: string } = {}) {
  jobs.unshift({
    id: 'scan-job',
    operation: 'security:secret-scan',
    status: 'progress',
    timestamp: Date.now(),
    // The backend may resolve a saved alias to the canonical repository root.
    details: { repoPath: '/canonical/repo', progressId: useRemoteTransferState.getState().scanProgressId, secretScan, ...extra },
  });
  await render();
}
const bar = () => container.querySelector('[role="progressbar"]');
const executeCalls = () => mocked.request.mock.calls.filter(([operation]) => operation === 'executePush');
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  jobs = [];
  repository = { activeRepo: '/repo', currentBranch: 'main', tags: [], triggerRefresh: mocked.refresh };
  useRemoteTransferState.setState(initialRemoteTransferState());
  useRemoteTransferDialogState.getState().close();
  mocked.scan.mockImplementation(
    () =>
      new Promise((resolve) => {
        completeScan = resolve;
      }),
  );
  mocked.cancelScan.mockResolvedValue({ success: true });
  mocked.command.mockResolvedValue({ success: true, data: '' });
  mocked.request.mockImplementation(async (operation: string) => {
    if (operation === 'getPreferences') return {};
    if (operation === 'getRemotes')
      return {
        repoPath: '/canonical/repo',
        branch: 'main',
        supportsPushUrlIsolation: true,
        remotes: [{ name: 'origin', fetchUrls: ['https://example.test/repo.git'], pushUrls: ['https://example.test/repo.git'] }],
      };
    if (operation === 'planPush') return plan;
    if (operation === 'executePush')
      return new Promise((resolve) => {
        completePush = resolve;
      });
    return {};
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('push secret-scan notification progress', () => {
  it('shows indeterminate setup, measured commit progress and final checks, then replaces the scan with the push in the same notification', async () => {
    await start();
    const id = queue.toast!.id;
    expect(container.textContent).toContain('Preparing secret scan');
    expect(bar()?.hasAttribute('aria-valuenow')).toBe(false);
    await progress({ phase: 'history', processedCommits: 96, totalCommits: 205, checkedLines: 32000 });
    expect(bar()?.getAttribute('aria-valuenow')).toBe('46');
    expect(container.textContent).toContain('96 / 205 commits · 32,000 lines checked');
    expect(container.textContent).toContain('46%');
    expect(queue.toasts).toHaveLength(1);
    expect(queue.toast!.id).toBe(id);
    await progress({ phase: 'verifying', checkedLines: 32001 });
    expect(container.textContent).toContain('Final checks');
    expect(bar()?.hasAttribute('aria-valuenow')).toBe(false);
    await flush(() => completeScan({ success: true, data: cleanScan }));
    expect(executeCalls()).toHaveLength(1);
    await flush(() =>
      jobs.unshift({
        id: 'push-job',
        operation: 'git:executePush',
        status: 'progress',
        timestamp: Date.now(),
        message: 'Pushing origin',
        details: { repoPath: '/repo' },
      }),
    );
    await render();
    expect(container.textContent).toContain('Pushing origin');
    expect(bar()).toBeNull();
    await progress({ phase: 'complete', checkedLines: 32001 });
    expect(container.textContent).toContain('Pushing origin');
    expect(container.textContent).not.toContain('Secret scan');
    expect(queue.toast!.id).toBe(id);
    await flush(() => completePush({ ...plan, planId: 'plan', state: 'success' }));
    expect(queue.toast!.id).toBe(id);
    expect(queue.toast!.kind).toBe('success');
    expect(bar()).toBeNull();
  });

  it('reports skipped synchronized history in the existing notification', async () => {
    await start();
    await progress({ phase: 'verifying', checkedLines: 0, pushScope: { mode: 'incremental', endpointCount: 1, totalCommits: 0, fallbackReasons: [] } });
    expect(container.textContent).toContain('No new commits');
    expect(container.textContent).toContain('History scan skipped');
    expect(bar()?.hasAttribute('aria-valuenow')).toBe(false);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows the fallback reason with the actual full-scan count and progress', async () => {
    await start();
    await progress({
      phase: 'history',
      processedCommits: 2,
      totalCommits: 4,
      checkedLines: 12,
      pushScope: { mode: 'mixed', endpointCount: 2, totalCommits: 4, fallbackReasons: ['Full history scan for backup: remote objects unavailable locally.'] },
    });
    expect(container.textContent).toContain('4 commits to check across 2 push endpoints');
    expect(container.textContent).toContain('remote objects unavailable locally');
    expect(bar()?.getAttribute('aria-valuenow')).toBe('50');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    const pushScope = {
      mode: 'mixed' as const,
      endpointCount: 2,
      totalCommits: 4,
      fallbackReasons: ['Remote objects unavailable locally.', 'Backup is unreachable.'],
    };
    await flush(() => completeScan({ success: true, data: { ...cleanScan, pushScope, notes: pushScope.fallbackReasons } }));
    await flush(() => completePush({ ...plan, planId: 'plan', state: 'success' }));
    expect(container.textContent).toContain('Remote objects unavailable locally');
    expect(container.textContent).toContain('1 more explanations in Check details');
    const result = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Open transfer result')!;
    await flush(() => result.click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Backup is unreachable');
  });

  it('ignores progress from another repository or scan and resets counters on retry', async () => {
    await start();
    const oldId = useRemoteTransferState.getState().scanProgressId!;
    await progress({ phase: 'history', processedCommits: 1, totalCommits: 10, checkedLines: 10 });
    await progress({ phase: 'complete', checkedLines: 999 }, { repoPath: '/other' });
    await progress({ phase: 'complete', checkedLines: 999 }, { progressId: 'older-scan' });
    expect(bar()?.getAttribute('aria-valuenow')).toBe('10');
    await flush(() => completeScan({ success: false, error: 'Scan failed' }));
    expect(queue.toast!.kind).toBe('error');
    expect(bar()).toBeNull();
    await flush(() => requestRemoteTransfer({ repoPath: '/repo', mode: 'push' }));
    const newId = useRemoteTransferState.getState().scanProgressId!;
    expect(newId).not.toBe(oldId);
    expect(container.textContent).toContain('Preparing secret scan');
    expect(container.textContent).not.toContain('999');
    await progress({ phase: 'complete', checkedLines: 999 }, { progressId: oldId });
    expect(bar()?.hasAttribute('aria-valuenow')).toBe(false);
    expect(container.textContent).not.toContain('999');
    await progress({ phase: 'tags', processedCommits: 3, totalCommits: 6, checkedLines: 12 });
    expect(bar()?.getAttribute('aria-valuenow')).toBe('50');
    expect(container.textContent).toContain('Checking tag commits');
  });

  it('cancels the scan without starting a push or leaving a progress bar or persistent notification', async () => {
    await start();
    await progress({ phase: 'history', processedCommits: 96, totalCommits: 205, checkedLines: 32000 });
    const cancel = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Cancel')!;
    await flush(() => cancel.click());
    expect(mocked.cancelScan).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Cancelling transfer');
    expect(bar()).toBeNull();
    await progress({ phase: 'history', processedCommits: 192, totalCommits: 205, checkedLines: 42000 });
    expect(container.textContent).not.toContain('42,000');
    await flush(() => completeScan({ success: false, error: 'Secret scan was aborted.' }));
    expect(executeCalls()).toHaveLength(0);
    expect(queue.toast!.kind).toBe('info');
    expect(queue.toast!.isError).toBe(false);
    expect(bar()).toBeNull();
    await flush(() => vi.advanceTimersByTime(3000));
    expect(queue.toasts).toHaveLength(0);
  });

  it('clears scan progress on repository changes and ignores late results from the previous context', async () => {
    await start();
    const oldId = useRemoteTransferState.getState().scanProgressId!;
    repository.activeRepo = '/other';
    await render();
    expect(queue.toasts).toHaveLength(0);
    await progress({ phase: 'complete', checkedLines: 999 }, { progressId: oldId });
    await flush(() => completeScan({ success: true, data: cleanScan }));
    expect(queue.toasts).toHaveLength(0);
    expect(executeCalls()).toHaveLength(0);
    expect(bar()).toBeNull();
  });
});
