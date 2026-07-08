import type { GitCommit } from '@/utils/gitParsing';
import { normalizeRepoPathKey } from '@/utils/repoPath';

export const LOG_PAGE_SIZE = 100;
export const QUICK_REFRESH_LIMIT = 50;
export const LOG_MAX_LIMIT = 5000;

type GraphCacheEntry = {
  commits: GitCommit[];
  hasMore: boolean;
  touchedAt: number;
};

const graphCache = new Map<string, GraphCacheEntry>();

export const getGraphCacheKey = (repoPath: string, showSecondaryHistory: boolean) =>
  `${normalizeRepoPathKey(repoPath)}\0${showSecondaryHistory ? 'all' : 'head'}`;

export const getGraphCacheEntry = (repoPath: string, showSecondaryHistory: boolean) => {
  const cached = graphCache.get(getGraphCacheKey(repoPath, showSecondaryHistory));
  if (cached) cached.touchedAt = Date.now();
  return cached;
};

export const storeGraphCache = (key: string, commits: GitCommit[], hasMore: boolean) => {
  graphCache.set(key, {
    commits: commits.slice(0, LOG_MAX_LIMIT),
    hasMore,
    touchedAt: Date.now(),
  });
  if (graphCache.size <= 8) return;
  const oldest = [...graphCache.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)[0];
  if (oldest) graphCache.delete(oldest[0]);
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
