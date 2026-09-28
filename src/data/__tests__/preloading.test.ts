import { afterEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { getGraphCacheKey, graphQueryKey } from '@/components/commit-graph/commitGraphDataCache';
import { computeGraphLayout } from '@/utils/graphLayout';
import { preloadRepositoryGraph } from '../preloading';
import { prepareGraphLayout } from '../graphLayout';
import { invalidateResources, resourceKey, setActiveResourceRepository } from '../clientCache';
import { queryClient } from '../queryClient';

vi.mock('../graphLayout', () => ({ prepareGraphLayout: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

async function pendingGraph() {
  vi.mocked(prepareGraphLayout).mockReset();
  const repoPath = '/repo';
  setActiveResourceRepository(repoPath);
  const result = { success: true as const, data: { raw: '', hasMore: false, stats: {}, repoPath } };
  const sourceKey = resourceKey('git', 'getCommitLogPage', [{ repoPath, limit: 100, offset: 0, scope: 'head' }]);
  const graphKey = graphQueryKey(getGraphCacheKey(repoPath, false));
  queryClient.setQueryData(sourceKey, result);
  vi.spyOn(gitClient, 'getCommitLogPage').mockResolvedValue(result);
  let resolve!: (layout: ReturnType<typeof computeGraphLayout>) => void;
  vi.mocked(prepareGraphLayout).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const pending = preloadRepositoryGraph(repoPath, false);
  await vi.waitFor(() => expect(prepareGraphLayout).toHaveBeenCalled());
  return { result, sourceKey, graphKey, pending, finish: () => resolve(computeGraphLayout([])) };
}

describe('repository graph preloading', () => {
  it('publishes a prepared layout when its repository and source are still current', async () => {
    const run = await pendingGraph();
    run.finish();
    await run.pending;
    expect(queryClient.getQueryData(run.graphKey)).toMatchObject({ commits: [], hasMore: false, layout: computeGraphLayout([]) });
  });

  it.each(['commit refresh', 'graph refresh', 'mutation', 'repository switch'] as const)('discards a late worker result after %s', async (change) => {
    const run = await pendingGraph();
    if (change === 'commit refresh') queryClient.setQueryData(run.sourceKey, { ...run.result, data: { ...run.result.data, raw: 'new commits' } });
    if (change === 'graph refresh') queryClient.setQueryData(run.graphKey, { commits: [], hasMore: true, touchedAt: Date.now() });
    if (change === 'mutation') invalidateResources('git', '/repo');
    if (change === 'repository switch') setActiveResourceRepository('/other');
    const newerGraph = queryClient.getQueryData(run.graphKey);
    run.finish();
    await run.pending;
    expect(queryClient.getQueryData(run.graphKey)).toBe(newerGraph);
  });
});
