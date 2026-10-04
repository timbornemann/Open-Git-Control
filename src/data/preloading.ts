import { prepareGraphLayout } from './graphLayout';
import { parseGitLog } from '@/utils/gitParsing';
import { applyCachedStats, storeGraphCache, getGraphCacheKey, graphQueryKey } from '@/components/commit-graph/commitGraphDataCache';
import { gitClient } from '@/services/gitClient';
import { repositoryRunClient } from '@/services/repositoryRunClient';
import { getActiveResourceRepository, preload, resourceKey } from './clientCache';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { queryClient } from './queryClient';
import type { PreviewSnapshot } from '@/shared/cache/resource';
import type { IpcResult } from '@/types/ipc';
import type { CommitLogPageDto } from '@/types/gitDtos';
import { historyRevision } from './historyRevision';

/** Disk previews can prepare a graph while the first live Git request is still
 * pending. This only computes layout and never selects or reads a repository. */
export async function prepareRestoredGraphs(snapshots: PreviewSnapshot[]) {
  for (const snapshot of snapshots) {
    if (snapshot.key[1] !== 'git' || snapshot.key[3] !== 'getCommitLogPage') continue;
    const revision = historyRevision(snapshot.key[2]);
    const result = queryClient.getQueryData<IpcResult<CommitLogPageDto>>(snapshot.key);
    if (!result?.success) continue;
    const mode = (snapshot.key[4] as { scope?: string })?.scope === 'all';
    const key = getGraphCacheKey(snapshot.key[2], mode);
    const before = queryClient.getQueryState(['resource', 'git', snapshot.key[2], 'graph', mode ? 'all' : 'head'])?.dataUpdatedAt || 0;
    const commits = applyCachedStats(parseGitLog(result.data.raw), result.data.stats || {});
    const layout = await prepareGraphLayout(snapshot.key[2], commits);
    const after = queryClient.getQueryState(['resource', 'git', snapshot.key[2], 'graph', mode ? 'all' : 'head'])?.dataUpdatedAt || 0;
    if (revision === historyRevision(snapshot.key[2]) && after === before && queryClient.getQueryData(snapshot.key) === result)
      storeGraphCache(key, commits, result.data.hasMore, layout);
  }
}

export async function preloadRepositoryGraph(repoPath: string, showSecondaryHistory: boolean) {
  const revision = historyRevision(repoPath);
  const params = { repoPath, limit: 100, offset: 0, scope: showSecondaryHistory ? ('all' as const) : ('head' as const) };
  const result = await gitClient.getCommitLogPage(params);
  if (!result.success) return;
  const sourceKey = resourceKey('git', 'getCommitLogPage', [params]);
  const source = queryClient.getQueryData(sourceKey);
  const graphKey = getGraphCacheKey(repoPath, showSecondaryHistory);
  const previousGraph = queryClient.getQueryData(graphQueryKey(graphKey));
  const commits = applyCachedStats(parseGitLog(result.data.raw), result.data.stats || {});
  const layout = await prepareGraphLayout(repoPath, commits);
  const current = queryClient.getQueryState(sourceKey);
  if (
    getActiveResourceRepository() !== normalizeRepoPathKey(repoPath) ||
    historyRevision(repoPath) !== revision ||
    !current ||
    current.isInvalidated ||
    current.data !== source ||
    queryClient.getQueryData(graphQueryKey(graphKey)) !== previousGraph
  )
    return;
  storeGraphCache(graphKey, commits, result.data.hasMore, layout);
}

export function preloadRepository(repoPath: string, showSecondaryHistory: boolean) {
  // Authorization is established by the normal setRepoPath IPC. Preloading
  // never selects a repository, including the two restored recent previews.
  if (getActiveResourceRepository() !== normalizeRepoPathKey(repoPath)) return;
  const reads: Array<() => Promise<unknown>> = [
    () => gitClient.getWorkingTreeSnapshot(repoPath),
    () => gitClient.runGitCommandForRepo(repoPath, 'branch', '-a'),
    () => gitClient.runGitCommandForRepo(repoPath, 'tag', '-l', '--sort=-v:refname'),
    () => gitClient.runGitCommandForRepo(repoPath, 'remote', '-v'),
    () => gitClient.runGitCommandForRepo(repoPath, 'submoduleStatus'),
    () => gitClient.listWorkingDirectory(repoPath, ''),
    () => preloadRepositoryGraph(repoPath, showSecondaryHistory),
    () => repositoryRunClient.getConfig(repoPath),
  ];
  for (const read of reads) void preload(read, 'repository');
}
