import { useEffect, useState } from 'react';
import { skipToken, useQueries } from '@tanstack/react-query';
import { queryClient } from '@/data/queryClient';
import { RepositoryActivityCoordinator } from '@/data/repositoryActivityCoordinator';
import { repositoryActivityKey, type RepositoryActivityResult } from '@/data/repositoryActivityCache';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { repoName } from '@/components/local-repositories/localRepositorySelectors';

export type RepositoryActivityEntry = { path: string; name: string; changeCount: number; checkedAt: number; failed: boolean };

export function useRepositoryActivity(repositories: string[], activeRepo: string | null, restoring: boolean): RepositoryActivityEntry[] {
  const [coordinator] = useState(() => new RepositoryActivityCoordinator());
  useEffect(() => {
    coordinator.start();
    return () => coordinator.dispose();
  }, [coordinator]);
  useEffect(() => coordinator.setRepositories(repositories, activeRepo, !restoring), [coordinator, repositories, activeRepo, restoring]);
  const queries = useQueries(
    { queries: repositories.map((path) => ({ queryKey: repositoryActivityKey(path), queryFn: skipToken, enabled: false })) },
    queryClient,
  );
  return repositories
    .flatMap((path, index): RepositoryActivityEntry[] => {
      const query = queries[index];
      const result = query.data as RepositoryActivityResult | undefined;
      if (
        !result?.success ||
        !Number.isSafeInteger(result.data.changeCount) ||
        result.data.changeCount <= 0 ||
        normalizeRepoPathKey(result.data.repoPath) !== normalizeRepoPathKey(path)
      )
        return [];
      return [{ path, name: repoName(path), changeCount: result.data.changeCount, checkedAt: result.data.checkedAt, failed: query.isError }];
    })
    .sort((a, b) => b.changeCount - a.changeCount || a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}
