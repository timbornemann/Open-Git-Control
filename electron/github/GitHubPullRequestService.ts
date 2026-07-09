import type { GitHubOctokitProvider, MergeMethod, PullRequestApi, PullRequestDto } from './types';

export class GitHubPullRequestService {
  constructor(private readonly getOctokit: GitHubOctokitProvider) {}

  async getPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open') {
    const octokit = this.getOctokit();
    const normalizedState = state === 'closed' || state === 'all' ? state : 'open';
    const allPullRequests: PullRequestApi[] = [];
    let page = 1;

    while (true) {
      const { data } = await octokit.rest.pulls.list({
        owner,
        repo,
        state: normalizedState,
        per_page: 100,
        page,
        sort: 'updated',
        direction: 'desc',
      });

      allPullRequests.push(...(data as PullRequestApi[]));
      if (data.length < 100) {
        break;
      }
      page += 1;
    }

    return allPullRequests.map((pr): PullRequestDto => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      user: pr.user?.login || '',
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      head: pr.head?.ref || '',
      headSha: pr.head?.sha || '',
      base: pr.base?.ref || '',
      merged: pr.merged_at !== null,
      htmlUrl: pr.html_url,
      draft: pr.draft || false,
    }));
  }

  async createPullRequest(owner: string, repo: string, title: string, body: string, head: string, base: string) {
    const octokit = this.getOctokit();
    const { data } = await octokit.rest.pulls.create({
      owner,
      repo,
      title,
      body,
      head,
      base,
    });

    return {
      number: data.number,
      title: data.title,
      htmlUrl: data.html_url,
      state: data.state,
    };
  }

  async mergePullRequest(owner: string, repo: string, pullNumber: number, mergeMethod: MergeMethod, commitTitle?: string, commitMessage?: string) {
    const octokit = this.getOctokit();
    const method: MergeMethod = mergeMethod === 'rebase' || mergeMethod === 'squash' ? mergeMethod : 'merge';
    const { data } = await octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
      merge_method: method,
      ...(commitTitle ? { commit_title: commitTitle } : {}),
      ...(commitMessage ? { commit_message: commitMessage } : {}),
    });

    return {
      sha: data.sha,
      merged: Boolean(data.merged),
      message: data.message || 'Merged',
    };
  }
}
