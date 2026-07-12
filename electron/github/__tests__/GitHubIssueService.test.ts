import { describe, expect, it, vi } from 'vitest';
import { GitHubIssueService } from '../GitHubIssueService';

describe('GitHubIssueService', () => {
  it('always creates feedback issues in the Open-Git-Control repository', async () => {
    const create = vi.fn().mockResolvedValue({ data: { number: 42, html_url: 'https://github.com/timbornemann/Open-Git-Control/issues/42' } });
    const service = new GitHubIssueService(() => ({ rest: { issues: { create } } }) as any);

    await expect(service.createFeedbackIssue('[Bug]: Broken', 'body', 'bug')).resolves.toEqual({
      number: 42,
      htmlUrl: 'https://github.com/timbornemann/Open-Git-Control/issues/42',
    });
    expect(create).toHaveBeenCalledWith({
      owner: 'timbornemann',
      repo: 'Open-Git-Control',
      title: '[Bug]: Broken',
      body: 'body',
      labels: ['bug'],
    });
  });
});
