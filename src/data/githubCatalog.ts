import { cancellableRead } from './ipcRead';
import { githubClient } from '@/services/githubClient';
import type { GithubCatalogSnapshotDto, GitHubRepositoryDto } from '@/types/githubDtos';
import type { ResourceKey, ReadPriority } from '@/shared/cache/resource';
import { hashKey } from '@tanstack/react-query';
import { backgroundQueue, abortError } from './backgroundQueue';
import { checked, hydratePreviews, queryClient, readResource } from './queryClient';
import { getGithubResourceScope, setGithubResourceScope, invalidateGithubCacheEpoch, getGithubCacheEpoch } from './clientCache';

export const catalogKey = (scope = getGithubResourceScope()): ResourceKey => ['resource', 'github', scope, 'catalog'];
const snapshotRequests = new Map<string, Promise<void>>();
export function restoreGithubCatalog(host: string, username: string | null) {
  const requestedScope = username ? `${host}/${username}`.toLowerCase() : getGithubResourceScope();
  if (queryClient.getQueryData(catalogKey(requestedScope))) return Promise.resolve();
  const pending = snapshotRequests.get(requestedScope);
  if (pending) return pending;
  const startedAt = Date.now();
  const epoch = getGithubCacheEpoch();
  const scopeAtStart = getGithubResourceScope();
  const snapshotRequest = githubClient
    .getCatalogSnapshot()
    .then((result) => {
      if (!result.success || !result.data || getGithubCacheEpoch() !== epoch) return;
      const snapshot = result.data;
      if (snapshot.host.toLowerCase() !== host.toLowerCase() || (username && snapshot.username.toLowerCase() !== username.toLowerCase())) return;
      if (getGithubResourceScope() !== scopeAtStart && getGithubResourceScope() !== `${snapshot.host}/${snapshot.username}`.toLowerCase()) return;
      setGithubResourceScope(snapshot.host, snapshot.username);
      hydratePreviews(
        [
          {
            version: 1,
            key: catalogKey(),
            savedAt: Date.parse(snapshot.savedAt),
            sourceRevision: snapshot.savedAt,
            complete: !snapshot.refreshRequired,
            data: snapshot,
          },
        ],
        startedAt,
      );
    })
    .catch(() => {})
    .finally(() => {
      snapshotRequests.delete(requestedScope);
    });
  snapshotRequests.set(requestedScope, snapshotRequest);
  return snapshotRequest;
}

export function fetchGithubCatalog(scope: string, force = false, priority: ReadPriority = 'startup') {
  const [host, username] = scope.split('/');
  return readResource<GithubCatalogSnapshotDto>(
    catalogKey(scope),
    async (signal) => {
      const hadSnapshot = queryClient.getQueryData<GithubCatalogSnapshotDto>(catalogKey(scope))?.savedAt;
      const collected: GitHubRepositoryDto[] = [];
      let page = 1;
      for (let count = 0; count < 1000; count++) {
        const response = checked(
          await backgroundQueue.schedule(
            () =>
              cancellableRead(signal, priority, (request) =>
                githubClient.getRepositories({ page, perPage: 100, ...(request ? { readRequest: request } : {}) }),
              ),
            priority,
            true,
            signal,
            hashKey(catalogKey(scope)),
          ),
        );
        if (!response.success) throw new Error(response.error);
        if (signal.aborted || getGithubResourceScope() !== scope) throw abortError();
        collected.push(...response.data.repos);
        if (!hadSnapshot && response.data.hasMore) {
          queryClient.setQueryData(catalogKey(scope), {
            host,
            username,
            savedAt: '',
            refreshRequired: true,
            repos: [...new Map(collected.map((repo) => [repo.id, repo])).values()],
          });
        }
        if (!response.data.hasMore || !response.data.nextPage) {
          const repos = [...new Map(collected.map((repo) => [repo.id, repo])).values()];
          let savedAt = new Date().toISOString();
          try {
            const saved = await githubClient.saveCatalogSnapshot(repos);
            if (saved.success) savedAt = saved.data.savedAt;
          } catch {
            /* Cache IO must not discard online data. */
          }
          if (signal.aborted) throw abortError();
          return { host, username, savedAt, repos };
        }
        page = response.data.nextPage;
      }
      throw new Error('Repository catalog exceeds the supported page limit.');
    },
    { staleTime: 300_000, force, scheduled: false, priority },
  );
}

export function clearGithubCatalogSession() {
  invalidateGithubCacheEpoch();
  void queryClient.cancelQueries({ predicate: (q) => q.queryKey[1] === 'github' });
  queryClient.removeQueries({ predicate: (q) => q.queryKey[1] === 'github' });
}
