import { JSDOM } from 'jsdom';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { githubClient } from '@/services/githubClient';
import {
  computeCiBadge,
  loadPullRequestCi,
  loadPullRequests,
  parsePrOwnerRepoFromRemote,
  resolvePrOwnerRepo,
  retainCiForCurrentHeads,
  submitPullRequest,
  usePullRequests,
} from '@/hooks/usePullRequests';

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

  it('uses the upstream repository consistently for fork PR listing and actions', async () => {
    const getRepoOriginUrl = vi.fn().mockResolvedValue({ success: true, data: 'https://github.com/me/my-fork.git' });
    const getRepository = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        data: { owner: 'me', repo: 'my-fork', fork: true, parent: { owner: 'octo', repo: 'upstream' }, defaultBranch: 'main' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { owner: 'octo', repo: 'upstream', fork: false, parent: null, defaultBranch: 'develop' },
      });

    const resolved = await resolvePrOwnerRepo('/tmp/repo', true, 'github.com', {
      git: { isAvailable: () => true, getRepoOriginUrl },
      github: { isAvailable: () => true, getRepository } as any,
    });

    expect(resolved).toEqual({
      owner: 'octo',
      repo: 'upstream',
      headOwner: 'me',
      headRepo: 'my-fork',
      defaultBranch: 'develop',
    });
  });

  it('uses the repository default branch when the PR base is blank', async () => {
    const createPullRequest = vi.fn().mockResolvedValue({ success: true, data: { number: 9 } });
    const getRepository = vi.fn().mockResolvedValue({
      success: true,
      data: { owner: 'octo', repo: 'repo', fork: false, parent: null, defaultBranch: 'develop' },
    });

    await submitPullRequest({ owner: 'octo', repo: 'repo' }, { title: 'PR', body: '', head: 'feature', base: '', currentBranch: 'feature' }, 'en', {
      github: { isAvailable: () => true, createPullRequest, getRepository } as any,
    });

    expect(createPullRequest).toHaveBeenCalledWith(expect.objectContaining({ base: 'develop' }));
  });

  it('treats a failed GitHub check run as CI failure even when workflows passed', () => {
    expect(
      computeCiBadge([{ status: 'completed', conclusion: 'success' } as any], {
        state: 'success',
        sha: 'abc',
        checkRuns: [{ status: 'completed', conclusion: 'failure' } as any],
        statusContexts: [],
      }),
    ).toBe('failure');
  });

  it('drops cached CI when a pull request head SHA changes', () => {
    const cached = { headSha: 'old', badge: 'success' } as any;
    expect(retainCiForCurrentHeads({ 7: cached }, [{ number: 7, headSha: 'new' } as any])).toEqual({});
    expect(retainCiForCurrentHeads({ 7: cached }, [{ number: 7, headSha: 'old' } as any])).toEqual({ 7: cached });
  });

  it('does not fall back to the fork repository when fork metadata cannot be loaded', async () => {
    const resolved = await resolvePrOwnerRepo('/tmp/repo', true, 'github.com', {
      git: {
        isAvailable: () => true,
        getRepoOriginUrl: vi.fn().mockResolvedValue({ success: true, data: 'https://github.com/me/fork.git' }),
      },
      github: {
        isAvailable: () => true,
        getRepository: vi.fn().mockResolvedValue({ success: false, error: 'rate limited' }),
      } as any,
    });

    expect(resolved).toBeNull();
  });

  it('reports unknown instead of green when one CI data source fails', async () => {
    const ci = await loadPullRequestCi(
      { owner: 'octo', repo: 'repo' },
      { number: 7, headSha: 'abc', state: 'open' } as any,
      {
        github: {
          isAvailable: () => true,
          getWorkflowRuns: vi.fn().mockResolvedValue({ success: true, data: [{ status: 'completed', conclusion: 'success' }] }),
          getStatusChecks: vi.fn().mockResolvedValue({ success: false, error: 'checks unavailable' }),
        } as any,
      },
      'en',
    );

    expect(ci).toMatchObject({ headSha: 'abc', badge: 'unknown' });
    expect(ci?.summary).toContain('incomplete');
  });
});

describe('usePullRequests refresh lifecycle', () => {
  it('does not restart a request when the parent supplies a new onError callback after each render', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'getRepoOriginUrl').mockResolvedValue({ success: true, data: 'https://github.com/octo/repo.git' });
    vi.spyOn(githubClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(githubClient, 'getRepository').mockResolvedValue({
      success: true,
      data: { owner: 'octo', repo: 'repo', fork: false, parent: null, defaultBranch: 'main' },
    });

    let resolvePullRequests: ((value: { success: boolean; data: [] }) => void) | undefined;
    const getPullRequests = vi.spyOn(githubClient, 'getPullRequests').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePullRequests = resolve;
        }),
    );

    let domain: ReturnType<typeof usePullRequests> | null = null;
    let rerender: (() => void) | null = null;
    let refresh: (() => void) | null = null;
    const root: Root = createRoot(document.createElement('div'));
    const Harness = () => {
      const [, setRenderVersion] = useState(0);
      const [refreshTrigger, setRefreshTrigger] = useState(0);
      rerender = () => setRenderVersion((version) => version + 1);
      refresh = () => setRefreshTrigger((trigger) => trigger + 1);
      domain = usePullRequests({
        activeRepo: '/repo',
        isAuthenticated: true,
        refreshTrigger,
        language: 'en',
        onError: () => undefined,
      });
      return null;
    };

    act(() => {
      root.render(createElement(Harness));
    });
    await vi.waitFor(() => expect(getPullRequests).toHaveBeenCalledTimes(1));
    await flush();

    expect(getPullRequests).toHaveBeenCalledTimes(1);

    resolvePullRequests?.({ success: true, data: [] });
    await flush();

    expect(domain?.prLoading).toBe(false);
    expect(domain?.prHasLoaded).toBe(true);
    expect(domain?.pullRequests).toEqual([]);

    act(() => {
      rerender?.();
    });
    await flush();

    expect(getPullRequests).toHaveBeenCalledTimes(1);

    act(() => {
      refresh?.();
    });
    await vi.waitFor(() => expect(getPullRequests).toHaveBeenCalledTimes(2));

    expect(domain?.prLoading).toBe(true);
    expect(domain?.prHasLoaded).toBe(true);

    resolvePullRequests?.({ success: true, data: [] });
    await flush();
    act(() => root.unmount());
  });

  it('does not create a PR after the main process has switched away from the captured repository', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'getRepoOriginUrl')
      .mockResolvedValueOnce({ success: true, data: 'https://github.com/octo/repo.git' })
      .mockResolvedValueOnce({ success: false, error: 'Requested repository is not the active repository.' });
    vi.spyOn(githubClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(githubClient, 'getRepository').mockResolvedValue({
      success: true,
      data: { owner: 'octo', repo: 'repo', fork: false, parent: null, defaultBranch: 'main' },
    });
    vi.spyOn(githubClient, 'getPullRequests').mockResolvedValue({ success: true, data: [] });
    const createPullRequest = vi.spyOn(githubClient, 'createPullRequest').mockResolvedValue({ success: true, data: { number: 9 } as any });
    const onError = vi.fn();
    let domain: ReturnType<typeof usePullRequests> | null = null;
    const root: Root = createRoot(document.createElement('div'));
    const Harness = () => {
      domain = usePullRequests({ activeRepo: '/repo', isAuthenticated: true, refreshTrigger: 0, language: 'en', onError });
      return null;
    };

    act(() => root.render(createElement(Harness)));
    await vi.waitFor(() => expect(domain?.prOwnerRepo).toMatchObject({ owner: 'octo', repo: 'repo' }));
    let created = true;
    await act(async () => {
      created = await domain!.createPR({ title: 'PR', body: '', head: 'feature', base: 'main', currentBranch: 'feature' });
    });

    expect(created).toBe(false);
    expect(createPullRequest).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Requested repository is not the active repository.');
    act(() => root.unmount());
  });
});
