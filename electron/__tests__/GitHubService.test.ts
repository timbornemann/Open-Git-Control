import { describe, expect, it, vi } from 'vitest';
import { GitHubService } from '../GitHubService';

const repo = (id: number, name: string, description: string | null = null) => ({
  id,
  name,
  full_name: `octo/${name}`,
  private: false,
  clone_url: `https://github.com/octo/${name}.git`,
  html_url: `https://github.com/octo/${name}`,
  description,
  updated_at: '2026-01-01T00:00:00Z',
});

const pullRequest = (number: number) => ({
  number,
  title: `PR ${number}`,
  state: 'open',
  user: { login: 'octocat' },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  head: { ref: `feature-${number}`, sha: `sha-${number}` },
  base: { ref: 'main' },
  merged_at: null,
  html_url: `https://github.com/octo/repo/pull/${number}`,
  draft: false,
});

describe('GitHubService pagination', () => {
  it('searches authenticated repositories beyond the currently requested source page', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => repo(index + 1, `repo-${index + 1}`));
    const listForAuthenticatedUser = vi.fn()
      .mockResolvedValueOnce({ data: firstPage })
      .mockResolvedValueOnce({ data: [repo(101, 'target-repo', 'needle')] });
    const service = new GitHubService();
    (service as any).octokit = {
      rest: {
        repos: { listForAuthenticatedUser },
      },
    };

    const result = await service.getMyRepositories(1, 10, 'needle');

    expect(result.repos).toHaveLength(1);
    expect(result.repos[0].fullName).toBe('octo/target-repo');
    expect(listForAuthenticatedUser).toHaveBeenCalledTimes(2);
    expect(listForAuthenticatedUser).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 2,
      per_page: 100,
    }));
  });

  it('loads pull requests across all result pages', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => pullRequest(index + 1));
    const secondPage = [pullRequest(101), pullRequest(102)];
    const list = vi.fn()
      .mockResolvedValueOnce({ data: firstPage })
      .mockResolvedValueOnce({ data: secondPage });
    const service = new GitHubService();
    (service as any).octokit = {
      rest: {
        pulls: { list },
      },
    };

    const prs = await service.getPullRequests('octo', 'repo', 'open');

    expect(prs).toHaveLength(102);
    expect(prs[101]).toMatchObject({ number: 102, headSha: 'sha-102' });
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenNthCalledWith(1, expect.objectContaining({ page: 1, per_page: 100 }));
    expect(list).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2, per_page: 100 }));
  });
});

describe('GitHubService workflow runs', () => {
  it('uses head_sha instead of branch filtering for PR-specific workflow lookups', async () => {
    const listWorkflowRunsForRepo = vi.fn().mockResolvedValue({
      data: {
        workflow_runs: [
          {
            id: 1,
            name: 'CI',
            display_title: 'CI',
            status: 'completed',
            conclusion: 'success',
            event: 'pull_request',
            html_url: 'https://github.com/octo/repo/actions/runs/1',
            head_branch: 'feature',
            head_sha: 'abc1234',
            created_at: '2026-01-01T00:00:00Z',
            run_started_at: '2026-01-01T00:00:01Z',
            updated_at: '2026-01-01T00:01:00Z',
          },
          {
            id: 2,
            name: 'Other',
            status: 'completed',
            conclusion: 'failure',
            event: 'push',
            html_url: 'https://github.com/octo/repo/actions/runs/2',
            head_branch: 'feature',
            head_sha: 'def5678',
            created_at: '2026-01-01T00:00:00Z',
            run_started_at: '2026-01-01T00:00:01Z',
            updated_at: '2026-01-01T00:01:00Z',
          },
        ],
      },
    });
    const service = new GitHubService();
    (service as any).octokit = {
      rest: {
        actions: { listWorkflowRunsForRepo },
      },
    };

    const runs = await service.getWorkflowRuns('octo', 'repo', {
      branch: 'feature',
      headSha: 'abc1234',
      perPage: 50,
    });

    expect(listWorkflowRunsForRepo).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'octo',
      repo: 'repo',
      head_sha: 'abc1234',
      per_page: 50,
    }));
    expect(listWorkflowRunsForRepo.mock.calls[0][0]).not.toHaveProperty('branch');
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: 1, headSha: 'abc1234' });
  });
});
