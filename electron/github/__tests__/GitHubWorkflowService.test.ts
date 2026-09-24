import { describe, expect, it, vi } from 'vitest';
import { GitHubWorkflowService } from '../GitHubWorkflowService';

const checkRun = (id: number, conclusion: string = 'success') => ({
  id,
  name: `check-${id}`,
  status: 'completed',
  conclusion,
  details_url: null,
  html_url: null,
  app: null,
  started_at: null,
  completed_at: null,
});

const statusContext = (id: number, state: string = 'success') => ({
  id,
  context: `status-${id}`,
  state,
  description: null,
  target_url: null,
  created_at: null,
  updated_at: null,
});

describe('GitHubWorkflowService.getStatusChecks', () => {
  it('loads every page so a failure after the first 100 checks cannot be hidden', async () => {
    const listForRef = vi.fn().mockImplementation(({ page = 1 }: { page?: number }) =>
      Promise.resolve({
        data: {
          total_count: 101,
          check_runs: page === 1 ? Array.from({ length: 100 }, (_, index) => checkRun(index + 1)) : [checkRun(101, 'failure')],
        },
      }),
    );
    const getCombinedStatusForRef = vi.fn().mockResolvedValue({
      data: { total_count: 1, state: 'success', sha: 'abc', statuses: [statusContext(1)] },
    });
    const service = new GitHubWorkflowService(() => ({ rest: { checks: { listForRef }, repos: { getCombinedStatusForRef } } }) as any);

    const result = await service.getStatusChecks('owner', 'repo', 'abc');

    expect(listForRef).toHaveBeenCalledTimes(2);
    expect(listForRef).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2, per_page: 100 }));
    expect(result.checkRuns).toHaveLength(101);
    expect(result.checkRuns.at(-1)?.conclusion).toBe('failure');
  });

  it('loads paginated legacy status contexts as well', async () => {
    const listForRef = vi.fn().mockResolvedValue({ data: { total_count: 0, check_runs: [] } });
    const getCombinedStatusForRef = vi.fn().mockImplementation(({ page = 1 }: { page?: number }) =>
      Promise.resolve({
        data: {
          total_count: 101,
          state: 'failure',
          sha: 'def',
          statuses: page === 1 ? Array.from({ length: 100 }, (_, index) => statusContext(index + 1)) : [statusContext(101, 'failure')],
        },
      }),
    );
    const service = new GitHubWorkflowService(() => ({ rest: { checks: { listForRef }, repos: { getCombinedStatusForRef } } }) as any);

    const result = await service.getStatusChecks('owner', 'repo', 'def');

    expect(getCombinedStatusForRef).toHaveBeenCalledTimes(2);
    expect(result.statusContexts).toHaveLength(101);
    expect(result.statusContexts.at(-1)?.state).toBe('failure');
  });

  it('rejects duplicate/truncated pages instead of reporting a false green state', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => checkRun(index + 1));
    const listForRef = vi
      .fn()
      .mockImplementation(({ page = 1 }: { page?: number }) =>
        Promise.resolve({ data: { total_count: 101, check_runs: page === 1 ? firstPage : [firstPage[0]] } }),
      );
    const getCombinedStatusForRef = vi.fn().mockResolvedValue({
      data: { total_count: 0, state: 'success', sha: 'abc', statuses: [] },
    });
    const service = new GitHubWorkflowService(() => ({ rest: { checks: { listForRef }, repos: { getCombinedStatusForRef } } }) as any);

    await expect(service.getStatusChecks('owner', 'repo', 'abc')).rejects.toThrow('incomplete');
  });
});

describe('GitHubWorkflowService Actions pages and controls', () => {
  it('loads all-branch runs by default and forwards branch, status and page filters', async () => {
    const listWorkflowRunsForRepo = vi.fn().mockResolvedValue({
      data: {
        total_count: 25,
        workflow_runs: [
          {
            id: 1,
            name: 'CI',
            display_title: 'CI',
            status: 'completed',
            conclusion: 'failure',
            event: 'push',
            html_url: 'https://github.com/alice/demo/actions/runs/1',
            head_branch: 'main',
            head_sha: 'abc',
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
          },
        ],
      },
    });
    const service = new GitHubWorkflowService(() => ({ rest: { actions: { listWorkflowRunsForRepo } } }) as any);

    const first = await service.getWorkflowRunsPage('alice', 'demo', { page: 1, perPage: 20 });
    const second = await service.getWorkflowRunsPage('alice', 'demo', { branch: 'feature', status: 'failure', page: 2, perPage: 20 });

    expect(first.hasMore).toBe(true);
    expect(second.hasMore).toBe(false);
    expect(listWorkflowRunsForRepo).toHaveBeenNthCalledWith(1, expect.not.objectContaining({ branch: expect.anything() }));
    expect(listWorkflowRunsForRepo).toHaveBeenNthCalledWith(2, expect.objectContaining({ branch: 'feature', status: 'failure', page: 2 }));
  });

  it('returns job steps and sends run control actions to GitHub', async () => {
    const listJobsForWorkflowRun = vi
      .fn()
      .mockResolvedValue({
        data: {
          total_count: 1,
          jobs: [
            {
              id: 7,
              name: 'build',
              status: 'completed',
              conclusion: 'failure',
              html_url: 'https://github.com/job/7',
              steps: [{ number: 1, name: 'npm test', status: 'completed', conclusion: 'failure' }],
            },
          ],
        },
      });
    const reRunWorkflowFailedJobs = vi.fn().mockResolvedValue({});
    const cancelWorkflowRun = vi.fn().mockResolvedValue({});
    const service = new GitHubWorkflowService(() => ({ rest: { actions: { listJobsForWorkflowRun, reRunWorkflowFailedJobs, cancelWorkflowRun } } }) as any);

    const jobs = await service.getWorkflowJobsPage('alice', 'demo', 5);
    await service.rerunFailedJobs('alice', 'demo', 5);
    await service.cancelWorkflowRun('alice', 'demo', 5);

    expect(jobs.jobs[0].steps[0].name).toBe('npm test');
    expect(reRunWorkflowFailedJobs).toHaveBeenCalledWith({ owner: 'alice', repo: 'demo', run_id: 5 });
    expect(cancelWorkflowRun).toHaveBeenCalledWith({ owner: 'alice', repo: 'demo', run_id: 5 });
  });
});
