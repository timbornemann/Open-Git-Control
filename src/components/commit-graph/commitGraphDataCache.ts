import { queryClient } from '@/data/queryClient';
import type { GraphLayout } from '@/utils/graphLayout';
import type { GitCommit } from '@/utils/gitParsing';
import { normalizeRepoPathKey } from '@/utils/repoPath';

export const LOG_PAGE_SIZE = 100;
export const QUICK_REFRESH_LIMIT = 50;
export const LOG_MAX_LIMIT = 5000;

type GraphCacheEntry = {
  commits: GitCommit[];
  hasMore: boolean;
  touchedAt: number;
  layout?: GraphLayout;
};

export const getGraphCacheKey = (repoPath: string, showSecondaryHistory: boolean) =>
  `${normalizeRepoPathKey(repoPath)}\0${showSecondaryHistory ? 'all' : 'head'}`;

export const graphQueryKey = (key: string) => ['resource', 'git', key.split('\0')[0], 'graph', key.split('\0')[1]] as const;
export const getGraphCacheEntry = (repoPath: string, showSecondaryHistory: boolean) =>
  queryClient.getQueryData<GraphCacheEntry>(graphQueryKey(getGraphCacheKey(repoPath, showSecondaryHistory)));

export const storeGraphCache = (key: string, commits: GitCommit[], hasMore: boolean, layout?: GraphLayout) => {
  queryClient.setQueryData<GraphCacheEntry>(graphQueryKey(key), (old) => ({
    commits: commits.slice(0, LOG_MAX_LIMIT),
    hasMore,
    touchedAt: Date.now(),
    layout:
      layout || (old?.commits.length === commits.length && old.commits.every((commit, index) => commit.hash === commits[index].hash) ? old.layout : undefined),
  }));
};

export const applyCachedStats = (commits: GitCommit[], stats: Record<string, { files: number; additions: number; deletions: number }>) =>
  commits.map((commit) => {
    const cached = stats[commit.hash];
    return cached ? { ...commit, stats: cached, statsState: 'ready' as const } : commit;
  });

export const mergeUniqueCommits = (base: GitCommit[], incoming: GitCommit[]): GitCommit[] => {
  const out: GitCommit[] = [];
  const seen = new Set<string>();
  for (const commit of [...base, ...incoming]) {
    if (seen.has(commit.hash)) continue;
    seen.add(commit.hash);
    out.push(commit);
  }
  return out;
};
