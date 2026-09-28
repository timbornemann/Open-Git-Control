import { useMemo } from 'react';
import { useRepoOrigins } from '@/hooks/useRepoOrigins';
import { toRepoIdentity } from '@/components/layout/sidebar/useGithubRepoOriginMap';

export function useLocalGithubRepos(openRepos: string[]) {
  const origins = useRepoOrigins(openRepos);
  return useMemo(() => {
    const map = new Map<string, string[]>();
    for (const repoPath of openRepos) {
      const identity = toRepoIdentity(origins[repoPath] || '');
      if (identity) map.set(identity, [...(map.get(identity) || []), repoPath]);
    }
    return map;
  }, [openRepos, origins]);
}
