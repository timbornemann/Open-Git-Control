// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGitCommandWorkflow } from '../useGitCommandWorkflow';
import { gitClient } from '@/services/gitClient';

const args = (mode = 'default') => ['mergeIntoBranch', 'feature', 'main', mode, 'a'.repeat(40), 'b'.repeat(40)];
let root: Root, current: ReturnType<typeof useGitCommandWorkflow>;
let input: Parameters<typeof useGitCommandWorkflow>[0];
function Harness() {
  current = useGitCommandWorkflow(input);
  return null;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement('div'));
  input = {
    workspace: { activeRepo: '/repo', addOpenRepo: vi.fn(), setActiveTab: vi.fn() },
    settings: { language: 'en', confirmDangerousOps: true, defaultBranch: 'main', secretScanBeforePushEnabled: false },
    onUpdateSettings: vi.fn(),
    triggerRefresh: vi.fn(),
    setConfirmDialog: vi.fn(),
    setGitActionToast: vi.fn(),
    setConflictResolverPath: vi.fn(),
  };
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'ensureCommitIdentity').mockResolvedValue(true);
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: '' });
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
});
async function render() {
  await act(async () => root.render(createElement(Harness)));
}
async function run(mode = 'default') {
  let result = false;
  await act(async () => {
    result = await current.runGitCommand(args(mode), 'Merged into main', 'Merging into main…', { expectedRepoPath: '/repo' });
  });
  return result;
}

describe('cross-branch merge workflow', () => {
  it.each(['default', 'noFf'])('checks commit identity for %s before dispatching and refreshes the resulting branch', async (mode) => {
    await render();
    expect(await run(mode)).toBe(true);
    expect(gitClient.ensureCommitIdentity).toHaveBeenCalledWith('/repo');
    expect(gitClient.runGitCommandForRepo).toHaveBeenCalledExactlyOnceWith('/repo', 'mergeIntoBranch', ...args(mode).slice(1));
    expect(input.triggerRefresh).toHaveBeenCalled();
    expect(input.setGitActionToast).toHaveBeenCalledWith({ msg: 'Merged into main', isError: false });
    expect(current.isGitActionRunning).toBe(false);
  });

  it.each(['squash', 'ffOnly'])('does not ask for a commit identity for the non-committing %s mode', async (mode) => {
    await render();
    expect(await run(mode)).toBe(true);
    expect(gitClient.ensureCommitIdentity).not.toHaveBeenCalled();
  });

  it('does not switch when identity setup is cancelled or the repository changes while it is open', async () => {
    await render();
    vi.mocked(gitClient.ensureCommitIdentity).mockResolvedValue(false);
    expect(await run()).toBe(false);
    expect(gitClient.runGitCommandForRepo).not.toHaveBeenCalled();
    let accept!: (ready: boolean) => void;
    vi.mocked(gitClient.ensureCommitIdentity).mockReturnValue(
      new Promise((resolve) => {
        accept = resolve;
      }),
    );
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = current.runGitCommand(args(), 'Merged');
    });
    input = { ...input, workspace: { ...input.workspace, activeRepo: '/other' } };
    await render();
    await act(async () => {
      accept(true);
      await pending;
    });
    expect(gitClient.runGitCommandForRepo).not.toHaveBeenCalled();
  });

  it('opens the existing conflict resolver and releases the run lock after a conflicting merge', async () => {
    await render();
    vi.mocked(gitClient.runGitCommandForRepo).mockImplementation(async (_repo, command) =>
      command === 'statusPorcelain'
        ? { success: true, data: 'UU shared.txt\n' }
        : { success: false, error: 'Merge into "main" did not finish. This target branch remains active.' },
    );
    expect(await run()).toBe(false);
    expect(input.setConflictResolverPath).toHaveBeenCalledWith('shared.txt');
    expect(input.workspace.setActiveTab).toHaveBeenCalledWith('repo');
    expect(current.isGitActionRunningRef.current).toBe(false);
  });
});
