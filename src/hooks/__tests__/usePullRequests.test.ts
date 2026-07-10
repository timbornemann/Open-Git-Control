import { describe, expect, it, vi } from 'vitest';
import { loadPullRequests, parsePrOwnerRepoFromRemote, resolvePrOwnerRepo, submitPullRequest } from '@/hooks/usePullRequests';

describe('usePullRequests helpers', () => {
  it('erkennt owner/repo aus HTTPS- und SSH-Remote', () => {
    expect(parsePrOwnerRepoFromRemote('https://github.com/octo/my-repo.git')).toEqual({ owner: 'octo', repo: 'my-repo' });
    expect(parsePrOwnerRepoFromRemote('git@github.com:openai/git-organizer.git')).toEqual({ owner: 'openai', repo: 'git-organizer' });
    expect(parsePrOwnerRepoFromRemote('https://github.com/openai/repo.name.with.dots.git')).toEqual({ owner: 'openai', repo: 'repo.name.with.dots' });
    expect(parsePrOwnerRepoFromRemote('ssh://git@github.company.local:2222/scm/platform/repo.service.git', 'github.company.local:2222')).toEqual({
      owner: 'platform',
      repo: 'repo.service',
    });
    expect(parsePrOwnerRepoFromRemote('https://example.com/org/repo.git')).toBeNull();
  });

  it('laedt pull requests mit aktivem Filter', async () => {
    const getPullRequests = vi.fn().mockResolvedValue({
      success: true,
      data: [
        {
          number: 1,
          title: 'PR',
          state: 'open',
          user: 'u',
          createdAt: '',
          updatedAt: '',
          head: 'a',
          headSha: 'abc',
          base: 'b',
          merged: false,
          htmlUrl: '',
          draft: false,
        },
      ],
    });

    const prs = await loadPullRequests({ owner: 'octo', repo: 'my-repo' }, true, 'closed', { github: { isAvailable: () => true, getPullRequests } as any });

    expect(getPullRequests).toHaveBeenCalledWith('octo', 'my-repo', 'closed');
    expect(prs).toEqual({
      ok: true,
      data: [
        {
          number: 1,
          title: 'PR',
          state: 'open',
          user: 'u',
          createdAt: '',
          updatedAt: '',
          head: 'a',
          headSha: 'abc',
          base: 'b',
          merged: false,
          htmlUrl: '',
          draft: false,
        },
      ],
    });
  });

  it('signalisiert fehlgeschlagene refreshes ohne eine leere liste vorzutäuschen', async () => {
    const failedResult = await loadPullRequests({ owner: 'octo', repo: 'my-repo' }, true, 'open', {
      github: { isAvailable: () => true, getPullRequests: vi.fn().mockResolvedValue({ success: false, error: 'temporary failure' }) } as any,
    });
    const thrownResult = await loadPullRequests({ owner: 'octo', repo: 'my-repo' }, true, 'open', {
      github: { isAvailable: () => true, getPullRequests: vi.fn().mockRejectedValue(new Error('offline')) } as any,
    });

    expect(failedResult).toEqual({ ok: false, error: 'temporary failure' });
    expect(thrownResult).toEqual({ ok: false, error: 'offline' });
  });

  it('erstellt pull request gegen upstream bei fork', async () => {
    const createPullRequest = vi.fn().mockResolvedValue({
      success: true,
      data: { number: 7, title: 'x', htmlUrl: '', state: 'open' },
    });
    const getRepository = vi.fn().mockResolvedValue({
      success: true,
      data: {
        owner: 'me',
        repo: 'my-fork',
        fork: true,
        parent: { owner: 'octo', repo: 'upstream' },
      },
    });

    const result = await submitPullRequest(
      { owner: 'me', repo: 'my-fork' },
      { title: 'PR', body: '', head: 'feature', base: 'main', currentBranch: 'feature' },
      'de',
      { github: { isAvailable: () => true, createPullRequest, getRepository } as any },
    );

    expect(getRepository).toHaveBeenCalledWith('me', 'my-fork');
    expect(createPullRequest).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'upstream',
      title: 'PR',
      body: '',
      head: 'me:feature',
      base: 'main',
    });
    expect(result).toEqual({ success: true, number: 7 });
  });

  it('erstellt pull request und nutzt fallback branch', async () => {
    const createPullRequest = vi.fn().mockResolvedValue({
      success: true,
      data: { number: 42, title: 'x', htmlUrl: '', state: 'open' },
    });

    const result = await submitPullRequest(
      { owner: 'octo', repo: 'my-repo' },
      { title: ' Neuer PR ', body: ' Body ', head: '', base: '', currentBranch: 'feature/test' },
      'de',
      { github: { isAvailable: () => true, createPullRequest } as any },
    );

    expect(createPullRequest).toHaveBeenCalledWith({
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
    const result = await submitPullRequest({ owner: 'octo', repo: 'my-repo' }, { title: 'PR', body: '', head: 'h', base: 'b', currentBranch: 'x' }, 'de', {
      github: { isAvailable: () => true, createPullRequest: vi.fn().mockResolvedValue({ success: false, error: 'kaputt' }) } as any,
    });

    expect(result).toEqual({ success: false, error: 'kaputt' });
  });

  it('ermittelt owner/repo ueber git remote', async () => {
    const getRepoOriginUrl = vi.fn().mockResolvedValue({ success: true, data: 'https://github.com/octo/my-repo.git' });

    const resolved = await resolvePrOwnerRepo('/tmp/repo', true, 'github.com', { git: { isAvailable: () => true, getRepoOriginUrl } });

    expect(getRepoOriginUrl).toHaveBeenCalledWith('/tmp/repo');
    expect(resolved).toEqual({ owner: 'octo', repo: 'my-repo' });
  });
});
