import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogTranslateFn } from '@/i18n';
import type { GitHubRepositoryDto } from '@/types/githubDtos';
import { githubClient } from '@/services/githubClient';

type Params = {
  isAuthenticated: boolean;
  t: CatalogTranslateFn;
};

export const useGithubRepositoryPages = ({ isAuthenticated, t }: Params) => {
  const [githubRepos, setGithubRepos] = useState<GitHubRepositoryDto[]>([]);
  const [nextRepoPage, setNextRepoPage] = useState<number | null>(1);
  const [githubReposHasMore, setGithubReposHasMore] = useState(false);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isLoadingMoreRepos, setIsLoadingMoreRepos] = useState(false);

  const hasLoadedReposOnceRef = useRef(false);
  const currentRepoSearchRef = useRef('');

  const resetRepositoryPages = useCallback((options: { clearRepos?: boolean } = {}) => {
    setNextRepoPage(1);
    setGithubReposHasMore(false);
    setIsLoadingRepos(false);
    setIsLoadingMoreRepos(false);
    hasLoadedReposOnceRef.current = false;
    currentRepoSearchRef.current = '';
    if (options.clearRepos) {
      setGithubRepos([]);
    }
  }, []);

  const fetchReposPage = useCallback(
    async (mode: 'reset' | 'append', page: number, search: string) => {
      if (!githubClient.isAvailable() || !isAuthenticated) return;

      const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;

      if (mode === 'reset') {
        setIsLoadingRepos(true);
      } else {
        setIsLoadingMoreRepos(true);
      }

      try {
        const result = await githubClient.getRepositories({
          page: safePage,
          perPage: 50,
          search,
        });

        if (!result.success) {
          throw new Error(result.error || t('generated.components.layout.hooks.usegithubdomain.could_not_load_repositories_cec34760'));
        }

        const payload = result.data;
        const repos = payload?.repos || [];
        setNextRepoPage(payload?.nextPage || null);
        setGithubReposHasMore(Boolean(payload?.hasMore && payload?.nextPage));

        if (mode === 'reset') {
          setGithubRepos(repos);
        } else {
          setGithubRepos((prev) => {
            const map = new Map<number, GitHubRepositoryDto>();
            for (const repo of prev) map.set(repo.id, repo);
            for (const repo of repos) map.set(repo.id, repo);
            return [...map.values()];
          });
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (mode === 'reset') {
          setIsLoadingRepos(false);
        } else {
          setIsLoadingMoreRepos(false);
        }
      }
    },
    [isAuthenticated, t],
  );

  const refreshRepos = useCallback(
    async (searchOverride?: string) => {
      const search = typeof searchOverride === 'string' ? searchOverride : currentRepoSearchRef.current;
      currentRepoSearchRef.current = search;
      setNextRepoPage(1);
      await fetchReposPage('reset', 1, search);
    },
    [fetchReposPage],
  );

  const loadMoreRepos = useCallback(async () => {
    if (isLoadingMoreRepos || !githubReposHasMore || !nextRepoPage) return;
    await fetchReposPage('append', nextRepoPage, currentRepoSearchRef.current);
  }, [fetchReposPage, githubReposHasMore, isLoadingMoreRepos, nextRepoPage]);

  useEffect(() => {
    if (!isAuthenticated) {
      resetRepositoryPages();
      return;
    }

    if (hasLoadedReposOnceRef.current) return;

    hasLoadedReposOnceRef.current = true;
    void refreshRepos('');
  }, [isAuthenticated, refreshRepos, resetRepositoryPages]);

  return {
    githubRepos,
    setGithubRepos,
    githubReposHasMore,
    isLoadingRepos,
    isLoadingMoreRepos,
    loadMoreRepos,
    refreshRepos,
    resetRepositoryPages,
  };
};
