// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteTransferHost } from './RemoteTransferHost';
import { requestRemoteTransfer, useRemoteTransferDialogState } from './remoteTransferDialogState';
import { initialRemoteTransferState, useRemoteTransferState } from './remoteTransferState';

const mocked = vi.hoisted(() => ({
  request: vi.fn(),
  scan: vi.fn(),
  approve: vi.fn(),
  allowlist: vi.fn(),
  editor: vi.fn(),
  setTab: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/services/hostingClient', () => ({ transferClient: { request: mocked.request } }));
vi.mock('@/services/gitClient', () => ({ gitClient: { scanPushSecrets: mocked.scan, approveSecretScanPush: mocked.approve, cancelSecretScan: vi.fn() } }));
vi.mock('@/services/repositorySecretScanAllowlistClient', () => ({ addSecretScanFindingPaths: mocked.allowlist }));
vi.mock('@/components/repository-security/secretScanAllowlistNavigation', () => ({ requestSecretScanAllowlistEditor: mocked.editor }));
vi.mock('./useRemoteTransferNotifications', () => ({ useRemoteTransferNotifications: () => vi.fn() }));
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en, t: (key: string) => key }) }));
vi.mock('@/contexts/AppStateContext', () => ({
  useGitStore: (select: (state: unknown) => unknown) => select({ activeRepo: '/repo', currentBranch: 'main', tags: [], triggerRefresh: mocked.refresh }),
  useSettingsStore: (select: (state: unknown) => unknown) => select({ settings: { secretScanBeforePushEnabled: true } }),
  useUIStore: (select: (state: unknown) => unknown) => select({ setActiveTab: mocked.setTab }),
  useWorkflowStore: (select: (state: unknown) => unknown) => select({ runGitCommand: vi.fn() }),
}));
vi.mock('./hostingState', () => ({ useHostingState: (select: (state: unknown) => unknown) => select({ connections: [] }) }));

let root: Root;
let container: HTMLDivElement;
const scan = {
  scanned: true,
  strictness: 'low',
  findings: [
    {
      id: 'example',
      filePath: 'tests/tokens.ts',
      lineNumber: 42,
      ruleId: 'github-token',
      severity: 'critical',
      source: 'to-push',
      contextLine: 'const test = "[REDACTED]";',
    },
  ],
  notes: [],
  stats: { checkedLines: 1, stagedLines: 0, toPushLines: 1, tagLines: 0 },
};
const plan = {
  id: 'plan',
  repoPath: '/repo',
  sourceOid: 'a'.repeat(40),
  branch: 'main',
  tagNames: [],
  force: false,
  secretScanArgs: ['__ogc_transfer_scan_plan__', `${'a'.repeat(40)}:refs/heads/main`],
  targets: [{ id: 'origin', remoteName: 'origin', url: 'https://example.test/repo.git', destinationRef: 'refs/heads/main', sourceOid: 'a'.repeat(40) }],
};
async function settle() {
  for (let index = 0; index < 40; index++) await Promise.resolve();
}
async function start() {
  await act(async () => {
    root.render(createElement(RemoteTransferHost, { onOpenConfiguration: vi.fn() }));
    await settle();
  });
  await act(async () => {
    requestRemoteTransfer({ repoPath: '/repo', mode: 'push' });
    await settle();
    vi.runOnlyPendingTimers();
  });
}
async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find((element) => element.textContent === label);
  expect(button).toBeDefined();
  await act(async () => {
    button!.click();
    await settle();
  });
}
const executed = () => mocked.request.mock.calls.filter(([operation]) => operation === 'executePush');
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.resetAllMocks();
  useRemoteTransferState.setState(initialRemoteTransferState());
  useRemoteTransferDialogState.getState().close();
  mocked.scan.mockResolvedValue({ success: true, data: structuredClone(scan) });
  mocked.approve.mockResolvedValue({ success: true, data: true });
  mocked.allowlist.mockResolvedValue(undefined);
  mocked.request.mockImplementation(async (operation: string) => {
    if (operation === 'getRemotes')
      return {
        repoPath: '/repo',
        branch: 'main',
        supportsPushUrlIsolation: true,
        remotes: [{ name: 'origin', fetchUrls: ['https://example.test/repo.git'], pushUrls: ['https://example.test/repo.git'] }],
      };
    if (operation === 'getPreferences') return {};
    if (operation === 'planPush') return structuredClone(plan);
    if (operation === 'executePush') return { id: 'batch', planId: 'plan', repoPath: '/repo', state: 'success', targets: [] };
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('secret findings dialog workflow', () => {
  it('starts with a safe focused action and returns to the workspace without approving or pushing', async () => {
    await start();
    await act(async () => vi.runOnlyPendingTimers());
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Secret scan · Push paused');
    expect(document.activeElement?.textContent).toBe('Cancel and fix');
    expect(executed()).toHaveLength(0);
    await click('Cancel and fix');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocked.setTab).toHaveBeenCalledExactlyOnceWith('repo');
    expect(mocked.approve).not.toHaveBeenCalled();
    expect(mocked.allowlist).not.toHaveBeenCalled();
    expect(executed()).toHaveLength(0);
  });

  it('approves only the reviewed push when the explicit bypass is clicked', async () => {
    await start();
    await click('Push anyway');
    expect(mocked.approve).toHaveBeenCalledExactlyOnceWith(plan.secretScanArgs, '/repo');
    expect(executed()).toEqual([['executePush', { repoPath: '/repo', planId: 'plan' }]]);
    expect(mocked.allowlist).not.toHaveBeenCalled();
  });

  it('saves file exceptions and checks again before pushing', async () => {
    mocked.scan.mockResolvedValueOnce({ success: true, data: structuredClone(scan) }).mockResolvedValue({ success: true, data: { ...scan, findings: [] } });
    await start();
    await click('Allowlist 1 file & push');
    expect(mocked.allowlist).toHaveBeenCalledExactlyOnceWith('/repo', scan.findings);
    expect(mocked.scan).toHaveBeenCalledTimes(2);
    expect(mocked.approve).not.toHaveBeenCalled();
    expect(executed()).toHaveLength(1);
  });

  it('opens the allowlist editor without saving an exception or pushing', async () => {
    await start();
    await click('Edit allowlist');
    expect(mocked.editor).toHaveBeenCalledExactlyOnceWith('/repo');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocked.allowlist).not.toHaveBeenCalled();
    expect(executed()).toHaveLength(0);
  });
});
