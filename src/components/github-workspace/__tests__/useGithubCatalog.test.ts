import { queryClient } from '@/data/queryClient';
import { catalogKey } from '@/data/githubCatalog';
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
  vi.spyOn(githubClient, 'getCatalogSnapshot').mockResolvedValue({ success: true, data: null });
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
  it('renders prepared data synchronously on every remount while IPC is delayed', async () => {
    queryClient.setQueryData(catalogKey('github.com/alice'), { host: 'github.com', username: 'alice', savedAt: new Date().toISOString(), repos: [repo(7)] });
    const ipc = vi.mocked(githubClient.getCatalogSnapshot).mockImplementation(() => new Promise(() => {}));
    const read = vi.spyOn(githubClient, 'getRepositories').mockImplementation(() => new Promise(() => {}));
    for (let count = 0; count < 4; count++) {
      act(() => root.render(null));
      render();
      expect(current?.repos.map((item) => item.id)).toEqual([7]);
      expect(current?.hasData).toBe(true);
      expect(current?.loading).toBe(false);
    }
    await act(async () => {
      await Promise.resolve();
    });
    expect(ipc).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('recognizes a prepared empty catalog as loaded on its first render', () => {
    queryClient.setQueryData(catalogKey('github.com/alice'), { host: 'github.com', username: 'alice', savedAt: new Date().toISOString(), repos: [] });
    render();
    expect(current?.hasData).toBe(true);
    expect(current?.loading).toBe(false);
    expect(current?.repos).toEqual([]);
  });

  it('shows a recent snapshot without fetching every repository again', async () => {
    const getRepositories = vi.spyOn(githubClient, 'getRepositories').mockResolvedValue({
      success: true,
      data: { repos: [repo(9)], nextPage: null, hasMore: false, totalCount: null },
    });
    vi.mocked(githubClient.getCatalogSnapshot).mockResolvedValue({
      success: true,
      data: { host: 'github.com', username: 'alice', savedAt: new Date().toISOString(), repos: [repo(8)] },
    });
    vi.spyOn(githubClient, 'saveCatalogSnapshot').mockResolvedValue({ success: true, data: { savedAt: new Date().toISOString() } });
    render();

    await vi.waitFor(() => expect(current?.repos.map((item) => item.id)).toEqual([8]));
    expect(current?.loading).toBe(false);
    expect(current?.offline).toBe(false);
    expect(getRepositories).not.toHaveBeenCalled();

    await act(async () => {
      await current?.refresh();
    });
    expect(current?.repos.map((item) => item.id)).toEqual([9]);
    expect(getRepositories).toHaveBeenCalledOnce();
  });

  it('keeps a stale snapshot visible until the complete background refresh finishes', async () => {
    type RepositoriesResult = Awaited<ReturnType<typeof githubClient.getRepositories>>;
    let resolveSecond: ((result: RepositoriesResult) => void) | undefined;
    const second = new Promise<RepositoriesResult>((resolve) => {
      resolveSecond = resolve;
    });
    vi.mocked(githubClient.getCatalogSnapshot).mockResolvedValue({
      success: true,
      data: { host: 'github.com', username: 'alice', savedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), repos: [repo(8)] },
    });
    const getRepositories = vi
      .spyOn(githubClient, 'getRepositories')
      .mockImplementation(({ page }) =>
        page === 1 ? Promise.resolve({ success: true, data: { repos: [repo(1)], nextPage: 2, hasMore: true, totalCount: null } }) : second,
      );
    vi.spyOn(githubClient, 'saveCatalogSnapshot').mockResolvedValue({ success: true, data: { savedAt: new Date().toISOString() } });
    render();

    await vi.waitFor(() => expect(getRepositories).toHaveBeenCalledTimes(2));
    expect(current?.repos.map((item) => item.id)).toEqual([8]);
    expect(current?.loading).toBe(true);

    resolveSecond?.({ success: true, data: { repos: [repo(2)], nextPage: null, hasMore: false, totalCount: null } });
    await vi.waitFor(() => expect(current?.repos.map((item) => item.id)).toEqual([1, 2]));
    expect(current?.loading).toBe(false);
  });

  it('refreshes a recent snapshot when private repositories were not persisted', async () => {
    vi.mocked(githubClient.getCatalogSnapshot).mockResolvedValue({
      success: true,
      data: { host: 'github.com', username: 'alice', savedAt: new Date().toISOString(), repos: [repo(8)], refreshRequired: true },
    });
    const getRepositories = vi.spyOn(githubClient, 'getRepositories').mockResolvedValue({
      success: true,
      data: { repos: [repo(8), { ...repo(9), private: true }], nextPage: null, hasMore: false, totalCount: null },
    });
    vi.spyOn(githubClient, 'saveCatalogSnapshot').mockResolvedValue({ success: true, data: { savedAt: new Date().toISOString() } });
    render();

    await vi.waitFor(() => expect(current?.repos.map((item) => item.id)).toEqual([8, 9]));
    expect(getRepositories).toHaveBeenCalledOnce();
  });

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

  it('keeps the fetched catalog online when writing the snapshot fails', async () => {
    vi.spyOn(githubClient, 'getRepositories').mockResolvedValue({
      success: true,
      data: { repos: [repo(1)], nextPage: null, hasMore: false, totalCount: null },
    });
    vi.spyOn(githubClient, 'saveCatalogSnapshot').mockRejectedValue(new Error('disk unavailable'));
    render();

    await vi.waitFor(() => expect(current?.loading).toBe(false));
    expect(current?.repos.map((item) => item.id)).toEqual([1]);
    expect(current?.offline).toBe(false);
    expect(current?.error).toBeNull();
  });

  it('shows fetched pages progressively when no snapshot exists', async () => {
    type RepositoriesResult = Awaited<ReturnType<typeof githubClient.getRepositories>>;
    let resolveSecond: ((result: RepositoriesResult) => void) | undefined;
    const second = new Promise<RepositoriesResult>((resolve) => {
      resolveSecond = resolve;
    });
    vi.spyOn(githubClient, 'getRepositories').mockImplementation(({ page }) =>
      page === 1 ? Promise.resolve({ success: true, data: { repos: [repo(1)], nextPage: 2, hasMore: true, totalCount: null } }) : second,
    );
    const save = vi.spyOn(githubClient, 'saveCatalogSnapshot').mockResolvedValue({ success: true, data: { savedAt: new Date().toISOString() } });
    render();

    await vi.waitFor(() => expect(current?.repos.map((item) => item.id)).toEqual([1]));
    expect(current?.loading).toBe(true);
    expect(save).not.toHaveBeenCalled();

    resolveSecond?.({ success: true, data: { repos: [repo(2)], nextPage: null, hasMore: false, totalCount: null } });
    await vi.waitFor(() => expect(current?.repos.map((item) => item.id)).toEqual([1, 2]));
    expect(save).toHaveBeenCalledWith([repo(1), repo(2)]);
  });

  it('falls back to the last complete dated snapshot after a page fails', async () => {
    vi.spyOn(githubClient, 'getRepositories').mockResolvedValue({ success: false, error: 'rate limit' });
    vi.mocked(githubClient.getCatalogSnapshot).mockResolvedValue({
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
    await vi.waitFor(() => expect(current?.offline).toBe(true));
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
