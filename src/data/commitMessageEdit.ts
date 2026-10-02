import { normalizeRepoPathKey } from '@/utils/repoPath';
import { queryClient, refreshVisibleResources } from './queryClient';
import { advanceHistoryRevision } from './historyRevision';

export async function refreshRewrittenHistory(repoPath: string) {
  const scope = normalizeRepoPathKey(repoPath);
  const predicate = (query: { queryKey: readonly unknown[]; meta?: Record<string, unknown> }) =>
    query.queryKey[1] === 'git' && query.queryKey[2] === scope && !query.meta?.immutable;
  await queryClient.cancelQueries({ predicate });
  queryClient.removeQueries({
    predicate: (query) =>
      predicate(query) &&
      (['graph', 'layout', 'getCommitLogPage'].includes(String(query.queryKey[3])) || (query.queryKey[3] === 'command' && query.queryKey[4] === 'log')),
  });
  await queryClient.invalidateQueries({ predicate, refetchType: 'none' });
  advanceHistoryRevision(repoPath);
  refreshVisibleResources();
}
