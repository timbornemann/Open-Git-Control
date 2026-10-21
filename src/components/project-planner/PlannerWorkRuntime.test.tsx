// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/data/queryClient';
import { plannerClient } from '@/services/plannerClient';
import { PlannerWorkRuntime } from './PlannerWorkRuntime';
import { usePlannerWorkDialogState } from './plannerWorkDialogState';
const state = vi.hoisted(() => ({ data: { projects: [{ id: 'project', repoPath: '/repo' }], items: [] as any[] } }));
vi.mock('@/contexts/ProjectPlannerContext', () => ({ useProjectPlanner: () => state }));
vi.mock('./PlannerWorkDialog', () => ({ PlannerWorkDialog: () => null }));
vi.mock('@/services/plannerClient', () => ({ plannerClient: { getWork: vi.fn(), refreshWork: vi.fn() } }));
const item = {
  id: 'task',
  projectId: 'project',
  title: 'Work',
  references: { activeWorkflowId: 'workflow', branches: [{ id: 'workflow', projectId: 'project', name: 'task/work' }], pullRequests: [] },
};
describe('planner work detection triggers', () => {
  let host: HTMLDivElement;
  let root: Root;
  const render = async (activeRepo = '/repo') =>
    act(async () => root.render(createElement(PlannerWorkRuntime, { activeRepo, refreshSignal: 1, onChanged: vi.fn() })));
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    state.data.items = [item];
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.mocked(plannerClient.getWork).mockResolvedValue({ success: true, data: { itemId: 'inventory', commits: [], requests: [], recoveries: [] } });
    vi.mocked(plannerClient.refreshWork).mockResolvedValue({ success: true, data: { itemId: 'task', commits: [], requests: [] } });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    usePlannerWorkDialogState.setState({ target: null });
    queryClient.clear();
    vi.useRealTimers();
  });
  it('refreshes at repository open and existing Git updates, without its own polling interval', async () => {
    await render();
    await act(async () => vi.advanceTimersByTimeAsync(150));
    expect(plannerClient.refreshWork).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(plannerClient.refreshWork).toHaveBeenCalledTimes(1);
    queryClient.setQueryData(['resource', 'git', '/repo', 'getRepositoryChangeSummary'], { success: true, data: {} });
    await act(async () => vi.advanceTimersByTimeAsync(150));
    expect(plannerClient.refreshWork).toHaveBeenCalledTimes(2);
  });
  it('abandons queued inspection when the repository changes', async () => {
    await render();
    await render('/other');
    await act(async () => vi.advanceTimersByTimeAsync(150));
    expect(plannerClient.refreshWork).not.toHaveBeenCalled();
  });
  it('bundles overlapping repository updates while an inspection is still running', async () => {
    let finish!: (result: Awaited<ReturnType<typeof plannerClient.refreshWork>>) => void;
    vi.mocked(plannerClient.refreshWork).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await render();
    await act(async () => vi.advanceTimersByTimeAsync(150));
    queryClient.setQueryData(['resource', 'git', '/repo', 'getWorkingTreeSnapshot'], { success: true, data: {} });
    await act(async () => vi.advanceTimersByTimeAsync(150));
    expect(plannerClient.refreshWork).toHaveBeenCalledTimes(1);
    await act(async () => finish({ success: true, data: { itemId: 'task', commits: [], requests: [] } }));
    expect(plannerClient.refreshWork).toHaveBeenCalledTimes(2);
  });
  it('offers local recovery after restart when the task is absent on the checked-out branch', async () => {
    state.data.items = [];
    vi.mocked(plannerClient.getWork).mockResolvedValue({
      success: true,
      data: { itemId: 'inventory', commits: [], requests: [], recoveries: [{ recoveryId: 'journal', item: item as any }] },
    });
    await render();
    expect(usePlannerWorkDialogState.getState().target).toEqual({ repoPath: '/repo', item });
    expect(plannerClient.getWork).toHaveBeenCalledWith(expect.objectContaining({ listRecoveries: true }));
    expect(plannerClient.refreshWork).not.toHaveBeenCalled();
  });
});
