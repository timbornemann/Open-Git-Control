// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGitCommandWorkflow } from '../useGitCommandWorkflow';
import { gitClient } from '@/services/gitClient';
import type { RemoteTransferDialog } from '@/components/hosting/remoteTransferDialogState';
import type * as PullTransferModule from '@/components/hosting/awaitPullTransfer';

const mocked = vi.hoisted(() => ({ pull: vi.fn<(intent: RemoteTransferDialog, signal: AbortSignal) => Promise<void>>() }));
vi.mock('@/components/hosting/awaitPullTransfer', async (importOriginal) => ({
  ...(await importOriginal<typeof PullTransferModule>()),
  awaitPullTransfer: mocked.pull,
}));
let root: Root;
let container: HTMLDivElement;
let workflow: ReturnType<typeof useGitCommandWorkflow>;
function Test({ repo }: { repo: string }) {
  workflow = useGitCommandWorkflow({
    workspace: { activeRepo: repo, addOpenRepo: vi.fn(), setActiveTab: vi.fn() },
    settings: { confirmDangerousOps: false, defaultBranch: 'main', language: 'en', secretScanBeforePushEnabled: true },
    onUpdateSettings: vi.fn(),
    triggerRefresh: vi.fn(),
    setConfirmDialog: vi.fn(),
    setGitActionToast: vi.fn(),
    setConflictResolverPath: vi.fn(),
  });
  return null;
}
const render = (repo: string) => act(() => root.render(createElement(Test, { repo })));
const run = async (args: string[], internalContinuation = false) => {
  let success: boolean | undefined;
  await act(async () => {
    success = await workflow.runGitCommand(args, 'done', undefined, undefined, internalContinuation);
  });
  return success;
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocked.pull.mockReset().mockResolvedValue(undefined);
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: '' });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

it('routes normal and recovery pulls through saved preferences or a one-off explicit strategy without raw Git IPC', async () => {
  render('/repo');
  await expect(run(['pull'])).resolves.toBe(true);
  expect(mocked.pull).toHaveBeenLastCalledWith({ repoPath: '/repo', mode: 'pull' }, expect.any(AbortSignal));
  await expect(run(['pull', '--rebase'], true)).resolves.toBe(true);
  expect(mocked.pull).toHaveBeenLastCalledWith({ repoPath: '/repo', mode: 'pull', pullMode: 'rebase' }, expect.any(AbortSignal));
  await expect(run(['pull', '--no-ff'])).resolves.toBe(true);
  expect(mocked.pull).toHaveBeenLastCalledWith({ repoPath: '/repo', mode: 'pull', pullMode: 'no-ff' }, expect.any(AbortSignal));
  expect(gitClient.runGitCommandForRepo).not.toHaveBeenCalled();
});

it('does not continue recovery after a failed pull or switch to another repository while the pull is pending', async () => {
  render('/one');
  mocked.pull.mockRejectedValueOnce(new Error('Conflict'));
  await expect(run(['pull'])).resolves.toBe(false);
  let oldSignal!: AbortSignal;
  mocked.pull.mockImplementationOnce((_intent, signal) => {
    oldSignal = signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true });
    });
  });
  let pending!: Promise<boolean>;
  act(() => {
    pending = workflow.runGitCommand(['pull', '--rebase'], 'done');
  });
  await expect(run(['fetch'])).resolves.toBe(false);
  render('/two');
  await expect(pending).resolves.toBe(false);
  expect(oldSignal.aborted).toBe(true);
  expect(gitClient.runGitCommandForRepo).not.toHaveBeenCalled();
  expect(mocked.pull.mock.calls.at(-1)?.[0].repoPath).toBe('/one');
});
