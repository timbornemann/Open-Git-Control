// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepositoryMergeActions } from '../useRepositoryMergeActions';
import { gitClient } from '@/services/gitClient';
import type { BranchInfo, GitMergeDirection, GitMergeMode } from '@/types/git';
import type { ConfirmDialogState } from '@/app/state/contracts';
import {
  resetWorkingDirectoryNavigationGuardForTests,
  setActiveWorkingDirectoryNavigationGuard,
} from '@/components/working-directory/workingDirectoryNavigationGuard';

const sourceOid = 'a'.repeat(40),
  targetOid = 'b'.repeat(40);
const branches: BranchInfo[] = [
  { name: 'feature', isHead: true, scope: 'local' },
  { name: 'main', isHead: false, scope: 'local' },
  { name: 'remotes/origin/main', isHead: false, scope: 'remote' },
];
const params = () => ({
  activeRepo: '/repo/demo' as string | null,
  currentBranch: 'feature',
  branches,
  tr: (_de: string, en: string) => en,
  runGitCommand: vi.fn().mockResolvedValue(true),
  setConfirmDialog: vi.fn(),
  setGitActionToast: vi.fn(),
});
let input: ReturnType<typeof params>, root: Root, action: ReturnType<typeof useRepositoryMergeActions>;
function Harness() {
  action = useRepositoryMergeActions(input);
  return null;
}
async function render() {
  await act(async () => root.render(createElement(Harness)));
}
async function request(branch = 'main', mode: GitMergeMode = 'default', direction: GitMergeDirection = 'intoSelected') {
  await act(async () => {
    await action(branch, mode, direction);
  });
}
const dialog = () => input.setConfirmDialog.mock.calls.at(-1)?.[0] as ConfirmDialogState;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  input = params();
  root = createRoot(document.createElement('div'));
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockImplementation(async (_repo, command, ...args) => ({
    success: true,
    data: command === 'show' ? (args.at(-1) === 'refs/heads/feature' ? sourceOid : targetOid) : '',
  }));
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
  resetWorkingDirectoryNavigationGuardForTests();
});

describe('repository merge direction and confirmations', () => {
  it('captures exact branch commits, explains the switch and submits once after confirmation', async () => {
    await render();
    await request();
    expect(input.runGitCommand).not.toHaveBeenCalled();
    const confirmation = dialog();
    expect(confirmation.message).toContain('switches to "main"');
    expect(confirmation.contextItems.map((item) => item.value)).toEqual(['feature', 'main', 'Merge normally (default)']);
    expect(confirmation.consequences).toContain('"main" stays active afterwards');
    expect(confirmation.consequences).toContain('Nothing is uploaded');
    await act(async () => {
      await confirmation.onConfirm();
      await confirmation.onConfirm();
    });
    expect(input.runGitCommand).toHaveBeenCalledExactlyOnceWith(
      ['mergeIntoBranch', 'feature', 'main', 'default', sourceOid, targetOid],
      expect.any(String),
      expect.any(String),
      { expectedRepoPath: '/repo/demo' },
    );
  });

  it('keeps the existing inward merge and accurately describes squash staging', async () => {
    await render();
    await request('remotes/origin/main', 'squash', 'intoCurrent');
    expect(dialog().contextItems[0].value).toBe('origin/main');
    expect(dialog().consequences).toContain('You then create a commit yourself');
    expect(dialog().confirmLabel).toBe('Prepare changes');
    await act(async () => {
      await dialog().onConfirm();
    });
    expect(input.runGitCommand.mock.calls[0][0]).toEqual(['merge', '--squash', 'origin/main']);
    expect(input.runGitCommand.mock.calls[0][1]).toContain('Create your commit now');
  });

  it('blocks open changes and remote targets before opening a confirmation', async () => {
    await render();
    vi.mocked(gitClient.runGitCommandForRepo).mockResolvedValue({ success: true, data: ' M file.ts\n' });
    await request();
    expect(input.setGitActionToast.mock.calls.at(-1)?.[0].msg).toContain('Commit or stash');
    await request('remotes/origin/main');
    expect(input.setGitActionToast.mock.calls.at(-1)?.[0].msg).toContain('local target');
    expect(input.setConfirmDialog).not.toHaveBeenCalled();
    expect(input.runGitCommand).not.toHaveBeenCalled();
  });

  it.each(['repository', 'branch'])('ignores a captured confirmation after a %s change', async (change) => {
    await render();
    await request();
    const confirmation = dialog();
    if (change === 'repository') input = { ...input, activeRepo: '/repo/other' };
    else input = { ...input, currentBranch: 'other' };
    await render();
    await act(async () => {
      await confirmation.onConfirm();
    });
    expect(input.runGitCommand).not.toHaveBeenCalled();
  });

  it('ignores a delayed preview when the repository changes', async () => {
    await render();
    let resolve!: (value: { success: true; data: string }) => void;
    vi.mocked(gitClient.runGitCommandForRepo).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = action('main', 'default', 'intoSelected');
    });
    input = { ...input, activeRepo: '/repo/other' };
    await render();
    // Each read uses the same promise; no obsolete dialog may appear.
    await act(async () => {
      resolve({ success: true, data: sourceOid });
      await pending;
    });
    expect(input.setConfirmDialog).not.toHaveBeenCalled();
  });

  it('respects the unsaved-editor guard before opening and again before executing', async () => {
    await render();
    setActiveWorkingDirectoryNavigationGuard((_target, _proceed, cancel) => cancel?.());
    await request();
    expect(input.setConfirmDialog).not.toHaveBeenCalled();
    resetWorkingDirectoryNavigationGuardForTests();
    await request();
    const confirmation = dialog();
    setActiveWorkingDirectoryNavigationGuard((_target, _proceed, cancel) => cancel?.());
    await act(async () => {
      await confirmation.onConfirm();
    });
    expect(input.runGitCommand).not.toHaveBeenCalled();
  });
});
