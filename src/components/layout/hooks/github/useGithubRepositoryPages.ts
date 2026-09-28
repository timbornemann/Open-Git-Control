import { useCallback, useMemo, useState } from 'react';
import type { CatalogTranslateFn } from '@/i18n';
import { useGithubCatalog } from '@/components/github-workspace/useGithubCatalog';

type Params = { isAuthenticated: boolean; username?: string | null; host?: string; t: CatalogTranslateFn };

/** Search and pagination project the complete shared catalog without a second fetch loop. */
export const useGithubRepositoryPages = ({ isAuthenticated, username = null, host }: Params) => {
  const catalog = useGithubCatalog(isAuthenticated, username, host, 'startup');
  const refreshCatalog = catalog.refresh;
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(50);
  const filtered = useMemo(
    () => catalog.repos.filter((repo) => `${repo.fullName} ${repo.description || ''}`.toLowerCase().includes(search.toLowerCase())),
    [catalog.repos, search],
  );
  const resetRepositoryPages = useCallback((_options?: { clearRepos?: boolean }) => {
    setSearch('');
    setLimit(50);
  }, []);
  const refreshRepos = useCallback(
    async (searchOverride?: string) => {
      if (typeof searchOverride === 'string') {
        setSearch(searchOverride);
        setLimit(50);
      } else await refreshCatalog();
    },
    [refreshCatalog],
  );
  const loadMoreRepos = useCallback(async () => {
    setLimit((current) => current + 50);
  }, []);
  return {
    githubRepos: filtered.slice(0, limit),
    setGithubRepos: catalog.setRepos,
    githubReposHasMore: filtered.length > limit,
    isLoadingRepos: !catalog.hasData && catalog.loading,
    isLoadingMoreRepos: false,
    loadMoreRepos,
    refreshRepos,
    resetRepositoryPages,
  };
};
