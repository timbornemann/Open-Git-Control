// @vitest-environment jsdom
import { act, createElement, StrictMode, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import * as graphLayout from '@/data/graphLayout';
import { queryClient } from '@/data/queryClient';
import { advanceHistoryRevision } from '@/data/historyRevision';
import type { CommitStatsUpdateDto } from '@/types/gitDtos';
import type { GraphLayout } from '@/utils/graphLayout';
import type { GitCommit } from '@/utils/gitParsing';
import { getGraphCacheEntry, getGraphCacheKey, storeGraphCache } from './commitGraphDataCache';
import { COMMIT_STATS_BATCH_MS } from './useCommitGraphStats';
import { useCommitGraphData } from './useCommitGraphData';

const repoPath = 'C:/graph-stats';
const metrics = { files: 2, additions: 15, deletions: 3 };
const hash = (index: number) => index.toString(16).padStart(40, '0');
const layoutFor = (count: number, offset = 0): GraphLayout => ({
  nodes: Array.from({ length: count }, (_, row) => ({
    commit: {
      hash: hash(row + offset),
      abbrevHash: hash(row + offset).slice(-7),
      author: 'Author',
      date: '2026-10-19',
      subject: `Commit ${row + offset}`,
      parentHashes: [],
      refs: [],
      stats: { files: 0, additions: 0, deletions: 0 },
      statsState: 'ready',
    } satisfies GitCommit,
    row,
    lane: 0,
    color: 'color',
    isMerge: false,
  })),
  edges: [],
  maxLane: 0,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}

describe('batched commit graph statistics', () => {
  let root: Root;
  let host: HTMLDivElement;
  let graph: ReturnType<typeof useCommitGraphData>;
  let listener: (update: CommitStatsUpdateDto) => void;
  const refresh = vi.fn().mockResolvedValue(undefined);
  const seed = (repo = repoPath, all = false, layout = layoutFor(2)) =>
    storeGraphCache(
      getGraphCacheKey(repo, all),
      layout.nodes.map((node) => node.commit),
      true,
      layout,
    );
  function Harness({ repo = repoPath, all = false }: { repo?: string; all?: boolean }) {
    const logContainerRef = useRef<HTMLDivElement>(null);
    graph = useCommitGraphData({ repoPath: repo, showSecondaryHistory: all, logContainerRef, externalWorkingTreeStatus: null, onRefreshWorkingTree: refresh });
    return null;
  }
  const render = async (repo = repoPath, all = false, strict = false) => {
    await act(async () => root.render(strict ? createElement(StrictMode, null, createElement(Harness, { repo, all })) : createElement(Harness, { repo, all })));
  };
  const tick = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMIT_STATS_BATCH_MS);
    });
  };
  const event = (index = 0, state: CommitStatsUpdateDto['state'] = 'ready', stats: CommitStatsUpdateDto['stats'] = metrics, repo = repoPath) =>
    listener({ repoPath: repo, hash: hash(index), state, stats });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'getCommitLogPage').mockReturnValue(new Promise(() => {}));
    vi.spyOn(gitClient, 'requestCommitStats').mockResolvedValue({ success: true, data: {} });
    vi.spyOn(gitClient, 'onCommitStats').mockImplementation((callback) => {
      listener = callback;
      return vi.fn();
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([false, true])('publishes and serializes one graph update for 100 separate events over 2000 nodes (Strict Mode: %s)', async (strict) => {
    seed(repoPath, false, layoutFor(2000));
    const prepare = vi.spyOn(graphLayout, 'prepareGraphLayout');
    await render(repoPath, false, strict);
    const initial = graph.layout!;
    const writes: unknown[] = [];
    const stop = queryClient.getQueryCache().subscribe((entry) => {
      if (entry.type === 'updated' && entry.action.type === 'success' && entry.query.queryKey[3] === 'graph') writes.push(entry.query.state.data);
    });
    const serialize = vi.spyOn(JSON, 'stringify');
    const sizeChecks = () => serialize.mock.calls.filter(([value]) => Array.isArray(value) && Array.isArray(value[0]) && value[0][3] === 'graph');
    try {
      for (let index = 0; index < 100; index++) await act(async () => event(index));
      expect(graph.layout).toBe(initial);
      expect(writes).toHaveLength(0);
      expect(sizeChecks()).toHaveLength(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(COMMIT_STATS_BATCH_MS - 1);
      });
      expect(writes).toHaveLength(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(writes).toHaveLength(1);
      expect(sizeChecks()).toHaveLength(1);
      expect(graph.layout!.nodes.slice(0, 100).every((node) => node.commit.stats?.additions === metrics.additions)).toBe(true);
      expect(graph.layout!.nodes[100]).toBe(initial.nodes[100]);
      expect(graph.layout!.edges).toBe(initial.edges);
      expect(graph.layout!.nodes.map(({ row, lane }) => [row, lane])).toEqual(initial.nodes.map(({ row, lane }) => [row, lane]));
      expect(getGraphCacheEntry(repoPath, false)?.layout?.nodes[0].commit.stats).toEqual(metrics);
      expect(prepare).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });

  it('coalesces API replies and events without letting queued/loading/error states overwrite completed statistics', async () => {
    seed();
    const pending = deferred<Awaited<ReturnType<typeof gitClient.requestCommitStats>>>();
    vi.mocked(gitClient.requestCommitStats).mockReturnValueOnce(pending.promise);
    await render();
    let request!: Promise<void>;
    await act(async () => {
      request = graph.requestCommitStats([hash(0)], 'selected');
    });
    await act(async () => {
      event(0, 'loading', null);
      event();
      event(0, 'error', null);
      pending.resolve({ success: true, data: { [hash(0)]: { stats: null, state: 'queued' } } });
      await request;
    });
    await tick();
    expect(graph.layout!.nodes[0].commit).toMatchObject({ stats: metrics, statsState: 'ready' });
    expect(gitClient.requestCommitStats).toHaveBeenCalledWith([hash(0)], 'selected', repoPath);
  });

  it('does not publish another cache entry for duplicate or irrelevant statistics', async () => {
    seed();
    await render();
    await act(async () => event());
    await tick();
    const original = graph.layout;
    const cached = getGraphCacheEntry(repoPath, false);
    await act(async () => {
      event();
      event(0, 'loading', null);
      event(9999);
    });
    await tick();
    expect(graph.layout).toBe(original);
    expect(getGraphCacheEntry(repoPath, false)).toBe(cached);
  });

  it('keeps flushing a continuous stream instead of deferring all updates until it stops', async () => {
    seed();
    await render();
    for (let index = 0; index < 5; index++) {
      await act(async () => {
        event(0, 'ready', { ...metrics, additions: index });
        await vi.advanceTimersByTimeAsync(COMMIT_STATS_BATCH_MS / 5);
      });
    }
    expect(graph.layout!.nodes[0].commit.stats?.additions).toBe(4);
    await act(async () => event(0, 'ready', { ...metrics, additions: 9 }));
    await tick();
    expect(graph.layout!.nodes[0].commit.stats?.additions).toBe(9);
  });

  it.each(['repository', 'scope'] as const)('discards queued work and old event callbacks after a %s change', async (change) => {
    seed();
    seed('C:/other');
    seed(repoPath, true);
    await render();
    const previousListener = listener;
    await act(async () => event());
    const repo = change === 'repository' ? 'C:/other' : repoPath;
    await render(repo, change === 'scope');
    await act(async () => previousListener({ repoPath, hash: hash(0), stats: metrics, state: 'ready' }));
    await tick();
    expect(graph.layout!.nodes[0].commit.stats?.additions).toBe(0);
    expect(getGraphCacheEntry(repoPath, false)?.commits[0].stats?.additions).toBe(0);
  });

  it('rejects an old API reply after leaving and returning to the same repository', async () => {
    seed();
    seed('C:/other');
    const pending = deferred<Awaited<ReturnType<typeof gitClient.requestCommitStats>>>();
    vi.mocked(gitClient.requestCommitStats).mockReturnValueOnce(pending.promise);
    await render();
    let request!: Promise<void>;
    await act(async () => {
      request = graph.requestCommitStats([hash(0)]);
    });
    await render('C:/other');
    await render();
    await act(async () => {
      pending.resolve({ success: true, data: { [hash(0)]: { stats: metrics, state: 'ready' } } });
      await request;
    });
    await tick();
    expect(graph.layout!.nodes[0].commit.stats?.additions).toBe(0);
  });

  it('keeps statistics that arrive before the initial worker layout', async () => {
    const pending = deferred<GraphLayout>();
    vi.spyOn(graphLayout, 'prepareGraphLayout').mockReturnValueOnce(pending.promise);
    const raw = [hash(0), '0000000', 'Author', '2026-10-19', 'Commit', '', ''].join('\x1f') + '\0';
    vi.mocked(gitClient.getCommitLogPage).mockResolvedValueOnce({ success: true, data: { raw, stats: {}, hasMore: false, repoPath } });
    await render();
    await act(async () => event());
    await tick();
    expect(graph.layout).toBeNull();
    await act(async () => pending.resolve(layoutFor(1)));
    await tick();
    expect(graph.layout!.nodes[0].commit.stats).toEqual(metrics);
  });

  it('reconciles an update for a newly appended commit when its layout arrives', async () => {
    seed();
    await render();
    await act(async () => event(2));
    await tick();
    const raw = [hash(2), '0000002', 'Author', '2026-10-19', 'New commit', '', ''].join('\x1f') + '\0';
    vi.mocked(gitClient.getCommitLogPage).mockResolvedValueOnce({ success: true, data: { raw, stats: {}, hasMore: false, repoPath } });
    await act(async () => graph.loadMoreCommits());
    await tick();
    expect(graph.layout!.nodes.find((node) => node.commit.hash === hash(2))?.commit.stats).toEqual(metrics);
  });

  it('cancels pending publication when the view unmounts', async () => {
    seed();
    await render();
    const cached = getGraphCacheEntry(repoPath, false);
    await act(async () => event());
    act(() => root.render(null));
    await tick();
    expect(getGraphCacheEntry(repoPath, false)).toBe(cached);
  });

  it('drops queued updates when history is rewritten', async () => {
    seed();
    await render();
    await act(async () => {
      event();
      advanceHistoryRevision(repoPath);
    });
    await tick();
    expect(getGraphCacheEntry(repoPath, false)?.commits[0].stats?.additions).toBe(0);
  });
});
