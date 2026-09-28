import { useEffect, useMemo } from 'react';
import { skipToken, useQueries } from '@tanstack/react-query';
import type { IpcResult } from '@/types/ipc';
import { gitClient } from '@/services/gitClient';
import { preload, resourceKey } from '@/data/clientCache';
import { queryClient } from '@/data/queryClient';

export function useCachedRepoOrigins(repositories: string[]) {
  const queries = useQueries(
    {
      queries: repositories.map((repo) => ({
        queryKey: resourceKey('git', 'getRepoOriginUrl', [repo]),
        queryFn: skipToken,
        enabled: false,
      })),
    },
    queryClient,
  );
  const serialized = JSON.stringify(
    Object.fromEntries(
      repositories.map((repo, index) => {
        const result = queries[index].data as IpcResult<string | null> | undefined;
        return [repo, result?.success ? result.data : null];
      }),
    ),
  );
  return useMemo(() => JSON.parse(serialized) as Record<string, string | null>, [serialized]);
}

export function useRepoOrigins(repositories: string[]) {
  const origins = useCachedRepoOrigins(repositories);
  useEffect(() => {
    if (!gitClient.isAvailable()) return;
    for (const repo of repositories) void preload(() => gitClient.getRepoOriginUrl(repo), 'startup');
  }, [repositories]);
  return origins;
}
