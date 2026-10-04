import { useCallback, useEffect, useSyncExternalStore, type SetStateAction } from 'react';
import { githubClient } from '@/legacy/github/githubClient';
import type { GithubCatalogSnapshotDto, GitHubRepositoryDto } from '@/types/githubDtos';
import { getGithubResourceScope, setGithubResourceScope, subscribeGithubScope } from '@/data/clientCache';
import { catalogKey, fetchGithubCatalog, restoreGithubCatalog } from '@/data/githubCatalog';
import { useCachedResult } from '@/data/resourceHooks';
import { updateResource } from '@/data/queryClient';
import type { ReadPriority } from '@/shared/cache/resource';

const GITHUB_CATALOG_REFRESH_EVENT = 'ogc:github-catalog-refresh';

export function useGithubCatalog(isAuthenticated: boolean, username: string | null, host?: string, priority: ReadPriority = 'visible') {
  const sharedScope = useSyncExternalStore(subscribeGithubScope, getGithubResourceScope);
  const configuredHost = (host || sharedScope.split('/')[0]).toLowerCase();
  const scope = username
    ? `${configuredHost}/${username.toLowerCase()}`
    : sharedScope.startsWith(`${configuredHost}/`)
      ? sharedScope
      : `${configuredHost}/anonymous`;
  const query = useCachedResult<GithubCatalogSnapshotDto>(catalogKey(scope));
  const refresh = useCallback(async () => {
    if (!isAuthenticated || !githubClient.isAvailable()) return;
    setGithubResourceScope(configuredHost, username);
    await fetchGithubCatalog(scope, true, 'visible').catch(() => {});
  }, [configuredHost, isAuthenticated, scope, username]);

  useEffect(() => {
    if (!githubClient.isAvailable()) return;
    if (username) setGithubResourceScope(configuredHost, username);
    let active = true;
    void restoreGithubCatalog(configuredHost, username).then(() => {
      if (active && isAuthenticated) void fetchGithubCatalog(scope, false, priority).catch(() => {});
    });
    return () => {
      active = false;
    };
  }, [configuredHost, isAuthenticated, scope, username, priority]);

  useEffect(() => {
    const onRefresh = () => {
      void refresh();
    };
    window.addEventListener(GITHUB_CATALOG_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(GITHUB_CATALOG_REFRESH_EVENT, onRefresh);
  }, [refresh]);

  const setRepos = useCallback(
    (action: SetStateAction<GitHubRepositoryDto[]>) => {
      updateResource<GithubCatalogSnapshotDto>(catalogKey(scope), (old) => ({
        host: configuredHost,
        username: username || '',
        savedAt: new Date().toISOString(),
        ...old,
        repos: typeof action === 'function' ? action(old?.repos || []) : action,
      }));
    },
    [configuredHost, scope, username],
  );
  const data = query.data;
  return {
    repos: data?.repos || [],
    savedAt: data?.savedAt || null,
    hasData: data !== undefined,
    loading: query.isFetching || (!data && isAuthenticated),
    offline: !isAuthenticated || query.isError,
    error: query.error?.message || null,
    account: data ? { host: data.host, username: data.username } : null,
    refresh,
    setRepos,
  };
}
