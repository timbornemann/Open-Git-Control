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
