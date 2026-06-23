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
