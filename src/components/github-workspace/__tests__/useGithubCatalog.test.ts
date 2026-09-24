import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { githubClient } from '@/services/githubClient';
import type { GitHubRepositoryDto } from '@/types/githubDtos';
import { useGithubCatalog } from '../useGithubCatalog';

type Catalog = ReturnType<typeof useGithubCatalog>;
const repo = (id: number): GitHubRepositoryDto => ({
  id,
  name: `repo-${id}`,
  fullName: `alice/repo-${id}`,
  private: false,
  cloneUrl: `https://github.com/alice/repo-${id}.git`,
  htmlUrl: `https://github.com/alice/repo-${id}`,
});

let root: Root;
let current: Catalog | null;
beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://app.local' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement('div'));
  current = null;
  vi.spyOn(githubClient, 'isAvailable').mockReturnValue(true);
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const render = () => {
  const Harness = () => {
    current = useGithubCatalog(true, 'alice');
    return null;
  };
  act(() => root.render(createElement(Harness)));
};

describe('useGithubCatalog', () => {
  it('loads the complete catalog before saving an offline snapshot', async () => {
    const getRepositories = vi.spyOn(githubClient, 'getRepositories').mockImplementation(async ({ page }) => ({
      success: true,
      data:
        page === 1
          ? { repos: Array.from({ length: 100 }, (_, index) => repo(index + 1)), nextPage: 2, hasMore: true, totalCount: null }
          : { repos: [repo(101)], nextPage: null, hasMore: false, totalCount: null },
    }));
    const save = vi.spyOn(githubClient, 'saveCatalogSnapshot').mockResolvedValue({ success: true, data: { savedAt: '2026-01-01T00:00:00Z' } });
    render();

    await vi.waitFor(() => expect(current?.repos).toHaveLength(101));
    expect(getRepositories).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 101 })]));
    expect(current?.offline).toBe(false);
  });

  it('falls back to the last complete dated snapshot after a page fails', async () => {
    vi.spyOn(githubClient, 'getRepositories').mockResolvedValue({ success: false, error: 'rate limit' });
    vi.spyOn(githubClient, 'getCatalogSnapshot').mockResolvedValue({
      success: true,
      data: {
        host: 'github.com',
        username: 'alice',
        savedAt: '2026-01-01T00:00:00Z',
        repos: [repo(8)],
      },
    });
    render();

    await vi.waitFor(() => expect(current?.repos.map((item) => item.id)).toEqual([8]));
    expect(current?.offline).toBe(true);
    expect(current?.savedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('hides the previous account catalog while the new account loads', async () => {
    type RepositoriesResult = Awaited<ReturnType<typeof githubClient.getRepositories>>;
    let resolveSecond: ((result: RepositoriesResult) => void) | undefined;
    const second = new Promise<RepositoriesResult>((resolve) => {
      resolveSecond = resolve;
    });
    vi.spyOn(githubClient, 'getRepositories')
      .mockResolvedValueOnce({ success: true, data: { repos: [repo(1)], nextPage: null, hasMore: false, totalCount: null } })
      .mockImplementationOnce(() => second);
    vi.spyOn(githubClient, 'saveCatalogSnapshot').mockResolvedValue({ success: true, data: { savedAt: '2026-01-01T00:00:00Z' } });
    const Harness = ({ username }: { username: string }) => {
      current = useGithubCatalog(true, username);
      return null;
    };
    act(() => root.render(createElement(Harness, { username: 'alice' })));
    await vi.waitFor(() => expect(current?.repos.map((item) => item.id)).toEqual([1]));

    act(() => root.render(createElement(Harness, { username: 'bob' })));
    expect(current?.repos).toEqual([]);

    resolveSecond?.({ success: true, data: { repos: [repo(2)], nextPage: null, hasMore: false, totalCount: null } });
    await vi.waitFor(() => expect(current?.repos.map((item) => item.id)).toEqual([2]));
    expect(current?.account?.username).toBe('bob');
  });
});
