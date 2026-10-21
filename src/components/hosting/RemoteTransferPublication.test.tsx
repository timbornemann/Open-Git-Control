// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { useToastQueue } from '@/hooks/useToastQueue';
import { notificationCopyText } from '@/utils/gitFailure';
import { RemoteTransferHost } from './RemoteTransferHost';
import { requestRemoteTransfer, useRemoteTransferDialogState } from './remoteTransferDialogState';
import { initialRemoteTransferState, useRemoteTransferState } from './remoteTransferState';

const mocks = vi.hoisted(() => ({
  repoPath: 'D:\\Projects\\Demo',
  language: 'en',
  request: vi.fn(),
  scan: vi.fn(),
  refresh: vi.fn(),
  cancel: vi.fn(),
  open: vi.fn(),
}));
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (de: string, en: string) => (mocks.language === 'de' ? de : en), t: (key: string) => key }) }));
vi.mock('@/services/hostingClient', () => ({ transferClient: { request: mocks.request } }));
vi.mock('@/services/gitClient', () => ({ gitClient: { scanPushSecrets: mocks.scan, cancelSecretScan: mocks.cancel } }));
vi.mock('./hostingState', () => ({ useHostingState: (select: (state: unknown) => unknown) => select({ connections: [] }) }));
vi.mock('@/contexts/AppStateContext', () => ({
  useGitStore: (select: (state: unknown) => unknown) =>
    select({ activeRepo: mocks.repoPath, currentBranch: 'task/fix', tags: [], triggerRefresh: mocks.refresh }),
  useSettingsStore: (select: (state: unknown) => unknown) => select({ settings: { secretScanBeforePushEnabled: false } }),
  useUIStore: (select: (state: unknown) => unknown) => select({ setActiveTab: vi.fn() }),
  useWorkflowStore: (select: (state: unknown) => unknown) => select({ jobs: [] }),
}));

const oid = 'a'.repeat(40);
const target = { id: 'origin', remoteName: 'origin', url: 'https://example.invalid/team/repo.git', sourceOid: oid, destinationRef: 'refs/heads/task/fix' };
const plan = {
  id: 'plan',
  repoPath: mocks.repoPath,
  branch: 'task/fix',
  sourceBranch: 'task/fix',
  sourceOid: oid,
  tagNames: [],
  force: false,
  secretScanArgs: [],
  targets: [target],
};
let queue: ReturnType<typeof useToastQueue>;
function Harness() {
  queue = useToastQueue();
  return createElement(
    NotificationProvider,
    { value: queue.notifications },
    createElement(Fragment, null, createElement(RemoteTransferHost, { onOpenConfiguration: mocks.open })),
  );
}

describe('publishing planner branches through the transfer host', () => {
  let root: Root;
  let host: HTMLDivElement;
  const settle = async () => {
    for (let index = 0; index < 80; index++) await Promise.resolve();
  };
  const render = () =>
    act(async () => {
      root.render(createElement(Harness));
      await settle();
    });
  const start = (repoPath: string) =>
    act(async () => {
      requestRemoteTransfer({
        repoPath,
        mode: 'push',
        expectedBranch: 'task/fix',
        sourceBranch: 'task/fix',
        destinationBranch: 'task/fix',
        expectedSourceOid: oid,
      });
      await settle();
    });
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    mocks.repoPath = 'D:\\Projects\\Demo';
    mocks.language = 'en';
    useRemoteTransferState.setState(initialRemoteTransferState());
    useRemoteTransferDialogState.getState().close();
    mocks.request.mockImplementation(async (operation: string, input: { repoPath: string }) => {
      if (operation === 'getRemotes')
        return {
          repoPath: input.repoPath,
          branch: 'task/fix',
          upstream: { remote: 'origin', branch: 'task/fix' },
          defaultPushRemote: 'origin',
          supportsPushUrlIsolation: true,
          remotes: [{ name: 'origin', fetchUrls: [target.url], pushUrls: [target.url] }],
        };
      if (operation === 'getPreferences') return {};
      if (operation === 'planPush') return { ...plan, repoPath: input.repoPath };
      if (operation === 'executePush')
        return {
          id: 'batch',
          planId: plan.id,
          repoPath: input.repoPath,
          sourceOid: oid,
          state: 'success',
          targets: [{ ...target, status: 'up-to-date', message: 'Everything up-to-date' }],
        };
      return true;
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useRemoteTransferDialogState.getState().close();
  });
  it.each([
    ['D:\\Projects\\Demo', 'd:/projects/demo/'],
    ['\\\\Server\\Share\\Demo', '//server/share/demo/'],
    ['/projects/Demo', '/projects/Demo/'],
  ])('recognizes the already-pushed branch with equivalent repository paths %s and %s', async (active, requested) => {
    mocks.repoPath = active;
    await render();
    await start(requested);
    expect(mocks.request).toHaveBeenCalledWith('executePush', { repoPath: requested, planId: 'plan' });
    expect(useRemoteTransferState.getState()).toMatchObject({ phase: 'idle', error: '', batch: { state: 'success', targets: [{ status: 'up-to-date' }] } });
    expect(queue.toasts).toHaveLength(1);
    expect(queue.toasts[0]).toMatchObject({ isError: false, msg: 'All selected push targets are already up to date.' });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it('keeps an in-flight publication when only the spelling of the active Windows path changes', async () => {
    const original = mocks.request.getMockImplementation()!;
    let finish!: (result: typeof plan) => void;
    mocks.request.mockImplementation((operation, input) =>
      operation === 'planPush'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : original(operation, input),
    );
    await render();
    await start(mocks.repoPath);
    expect(finish).toBeTypeOf('function');
    mocks.repoPath = 'd:/projects/demo/';
    await render();
    await act(async () => {
      finish(plan);
      await settle();
    });
    expect(mocks.request.mock.calls.filter(([operation]) => operation === 'cancel')).toHaveLength(0);
    expect(mocks.request.mock.calls.filter(([operation]) => operation === 'executePush')).toHaveLength(1);
    expect(queue.toasts).toHaveLength(1);
    expect(queue.toasts[0].isError).toBe(false);
  });
  it.each(['en', 'de'])('explains a genuinely different repository once in %s without starting a transfer', async (language) => {
    mocks.language = language;
    await render();
    await start('D:/Projects/Other');
    expect(mocks.request).not.toHaveBeenCalled();
    expect(queue.toasts).toHaveLength(1);
    const error = queue.toasts[0];
    expect(error.isError).toBe(true);
    expect(error.msg).toContain(language === 'de' ? 'Öffne das gewünschte Repository' : 'Open the intended repository');
    expect(error.msg).not.toMatch(/^Repository (?:changed|wurde gewechselt)\./);
    expect(error.technicalDetails).toBeUndefined();
    expect(notificationCopyText(error)).toBe(error.msg);
  });
  it('preserves case-sensitive POSIX repository boundaries', async () => {
    mocks.repoPath = '/projects/Demo';
    await render();
    await start('/projects/demo');
    expect(mocks.request).not.toHaveBeenCalled();
    expect(queue.toasts[0].isError).toBe(true);
  });
});
