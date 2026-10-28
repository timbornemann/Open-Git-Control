// @vitest-environment jsdom
import { act, createElement, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { computeGraphLayout } from '@/utils/graphLayout';
import type { GitCommit } from '@/utils/gitParsing';
import { storeGraphCache, getGraphCacheKey, getGraphCacheEntry } from './commitGraphDataCache';
import { useCommitGraphData } from './useCommitGraphData';
import { githubMergeHistory, MERGED_MAIN_HASHES } from '@/utils/__tests__/graphMergeFixture';

afterEach(() => vi.restoreAllMocks());
it('replaces cached bent main lanes after pulling already visible GitHub merges', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const repo = 'C:/graph-pulled-github-merges';
  const before = githubMergeHistory();
  // Positions observed before the fix: local main on lane 0, its fetched tip on lane 1.
  const oldLayout = computeGraphLayout(before, { anchorHash: 'f0416b1', lanes: [1, 2, 0, 1, 0, 1, 0, 1, 0, 0] });
  storeGraphCache(getGraphCacheKey(repo, true), before, false, oldLayout);
  const fresh = githubMergeHistory(true);
  const raw = fresh
    .map(
      (commit) =>
        [commit.hash, commit.abbrevHash, commit.author, commit.date, commit.subject, commit.parentHashes.join(' '), commit.refs.join('\x1d')].join('\x1f') +
        '\x00',
    )
    .join('');
  const refs = Object.fromEntries(fresh.map((commit) => [commit.hash, commit.refs]));
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'onCommitStats').mockReturnValue(vi.fn());
  vi.spyOn(gitClient, 'requestCommitStats').mockResolvedValue({ success: true, data: {} });
  vi.spyOn(gitClient, 'getCommitLogPage').mockResolvedValue({ success: true, data: { repoPath: repo, raw, refs, stats: {}, hasMore: false } });
  let graph!: ReturnType<typeof useCommitGraphData>;
  const refresh = vi.fn().mockResolvedValue(undefined);
  function Harness() {
    const ref = useRef<HTMLDivElement>(null);
    graph = useCommitGraphData({
      repoPath: repo,
      showSecondaryHistory: true,
      logContainerRef: ref,
      externalWorkingTreeStatus: null,
      onRefreshWorkingTree: refresh,
    });
    return createElement('div', { ref });
  }
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(Harness)));
    expect(graph.layout?.nodes[0].commit.refs).toContain('HEAD -> main');
    expect(graph.layout?.nodes.filter((node) => MERGED_MAIN_HASHES.includes(node.commit.hash)).every((node) => node.lane === 0)).toBe(true);
    expect(graph.layout?.maxLane).toBe(1);
    expect(graph.layout?.edges.filter((edge) => edge.kind === 'merge')).toHaveLength(4);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
it.each(['moved', 'deleted'] as const)('refreshes a %s remote ref beyond the first 100 commits without rereading loaded history', async (operation) => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const repo = `C:/graph-refs-${operation}`;
  const hash = (index: number) => (index + 1).toString(16).padStart(40, '0');
  const commits = Array.from({ length: 200 }, (_, index): GitCommit => ({
    hash: hash(index),
    abbrevHash: hash(index).slice(-7),
    author: 'Test',
    date: '',
    subject: `Commit ${index}`,
    parentHashes: index < 199 ? [hash(index + 1)] : [],
    refs: index === 0 ? ['HEAD -> main'] : index === 150 ? ['origin/moving'] : [],
    stats: null,
    statsState: 'missing',
  }));
  storeGraphCache(getGraphCacheKey(repo, true), commits, false, computeGraphLayout(commits));
  const fresh = commits.slice(0, 100);
  const raw = fresh
    .map(
      (commit) =>
        [commit.hash, commit.abbrevHash, commit.author, commit.date, commit.subject, commit.parentHashes.join(' '), commit.refs.join('\x1d')].join('\x1f') +
        '\x00',
    )
    .join('');
  const refs = { [hash(0)]: operation === 'moved' ? ['HEAD -> main', 'origin/moving'] : ['HEAD -> main'] };
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'onCommitStats').mockReturnValue(vi.fn());
  vi.spyOn(gitClient, 'requestCommitStats').mockResolvedValue({ success: true, data: {} });
  const read = vi.spyOn(gitClient, 'getCommitLogPage').mockResolvedValue({ success: true, data: { repoPath: repo, raw, refs, stats: {}, hasMore: true } });
  let graph!: ReturnType<typeof useCommitGraphData>;
  const refresh = vi.fn().mockResolvedValue(undefined);
  function Harness() {
    const ref = useRef<HTMLDivElement>(null);
    graph = useCommitGraphData({
      repoPath: repo,
      showSecondaryHistory: true,
      logContainerRef: ref,
      externalWorkingTreeStatus: null,
      onRefreshWorkingTree: refresh,
    });
    return createElement('div', { ref });
  }
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(Harness)));
    expect(graph.layout?.nodes).toHaveLength(200);
    expect(graph.layout!.nodes.filter((node) => node.commit.refs.includes('origin/moving')).map((node) => node.row)).toEqual(operation === 'moved' ? [0] : []);
    expect(read).toHaveBeenCalledOnce();
    expect(read.mock.calls[0][0]).toMatchObject({ offset: 0, limit: 100 });
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it('does not restore an old cached layout after refs move on unchanged commit objects', () => {
  const commit: GitCommit = {
    hash: 'a',
    abbrevHash: 'a',
    author: '',
    date: '',
    subject: '',
    parentHashes: [],
    refs: ['origin/topic'],
    stats: null,
    statsState: 'missing',
  };
  const key = getGraphCacheKey('C:/graph-cache', true);
  storeGraphCache(key, [commit], false, computeGraphLayout([commit]));
  storeGraphCache(key, [{ ...commit, refs: [] }], false);
  expect(getGraphCacheEntry('C:/graph-cache', true)?.layout).toBeUndefined();
});
