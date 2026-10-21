import { afterEach, describe, expect, it, vi } from 'vitest';
import { plannerClient } from '../plannerClient';

afterEach(() => vi.unstubAllGlobals());
describe('planner work client', () => {
  it('delegates typed previews, fresh local reads and explicit writes to the planner namespace', async () => {
    const planner = {
      plannerInspectWork: vi.fn(),
      plannerStartWork: vi.fn(),
      plannerGetWork: vi.fn(),
      plannerRefreshWork: vi.fn(),
      plannerUpdateWork: vi.fn(),
    };
    Object.values(planner).forEach((method) => method.mockResolvedValue({ success: true, data: {} }));
    vi.stubGlobal('window', { electronAPI: { planner } });
    const request = { repoPath: 'C:/repo', itemId: 'task' };
    const start = { ...request, planId: 'plan', branchName: 'task/work', baseRef: 'refs/heads/main', acceptChanges: false };
    const update = { ...request, action: 'automation' as const, paused: true, expectedRevision: 'revision' };
    await plannerClient.inspectWork(request);
    await plannerClient.startWork(start);
    await plannerClient.getWork(request);
    await plannerClient.getWork(request);
    await plannerClient.refreshWork(request);
    await plannerClient.updateWork(update);
    expect(planner.plannerInspectWork).toHaveBeenCalledExactlyOnceWith(request);
    expect(planner.plannerStartWork).toHaveBeenCalledExactlyOnceWith(start);
    expect(planner.plannerGetWork).toHaveBeenCalledTimes(2);
    expect(planner.plannerRefreshWork).toHaveBeenCalledExactlyOnceWith(request);
    expect(planner.plannerUpdateWork).toHaveBeenCalledExactlyOnceWith(update);
  });
});
