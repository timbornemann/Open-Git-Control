// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { branchChangeClient } from '@/services/branchChangeClient';
import { gitClient } from '@/services/gitClient';
import { BranchChangeDialog } from './BranchChangeDialog';
import { branchChangeTargetFromArgs, requestBranchChange, useBranchChangeDialogState, type BranchChangeDialog as Dialog } from './branchChangeDialogState';
import type { BranchChangeInspection, ParkedBranchChange } from '@/shared/ipc/branchChange';

vi.mock('@/services/branchChangeClient', () => ({
  branchChangeClient: { inspectBranchChange: vi.fn(), executeBranchChange: vi.fn(), restoreBranchChange: vi.fn(), cancelBranchChange: vi.fn() },
}));
vi.mock('@/contexts/AppStateContext', () => ({ useWorkflowStore: () => vi.fn() }));
vi.mock('@/services/gitClient', () => ({ gitClient: { isAvailable: () => true, onJobEvent: () => () => {}, getDiffPreview: vi.fn() } }));
vi.mock('@/components/diff-viewer/DiffContentPane', () => ({ DiffContentPane: ({ diffText }: { diffText: string }) => createElement('pre', null, diffText) }));
const inspection = (): BranchChangeInspection => ({
  planId: 'plan',
  repoPath: '/repo',
  sourceBranch: 'feature',
  sourceHead: 'a'.repeat(40),
  target: { kind: 'existing', branch: 'main' },
  targetSha: 'b'.repeat(40),
  files: [
    { path: 'partial.txt', index: 'M', worktree: 'M', binary: false },
    { path: 'new.bin', index: '?', worktree: '?', binary: true },
  ],
  blocks: [],
  suggestedName: 'Feature work',
});
const session: ParkedBranchChange = {
  id: 'saved',
  name: 'Parked work',
  sourceBranch: 'feature',
  sourceHead: 'a'.repeat(40),
  targetBranch: 'main',
  worktree: '/repo/.git',
  createdAt: 1,
  phase: 'switched',
  stashOid: 'c'.repeat(40),
};
describe('guided branch-change UI', () => {
  let host: HTMLDivElement;
  let root: Root;
  let dialog: Dialog;
  const changed = vi.fn();
  const finish = vi.fn();
  const render = async (data = inspection(), prepare = false) => {
    dialog = { id: 'branch-change', repoPath: data.repoPath, inspection: data, prepare, finish, retry: vi.fn(), cancel: vi.fn() };
    useBranchChangeDialogState.getState().set(dialog);
    await act(async () =>
      root.render(
        createElement(I18nProvider, { language: 'en', children: createElement(BranchChangeDialog, { dialog, onChanged: changed, onWorktree: vi.fn() }) }),
      ),
    );
  };
  const button = (label: string) => [...host.querySelectorAll('button')].find((entry) => entry.textContent?.includes(label))!;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.mocked(branchChangeClient.executeBranchChange).mockResolvedValue({ success: true, data: { switched: true, restored: true, conflicts: [] } });
    vi.mocked(branchChangeClient.inspectBranchChange).mockResolvedValue({ success: true, data: inspection() });
    vi.mocked(gitClient.getDiffPreview).mockResolvedValue({ success: true, data: { text: '+preview', bytes: 8, lines: 1, truncated: false } });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useBranchChangeDialogState.getState().set(null);
  });
  it('separates partial staging and new files and previews the selected section before any mutation', async () => {
    await render();
    expect(host.textContent).toContain('Staged (1)');
    expect(host.textContent).toContain('Unstaged (1)');
    expect(host.textContent).toContain('New, untracked files (1)');
    expect(host.textContent).toContain('Binary file');
    const files = [...host.querySelectorAll('button')].filter((entry) => entry.textContent?.includes('partial.txt'));
    await act(async () => files[0].click());
    expect(gitClient.getDiffPreview).toHaveBeenLastCalledWith(
      ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--', 'partial.txt'],
      expect.any(Object),
      '/repo',
    );
    await act(async () => files[1].click());
    expect(gitClient.getDiffPreview).toHaveBeenLastCalledWith(['diff', '--no-ext-diff', '--no-textconv', '--', 'partial.txt'], expect.any(Object), '/repo');
    expect(branchChangeClient.executeBranchChange).not.toHaveBeenCalled();
  });
  it.each(['Carry and switch', 'Park and switch'])('executes the named %s choice only after review', async (label) => {
    await render();
    act(() => button('Next').click());
    expect(host.querySelector<HTMLInputElement>('input')?.value).toBe('Feature work');
    expect(branchChangeClient.executeBranchChange).not.toHaveBeenCalled();
    await act(async () => button(label).click());
    expect(branchChangeClient.executeBranchChange).toHaveBeenCalledExactlyOnceWith({
      repoPath: '/repo',
      planId: 'plan',
      mode: label.startsWith('Carry') ? 'carry' : 'park',
      name: 'Feature work',
      progressId: 'branch-change',
    });
    expect(changed).toHaveBeenCalledOnce();
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });
  it('returns the reviewed decision to the Planner without switching before its assignment transaction', async () => {
    await render(inspection(), true);
    act(() => button('Next').click());
    act(() => button('Park and switch').click());
    expect(finish).toHaveBeenCalledWith({ planId: 'plan', mode: 'park', name: 'Feature work', progressId: 'branch-change' });
    expect(branchChangeClient.executeBranchChange).not.toHaveBeenCalled();
  });
  it('closes on Escape without creating a stash', async () => {
    await render();
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(finish).toHaveBeenCalledWith(null);
    expect(branchChangeClient.executeBranchChange).not.toHaveBeenCalled();
  });
  it('shows a failed restoration review request within the same dialog', async () => {
    vi.mocked(branchChangeClient.executeBranchChange).mockResolvedValue({
      success: true,
      data: { switched: false, restored: false, session, error: 'Checkout interrupted', conflicts: [] },
    });
    await render();
    act(() => button('Next').click());
    await act(async () => button('Carry and switch').click());
    vi.mocked(branchChangeClient.inspectBranchChange).mockRejectedValueOnce(new Error('Preview unavailable'));
    await act(async () => button('Review restoration').click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Preview unavailable');
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });
  it('blocks restoring on a dirty worktree and retains a visible review action', async () => {
    await render({ ...inspection(), target: undefined, session, blocks: ['Commit or park the current changes before restoring.'] });
    expect(host.textContent).toContain('Commit or park');
    expect(button('Restore')).toBeUndefined();
    expect(button('Review again')).toBeDefined();
    expect(branchChangeClient.restoreBranchChange).not.toHaveBeenCalled();
  });
  it('switches clean repositories directly and opens no assistant', async () => {
    vi.mocked(branchChangeClient.inspectBranchChange).mockResolvedValue({ success: true, data: { ...inspection(), files: [] } });
    const result = await requestBranchChange('/repo', { kind: 'existing', branch: 'main' });
    expect(result?.switched).toBe(true);
    expect(useBranchChangeDialogState.getState().pending).toBeNull();
  });
  it('requires explicit review before another restoration of an interrupted operation', async () => {
    const blocked = {
      ...inspection(),
      target: undefined,
      session: { ...session, phase: 'applying' as const },
      blocks: ['Review the previous restoration before applying these changes again.'],
    };
    await render(blocked);
    expect(button('Restore')).toBeUndefined();
    vi.mocked(branchChangeClient.inspectBranchChange).mockResolvedValue({
      success: true,
      data: { ...blocked, planId: 'reviewed', recoveryReviewed: true, blocks: [] },
    });
    vi.mocked(branchChangeClient.restoreBranchChange).mockResolvedValue({ success: true, data: { switched: false, restored: true, conflicts: [] } });
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(branchChangeClient.inspectBranchChange).toHaveBeenCalledWith({
      repoPath: '/repo',
      sessionId: session.id,
      reviewedRecovery: true,
      progressId: 'branch-change',
    });
    expect(branchChangeClient.restoreBranchChange).not.toHaveBeenCalled();
    await act(async () => button('Restore').click());
    expect(branchChangeClient.restoreBranchChange).toHaveBeenCalledWith({ repoPath: '/repo', planId: 'reviewed', progressId: 'branch-change' });
  });
  it.each([
    [['checkout', '--', 'file.txt'], null],
    [['checkout', 'HEAD', '--', 'file.txt'], null],
    [['checkout', '-f', 'main'], null],
    [['checkout', 'main'], { kind: 'existing', branch: 'main' }],
    [['switch', '-c', 'new', 'HEAD'], { kind: 'create', branch: 'new', startPoint: 'HEAD', tracking: false }],
    [['checkout', '--track', 'origin/feature'], { kind: 'create', branch: 'feature', startPoint: 'origin/feature', tracking: true }],
  ])('routes HEAD transitions but not file checkout or forced recovery: %j', (args, expected) =>
    expect(branchChangeTargetFromArgs(args as string[])).toEqual(expected),
  );
});
