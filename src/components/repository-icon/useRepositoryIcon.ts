import { useEffect } from 'react';
import { useCachedResult } from '@/data/resourceHooks';
import { observeRepositoryIcon, repositoryIconKey } from '@/data/repositoryIcons';
import type { RepositoryIconStateDto } from '@/shared/repositoryIcons';
export function useRepositoryIcon(repoPath: string) {
  const query = useCachedResult<RepositoryIconStateDto>(repositoryIconKey(repoPath));
  useEffect(() => observeRepositoryIcon(repoPath), [repoPath]);
  return query.data || null;
}
