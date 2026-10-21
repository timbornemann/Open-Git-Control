// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { plannerClient } from '@/services/plannerClient';
import { PlannerWorkDialog } from './PlannerWorkDialog';
import { usePlannerWorkDialogState } from './plannerWorkDialogState';
import type { PlannerWorkInspection } from '@/types/plannerWork';

const { refresh, activate, changed, git } = vi.hoisted(() => ({
  refresh: vi.fn(async () => {}),
  activate: vi.fn(),
  changed: vi.fn(),
  git: { currentBranch: 'main', onNavigateToCommit: vi.fn() },
}));
vi.mock('@/contexts/ProjectPlannerContext', () => ({ useProjectPlanner: () => ({ data: { items: [] }, refresh, activateRepositoryProject: activate }) }));
vi.mock('@/contexts/AppStateContext', () => ({ useGitStore: (select: (state: unknown) => unknown) => select(git) }));
vi.mock('@/services/plannerClient', () => ({
  plannerClient: { inspectWork: vi.fn(), startWork: vi.fn(), getWork: vi.fn(), updateWork: vi.fn(), onDataChanged: vi.fn(() => () => {}) },
}));
const item = {
  id: 'task',
  projectId: 'project',
  title: 'Fix a bug',
  description: '',
  priority: 'medium' as const,
  status: 'bug' as const,
  tags: ['Bug'],
  createdAt: 1,
  updatedAt: 1,
};
const plan = (): PlannerWorkInspection => ({
  planId: 'reviewed-plan',
  item,
  suggestedName: 'task/123-fix-a-bug',
  bases: [{ ref: 'refs/heads/main', sha: 'a'.repeat(40) }],
  defaultBase: 'refs/heads/main',
  changes: [],
  worktrees: [],
});
describe('PlannerWorkDialog', () => {
  let host: HTMLDivElement;
  let root: Root;
  const render = async (activeRepo = '/repo') =>
    act(async () => {
      root.render(createElement(I18nProvider, { language: 'de', children: createElement(PlannerWorkDialog, { activeRepo, onChanged: changed }) }));
    });
  const primary = () => host.querySelector<HTMLButtonElement>('.dialog-btn-primary')!;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    git.currentBranch = 'main';
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    usePlannerWorkDialogState.setState({ target: { repoPath: '/repo', item } });
    vi.mocked(plannerClient.inspectWork).mockResolvedValue({ success: true, data: plan() });
    vi.mocked(plannerClient.getWork).mockResolvedValue({ success: true, data: { itemId: item.id, commits: [], requests: [] } });
    vi.mocked(plannerClient.startWork).mockResolvedValue({ success: true, data: { branch: plan().suggestedName, item: { ...item, status: 'in-progress' } } });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    usePlannerWorkDialogState.setState({ target: null });
  });
  it('shows the editable suggestion and base, and starts only on confirmation', async () => {
    await render();
    expect(plannerClient.startWork).not.toHaveBeenCalled();
    expect(primary().disabled).toBe(false);
    await act(async () => primary().click());
    expect(plannerClient.startWork).toHaveBeenCalledWith({
      repoPath: '/repo',
      itemId: 'task',
      planId: 'reviewed-plan',
      branchName: 'task/123-fix-a-bug',
      baseRef: 'refs/heads/main',
      acceptChanges: false,
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledOnce();
  });
  it('requires explicit dirty carry and does not execute on Escape', async () => {
    vi.mocked(plannerClient.inspectWork).mockResolvedValue({ success: true, data: { ...plan(), changes: ['draft.txt'] } });
    await render();
    expect(primary().disabled).toBe(true);
    expect(host.textContent).toContain('draft.txt');
    act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(primary().disabled).toBe(false);
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(plannerClient.startWork).not.toHaveBeenCalled();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it('offers a worktree switch while the occupied branch cannot be checked out', async () => {
    const inspection = plan();
    inspection.existing = {
      id: 'workflow',
      projectId: 'project',
      name: inspection.suggestedName,
      baseRef: 'refs/heads/main',
      baseSha: 'a'.repeat(40),
      startedAt: 1,
      automationPaused: false,
    };
    inspection.worktrees = [{ branch: inspection.suggestedName, path: '/other-worktree' }];
    vi.mocked(plannerClient.inspectWork).mockResolvedValue({ success: true, data: inspection });
    await render();
    expect(primary().disabled).toBe(true);
    expect(host.textContent).toContain('/other-worktree');
    act(() => [...host.querySelectorAll('button')].find((button) => button.textContent === 'Zum Worktree wechseln')!.click());
    expect(activate).toHaveBeenCalledWith('/other-worktree');
  });
  it('keeps a partial checkout reviewable and retries assignment explicitly', async () => {
    vi.mocked(plannerClient.startWork).mockResolvedValue({
      success: true,
      data: { branch: plan().suggestedName, recoveryId: 'recovery', error: 'Assignment failed' },
    });
    vi.mocked(plannerClient.getWork).mockResolvedValue({ success: true, data: { itemId: item.id, commits: [], requests: [], revision: 'reviewed-task' } });
    vi.mocked(plannerClient.updateWork).mockResolvedValue({ success: true, data: item });
    await render();
    await act(async () => primary().click());
    expect(host.textContent).toContain('Assignment failed');
    expect(primary().textContent).toContain('wiederherstellen');
    await act(async () => primary().click());
    expect(plannerClient.updateWork).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'recover', recoveryId: 'recovery', expectedRevision: 'reviewed-task' }),
    );
  });
  it('closes the preview on a repository switch without creating a branch', async () => {
    await render();
    await render('/elsewhere');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(plannerClient.startWork).not.toHaveBeenCalled();
  });
});
