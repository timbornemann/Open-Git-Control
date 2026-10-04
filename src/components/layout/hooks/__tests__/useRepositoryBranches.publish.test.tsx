// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepositoryBranches } from '../useRepositoryBranches';
import { transferClient } from '@/services/hostingClient';
import { gitClient } from '@/services/gitClient';
import { requestRemoteTransfer } from '@/components/hosting/remoteTransferDialogState';
import type { GitRemoteSnapshotDto } from '@/types/remoteTransfers';

vi.mock('@/data/resourceHooks', () => ({ useCachedResult: () => ({}) }));
vi.mock('@/components/hosting/remoteTransferDialogState', () => ({ requestRemoteTransfer: vi.fn() }));

const snapshot = (repoPath: string): GitRemoteSnapshotDto => ({
  repoPath,
  branch: 'feature',
  upstream: null,
  defaultPushRemote: 'origin',
  supportsPushUrlIsolation: true,
  remotes: [{ name: 'origin', fetchUrls: ['https://forgejo.example/team/demo.git'], pushUrls: ['https://forgejo.example/team/demo.git'] }],
});
const params = (repoPath = '/repo/demo') => ({
  activeRepo: repoPath,
  refreshTrigger: 0,
  hasRemoteOrigin: true,
  language: 'en' as const,
  setGitActionToast: vi.fn(),
  runGitCommand: vi.fn().mockResolvedValue(true),
  triggerRefresh: vi.fn(),
  setConfirmDialog: vi.fn(),
  setInputDialog: vi.fn(),
});
let root: Root;
let current!: ReturnType<typeof useRepositoryBranches>;
async function render(input: ReturnType<typeof params>) {
  function Harness() {
    current = useRepositoryBranches(input);
    return null;
  }
  await act(async () => {
    root.render(createElement(Harness));
    await Promise.resolve();
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  root = createRoot(document.createElement('div'));
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: '* main\n' });
  vi.spyOn(transferClient, 'request').mockImplementation(async (_operation, input) => snapshot(input.repoPath));
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
});

describe('explicit publication of newly created branches', () => {
  it('creates locally and publishes only after the user chooses Publish branch', async () => {
    const input = params();
    await render(input);
    await act(async () => {
      await current.handleCreateBranch('feature');
    });
    expect(input.runGitCommand).toHaveBeenCalledWith(['checkout', '-b', 'feature'], expect.any(String), undefined, { expectedRepoPath: '/repo/demo' });
    expect(requestRemoteTransfer).not.toHaveBeenCalled();
    const dialog = input.setConfirmDialog.mock.calls[0][0];
    expect(dialog.confirmLabel).toBe('Publish branch');
    await act(async () => {
      await dialog.onConfirm();
    });
    expect(requestRemoteTransfer).toHaveBeenCalledWith({ repoPath: '/repo/demo', mode: 'push', destinationBranch: 'feature', expectedBranch: 'feature' });
  });

  it('does not publish a previously created branch after switching repositories', async () => {
    const input = params();
    // Keep the same component type so the active-repository guard sees the switch.
    let activeInput = input;
    function Harness() {
      current = useRepositoryBranches(activeInput);
      return null;
    }
    await act(async () => {
      root.render(createElement(Harness));
    });
    await act(async () => {
      await current.handleCreateBranch('feature');
    });
    const dialog = input.setConfirmDialog.mock.calls[0][0];
    activeInput = params('/repo/other');
    await act(async () => {
      root.render(createElement(Harness));
    });
    await act(async () => {
      await dialog.onConfirm();
    });
    expect(requestRemoteTransfer).not.toHaveBeenCalled();
  });
});
