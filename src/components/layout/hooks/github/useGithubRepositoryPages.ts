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
  // Bumped on each new search (reset) so a slower earlier search run — or a
  // "load more" belonging to a previous search — cannot write its results into
  // the list of the current search.
  const requestGenerationRef = useRef(0);

  const resetRepositoryPages = useCallback((options: { clearRepos?: boolean } = {}) => {
    requestGenerationRef.current += 1;
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
      const generation = requestGenerationRef.current;
      const isCurrent = () => requestGenerationRef.current === generation;

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
        if (!isCurrent()) return;

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
        if (!isCurrent()) return;
        console.error(error);
      } finally {
        if (isCurrent()) {
          if (mode === 'reset') {
            setIsLoadingRepos(false);
          } else {
            setIsLoadingMoreRepos(false);
          }
        }
      }
    },
    [isAuthenticated, t],
  );

  const refreshRepos = useCallback(
    async (searchOverride?: string) => {
      const search = typeof searchOverride === 'string' ? searchOverride : currentRepoSearchRef.current;
      currentRepoSearchRef.current = search;
      requestGenerationRef.current += 1;
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
      resetRepositoryPages({ clearRepos: true });
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
