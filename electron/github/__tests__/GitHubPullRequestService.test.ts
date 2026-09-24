import { describe, expect, it, vi } from 'vitest';
import { GitHubPullRequestService } from '../GitHubPullRequestService';

describe('GitHubPullRequestService merge', () => {
  it('submits the expected head SHA so GitHub rejects a changed PR head', async () => {
    const merge = vi.fn().mockResolvedValue({ data: { sha: 'merge-sha', merged: true, message: 'Merged' } });
    const service = new GitHubPullRequestService(() => ({ rest: { pulls: { merge } } }) as any);

    await service.mergePullRequest('alice', 'demo', 12, 'squash', undefined, undefined, 'expected-head');

    expect(merge).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'alice', repo: 'demo', pull_number: 12, merge_method: 'squash', sha: 'expected-head' }),
    );
  });
});
