// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { branchChangeClient } from '@/services/branchChangeClient';
import { BranchChangeRuntime } from './BranchChangeRuntime';
import { useBranchChangeDialogState } from './branchChangeDialogState';
import type { BranchChangeInspection, ParkedBranchChange } from '@/shared/ipc/branchChange';
const state = vi.hoisted(() => ({ branch: 'feature' }));
vi.mock('@/contexts/AppStateContext', () => ({ useGitStore: (select: (value: unknown) => unknown) => select({ currentBranch: state.branch }) }));
vi.mock('@/services/electronApi', () => ({ getElectronApi: () => ({ git: { listParkedBranchChanges: true } }) }));
vi.mock('@/services/branchChangeClient', () => ({
  branchChangeClient: { listParkedBranchChanges: vi.fn(), inspectBranchChange: vi.fn(), cancelBranchChange: vi.fn() },
}));
vi.mock('@/components/project-planner/plannerWorkDialogState', () => ({
  usePlannerWorkDialogState: (select: (value: unknown) => unknown) => select({ target: null }),
}));
vi.mock('./BranchChangeDialog', () => ({
  BranchChangeDialog: ({ dialog }: { dialog: { finish(value: null): void } }) =>
    createElement('div', { role: 'dialog' }, createElement('button', { onClick: () => dialog.finish(null) }, 'Later')),
}));
describe('parked-change return offers', () => {
  let host: HTMLDivElement;
  let root: Root;
  const changed = vi.fn();
  const worktree = vi.fn();
  const saved = (id: string, currentWorktree = true): ParkedBranchChange => ({
    id,
    name: id,
    sourceBranch: 'feature',
    sourceHead: 'a'.repeat(40),
    targetBranch: 'main',
    worktree: '/repo/.git',
    currentWorktree,
    createdAt: 1,
    phase: 'switched',
    stashOid: 'c'.repeat(40),
  });
  const render = (repo = '/repo', refreshSignal = 0) =>
    act(async () => root.render(createElement(BranchChangeRuntime, { activeRepo: repo, refreshSignal, onChanged: changed, onWorktree: worktree })));
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    state.branch = 'feature';
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    useBranchChangeDialogState.getState().set(null);
    vi.mocked(branchChangeClient.listParkedBranchChanges).mockImplementation(async (repo) => ({
      success: true,
      data: repo === '/repo' ? [saved('latest'), saved('older')] : [],
    }));
    vi.mocked(branchChangeClient.inspectBranchChange).mockImplementation(async (request) => ({
      success: true,
      data: {
        planId: request.sessionId,
        repoPath: request.repoPath,
        sourceBranch: state.branch,
        sourceHead: 'a'.repeat(40),
        targetSha: 'a'.repeat(40),
        files: [],
        blocks: [],
        suggestedName: 'Saved work',
        session: saved(request.sessionId!),
      } as BranchChangeInspection,
    }));
    vi.mocked(branchChangeClient.cancelBranchChange).mockResolvedValue(true);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useBranchChangeDialogState.getState().pending?.finish(null);
    useBranchChangeDialogState.getState().set(null);
  });
  it('offers matching parked changes together and Later suppresses repeated refresh prompts until returning', async () => {
    await render();
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(useBranchChangeDialogState.getState().pending?.alternatives?.map((entry) => entry.id)).toEqual(['latest', 'older']);
    act(() => host.querySelector('button')!.click());
    await render('/repo', 1);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    state.branch = 'main';
    await render('/repo', 2);
    state.branch = 'feature';
    await render('/repo', 3);
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(changed).not.toHaveBeenCalled();
  });
  it('does not offer parked work from another worktree and cancels an offer on repository change', async () => {
    vi.mocked(branchChangeClient.listParkedBranchChanges).mockResolvedValueOnce({ success: true, data: [saved('other-worktree', false)] });
    await render();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await render('/repo', 1);
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    await render('/other', 2);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(branchChangeClient.cancelBranchChange).toHaveBeenCalledWith('/repo');
  });
  it('offers an interrupted restoration for review after reopening even on its target branch', async () => {
    state.branch = 'main';
    vi.mocked(branchChangeClient.listParkedBranchChanges).mockResolvedValue({ success: true, data: [{ ...saved('interrupted'), phase: 'applying' }] });
    await render();
    expect(branchChangeClient.inspectBranchChange).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'interrupted' }));
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
