import { describe, expect, it, vi } from 'vitest';
import { loadPullRequests, parsePrOwnerRepoFromRemote, resolvePrOwnerRepo, submitPullRequest } from '../usePullRequests';

describe('usePullRequests helpers', () => {
  it('erkennt owner/repo aus HTTPS- und SSH-Remote', () => {
    expect(parsePrOwnerRepoFromRemote('https://github.com/octo/my-repo.git')).toEqual({ owner: 'octo', repo: 'my-repo' });
    expect(parsePrOwnerRepoFromRemote('git@github.com:openai/git-organizer.git')).toEqual({ owner: 'openai', repo: 'git-organizer' });
    expect(parsePrOwnerRepoFromRemote('https://github.com/openai/repo.name.with.dots.git')).toEqual({ owner: 'openai', repo: 'repo.name.with.dots' });
    expect(parsePrOwnerRepoFromRemote('ssh://git@github.company.local:2222/scm/platform/repo.service.git', 'github.company.local:2222')).toEqual({ owner: 'platform', repo: 'repo.service' });
    expect(parsePrOwnerRepoFromRemote('https://example.com/org/repo.git')).toBeNull();
  });

  it('laedt pull requests mit aktivem Filter', async () => {
    const githubGetPRs = vi.fn().mockResolvedValue({
      success: true,
      data: [{ number: 1, title: 'PR', state: 'open', user: 'u', createdAt: '', updatedAt: '', head: 'a', headSha: 'abc', base: 'b', merged: false, htmlUrl: '', draft: false }],
    });

    const prs = await loadPullRequests(
      { githubGetPRs } as any,
      { owner: 'octo', repo: 'my-repo' },
      true,
      'closed',
    );

    expect(githubGetPRs).toHaveBeenCalledWith('octo', 'my-repo', 'closed');
    expect(prs).toHaveLength(1);
  });

  it('signalisiert fehlgeschlagene refreshes ohne eine leere liste vorzutäuschen', async () => {
    const failedResult = await loadPullRequests(
      { githubGetPRs: vi.fn().mockResolvedValue({ success: false, error: 'temporary failure' }) } as any,
      { owner: 'octo', repo: 'my-repo' },
      true,
      'open',
    );
    const thrownResult = await loadPullRequests(
      { githubGetPRs: vi.fn().mockRejectedValue(new Error('offline')) } as any,
      { owner: 'octo', repo: 'my-repo' },
      true,
      'open',
    );

    expect(failedResult).toBeNull();
    expect(thrownResult).toBeNull();
  });

  it('erstellt pull request und nutzt fallback branch', async () => {
    const githubCreatePR = vi.fn().mockResolvedValue({
      success: true,
      data: { number: 42, title: 'x', htmlUrl: '', state: 'open' },
    });

    const result = await submitPullRequest(
      { githubCreatePR } as any,
      { owner: 'octo', repo: 'my-repo' },
      { title: ' Neuer PR ', body: ' Body ', head: '', base: '', currentBranch: 'feature/test' },
      'de',
    );

    expect(githubCreatePR).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'my-repo',
      title: 'Neuer PR',
      body: 'Body',
      head: 'feature/test',
      base: 'main',
    });
    expect(result).toEqual({ success: true, number: 42 });
  });

  it('liefert fehler beim fehlgeschlagenen create', async () => {
    const result = await submitPullRequest(
      { githubCreatePR: vi.fn().mockResolvedValue({ success: false, error: 'kaputt' }) } as any,
      { owner: 'octo', repo: 'my-repo' },
      { title: 'PR', body: '', head: 'h', base: 'b', currentBranch: 'x' },
      'de',
    );

    expect(result).toEqual({ success: false, error: 'kaputt' });
  });

  it('ermittelt owner/repo ueber git remote', async () => {
    const getRepoOriginUrl = vi.fn().mockResolvedValue({ success: true, data: 'https://github.com/octo/my-repo.git' });

    const resolved = await resolvePrOwnerRepo(
      { getRepoOriginUrl } as any,
      '/tmp/repo',
      true,
    );

    expect(getRepoOriginUrl).toHaveBeenCalledWith('/tmp/repo');
    expect(resolved).toEqual({ owner: 'octo', repo: 'my-repo' });
  });
});
