import { afterEach, describe, expect, it, vi } from 'vitest';
import { plannerClient } from '../plannerClient';
import { resourceKey, setActiveResourceRepository } from '@/data/clientCache';
import { queryClient } from '@/data/queryClient';

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

  it.each(['success', 'partial', 'failure', 'rejection'])('refreshes Git views in the task repository after checkout %s', async (outcome) => {
    const start = { repoPath: 'C:\\Code\\Repo\\', itemId: 'task', planId: 'plan', branchName: 'task/work', baseRef: 'refs/heads/main', acceptChanges: false };
    setActiveResourceRepository('C:/other');
    const keys = [
      resourceKey('git', 'runGitCommandForRepo', [start.repoPath, 'branch', '-a']),
      resourceKey('git', 'getCommitLogPage', [{ repoPath: start.repoPath }]),
      resourceKey('git', 'getWorkingTreeSnapshot', [start.repoPath]),
    ];
    const other = resourceKey('git', 'getCommitLogPage', [{ repoPath: 'C:/other' }]);
    for (const key of [...keys, other]) queryClient.setQueryData(key, { success: true, data: 'cached' });
    const result =
      outcome === 'failure'
        ? { success: false, error: 'Task setup failed' }
        : { success: true, data: { recoveryId: outcome === 'partial' ? 'recovery' : undefined } };
    const plannerStartWork = vi.fn().mockResolvedValue(result);
    if (outcome === 'rejection') plannerStartWork.mockRejectedValue(new Error('IPC interrupted'));
    vi.stubGlobal('window', { electronAPI: { planner: { plannerStartWork } } });
    if (outcome === 'rejection') await expect(plannerClient.startWork(start)).rejects.toThrow('IPC interrupted');
    else await expect(plannerClient.startWork(start)).resolves.toEqual(result);
    for (const key of keys) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(other)?.isInvalidated).toBe(false);
  });
});
