import type { GitHubOctokitProvider } from './types';

export const FEEDBACK_REPOSITORY_OWNER = 'timbornemann';
export const FEEDBACK_REPOSITORY_NAME = 'Open-Git-Control';

export class GitHubIssueService {
  constructor(private readonly getOctokit: GitHubOctokitProvider) {}

  async createFeedbackIssue(title: string, body: string, label: string): Promise<{ number: number; htmlUrl: string }> {
    const octokit = this.getOctokit();
    const { data } = await octokit.rest.issues.create({
      owner: FEEDBACK_REPOSITORY_OWNER,
      repo: FEEDBACK_REPOSITORY_NAME,
      title,
      body,
      labels: [label],
    });
    return { number: data.number, htmlUrl: data.html_url };
  }
}
