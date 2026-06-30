import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type RefObject } from 'react';
import { computeGraphLayout, type GraphLayout } from '../../utils/graphLayout';
import {
  isRepoUnavailableError,
  parseGitLog,
  parseGitStatusDetailed,
  type GitCommit,
  type GitStatusDetailed,
} from '../../utils/gitParsing';
import { normalizeRepoPathKey } from '../../utils/repoPath';
import {
  mergeCommitStatsUpdate,
  type CommitStatsUpdate,
} from './mergeCommitStatsUpdate';
import { mergeQuickRefreshCommits } from './mergeQuickRefreshCommits';

const LOG_PAGE_SIZE = 100;
const QUICK_REFRESH_LIMIT = 50;
const LOG_MAX_LIMIT = 5000;
const AUTO_LOAD_TRIGGER_PX = 220;
const AUTO_LOAD_RESET_PX = 420;
type RefreshMode = 'reset' | 'append' | 'sync' | 'quick';

type GraphCacheEntry = {
  commits: GitCommit[];
  hasMore: boolean;
  touchedAt: number;
};

const graphCache = new Map<string, GraphCacheEntry>();

const getGraphCacheKey = (repoPath: string, showSecondaryHistory: boolean) =>
  `${normalizeRepoPathKey(repoPath)}\0${showSecondaryHistory ? 'all' : 'head'}`;

const storeGraphCache = (key: string, commits: GitCommit[], hasMore: boolean) => {
  graphCache.set(key, {
    commits: commits.slice(0, LOG_MAX_LIMIT),
    hasMore,
    touchedAt: Date.now(),
  });
  if (graphCache.size <= 8) return;
  const oldest = [...graphCache.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)[0];
  if (oldest) graphCache.delete(oldest[0]);
};

const applyCachedStats = (
  commits: GitCommit[],
  stats: Record<string, { files: number; additions: number; deletions: number }>,
) => commits.map((commit) => {
  const cached = stats[commit.hash];
  return cached
    ? { ...commit, stats: cached, statsState: 'ready' as const }
    : commit;
});

const mergeUniqueCommits = (base: GitCommit[], incoming: GitCommit[]): GitCommit[] => {
  const out: GitCommit[] = [];
  const seen = new Set<string>();
  for (const commit of [...base, ...incoming]) {
    if (seen.has(commit.hash)) continue;
    seen.add(commit.hash);
    out.push(commit);
  }
  return out;
};

type Params = {
  repoPath: string | null;
  showSecondaryHistory: boolean;
  refreshTrigger?: number;
  commitRefreshTrigger?: number;
  logContainerRef: RefObject<HTMLDivElement>;
  onRepoCleared?: () => void;
  externalWorkingTreeStatus?: GitStatusDetailed | null;
  onRefreshWorkingTree?: () => Promise<void>;
};

export const useCommitGraphData = ({
  repoPath,
  showSecondaryHistory,
  refreshTrigger,
  commitRefreshTrigger,
  logContainerRef,
  onRepoCleared,
  externalWorkingTreeStatus,
  onRefreshWorkingTree,
}: Params) => {
  const [layout, setLayout] = useState<GraphLayout | null>(null);
  const [commitCount, setCommitCount] = useState(0);
  const [workingTreeStatus, setWorkingTreeStatus] = useState<GitStatusDetailed | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreCommits, setHasMoreCommits] = useState(true);

  const commitCountRef = useRef(0);
  const layoutRef = useRef<GraphLayout | null>(null);
  const onRepoClearedRef = useRef(onRepoCleared);
  const pendingScrollTopRef = useRef<number | null>(null);
  const pendingScrollHeightRef = useRef<number | null>(null);
  const pendingScrollModeRef = useRef<RefreshMode | null>(null);
  const appendInFlightRef = useRef(false);
  const pendingRefreshAfterAppendRef = useRef<RefreshMode | null>(null);
  const autoLoadArmedRef = useRef(true);
  const lastRepoPathRef = useRef<string | null>(null);
  const lastSecondaryHistoryRef = useRef(showSecondaryHistory);
  const lastCommitRefreshTriggerRef = useRef(commitRefreshTrigger);
  const forceScrollToTopOnNextResetRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const layoutGenerationRef = useRef(0);
  const layoutWorkerRef = useRef<Worker | null>(null);

  const updateLayout = useCallback((commits: GitCommit[]) => {
    const generation = ++layoutGenerationRef.current;
    const worker = layoutWorkerRef.current;
    if (worker) {
      worker.postMessage({ generation, commits });
      return;
    }
    setLayout(computeGraphLayout(commits));
  }, []);

  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    const worker = new Worker(new URL('../../workers/graphLayout.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ generation: number; layout: GraphLayout }>) => {
      if (event.data.generation !== layoutGenerationRef.current) return;
      setLayout((current) => {
        if (!current) return event.data.layout;
        const currentByHash = new Map(
          current.nodes.map((node) => [node.commit.hash, node.commit]),
        );
        let changed = false;
        const nodes = event.data.layout.nodes.map((node) => {
          const currentCommit = currentByHash.get(node.commit.hash);
          if (!currentCommit) return node;
          const commit = mergeCommitStatsUpdate(node.commit, {
            stats: currentCommit.stats,
            state: currentCommit.statsState,
          });
          if (commit === node.commit) return node;
          changed = true;
          return { ...node, commit };
        });
        return changed ? { ...event.data.layout, nodes } : event.data.layout;
      });
    };
    layoutWorkerRef.current = worker;
    return () => {
      worker.terminate();
      layoutWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    onRepoClearedRef.current = onRepoCleared;
  }, [onRepoCleared]);

  const refreshCommits = useCallback(async (mode: RefreshMode = 'reset') => {
    if (!repoPath || !window.electronAPI) return;

    const isAppend = mode === 'append';
    const isSync = mode === 'sync';
    const isQuick = mode === 'quick';
    if (!isAppend && appendInFlightRef.current) {
      pendingRefreshAfterAppendRef.current = mode;
      return;
    }
    if (isAppend && appendInFlightRef.current) {
      return;
    }

    const shouldShowLoadingState = !layoutRef.current;
    const scrollContainer = logContainerRef.current?.parentElement ?? null;
    const forceTopOnRefresh = !isAppend && forceScrollToTopOnNextResetRef.current;
    const requestedLimitRaw = isAppend
      ? LOG_PAGE_SIZE
      : isQuick
        ? QUICK_REFRESH_LIMIT
        : LOG_PAGE_SIZE;
    const requestedLimit = Math.max(1, Math.min(requestedLimitRaw, LOG_MAX_LIMIT));
    const requestGeneration = ++requestGenerationRef.current;

    if ((isAppend || isSync || isQuick) && scrollContainer) {
      pendingScrollTopRef.current = (forceTopOnRefresh || isQuick) ? 0 : scrollContainer.scrollTop;
      pendingScrollHeightRef.current = isSync && !forceTopOnRefresh ? scrollContainer.scrollHeight : null;
      pendingScrollModeRef.current = forceTopOnRefresh ? 'reset' : isAppend ? 'append' : isQuick ? 'quick' : 'sync';
      if (forceTopOnRefresh) {
        forceScrollToTopOnNextResetRef.current = false;
      }
      if (isAppend) {
        appendInFlightRef.current = true;
        setLoadingMore(true);
      }
    } else {
      pendingScrollTopRef.current = forceTopOnRefresh ? 0 : (scrollContainer ? scrollContainer.scrollTop : null);
      pendingScrollHeightRef.current = null;
      pendingScrollModeRef.current = 'reset';
      if (forceTopOnRefresh) {
        forceScrollToTopOnNextResetRef.current = false;
      }
      if (shouldShowLoadingState) {
        setLoading(true);
      }
    }

    try {
      const scope = showSecondaryHistory ? 'all' : 'head';
      const offset = isAppend ? commitCountRef.current : 0;
      const result = await window.electronAPI.getCommitLogPage({
        limit: requestedLimit,
        offset,
        scope,
      });
      if (requestGeneration !== requestGenerationRef.current && !isAppend) return;
      if (result.success) {
        const data = result.data;
        const parsedChunk = parseGitLog(data.raw || '').slice(0, requestedLimit);
        const visibleChunk = applyCachedStats(parsedChunk, data.stats || {});
        const hasMore = data.hasMore;
        const cacheKey = getGraphCacheKey(repoPath, showSecondaryHistory);
        if (isAppend) {
          const merged = mergeUniqueCommits(layoutRef.current?.nodes.map((node) => node.commit) ?? [], visibleChunk);
          const nextCount = merged.length;
          commitCountRef.current = nextCount;
          setCommitCount(nextCount);
          setHasMoreCommits(hasMore);
          storeGraphCache(cacheKey, merged, hasMore);
          updateLayout(merged);
        } else if (isQuick || isSync) {
          const existing = layoutRef.current?.nodes.map((node) => node.commit) ?? [];
          const merged = mergeQuickRefreshCommits(existing, visibleChunk);
          commitCountRef.current = merged.length;
          setCommitCount(merged.length);
          setHasMoreCommits(hasMore || merged.length > visibleChunk.length);
          storeGraphCache(cacheKey, merged, hasMore || merged.length > visibleChunk.length);
          updateLayout(merged);
        } else {
          const normalized = mergeUniqueCommits([], visibleChunk);
          commitCountRef.current = normalized.length;
          setCommitCount(normalized.length);
          setHasMoreCommits(hasMore);
          storeGraphCache(cacheKey, normalized, hasMore);
          updateLayout(normalized);
        }
      } else {
        if (isRepoUnavailableError(String(result.error || ''))) {
          setLayout(null);
          setCommitCount(0);
          commitCountRef.current = 0;
          setHasMoreCommits(false);
          return;
        }
        console.error('Failed to fetch commits:', result.error);
      }
    } catch (e) {
      if (isRepoUnavailableError(String((e as any)?.message || e || ''))) {
        setLayout(null);
        setCommitCount(0);
        commitCountRef.current = 0;
        setHasMoreCommits(false);
        return;
      }
      console.error(e);
    } finally {
      if (isAppend) {
        appendInFlightRef.current = false;
        setLoadingMore(false);
        if (pendingRefreshAfterAppendRef.current) {
          const pendingMode = pendingRefreshAfterAppendRef.current;
          pendingRefreshAfterAppendRef.current = null;
          queueMicrotask(() => {
            void refreshCommits(pendingMode);
          });
        }
      } else if (shouldShowLoadingState) {
        setLoading(false);
      }
    }
  }, [logContainerRef, repoPath, showSecondaryHistory, updateLayout]);

  const loadMoreCommits = useCallback(async () => {
    if (loading || loadingMore || appendInFlightRef.current || !hasMoreCommits) return;
    autoLoadArmedRef.current = false;
    await refreshCommits('append');
  }, [hasMoreCommits, loading, loadingMore, refreshCommits]);

  const refreshWorkingTreeStatus = useCallback(async () => {
    if (onRefreshWorkingTree) {
      await onRefreshWorkingTree();
      return;
    }
    if (!repoPath || !window.electronAPI) return;
    try {
      const { success, data } = await window.electronAPI.runGitCommand('status', '-s');
      if (success) {
        setWorkingTreeStatus(parseGitStatusDetailed(data || ''));
      }
    } catch (e: any) {
      if (isRepoUnavailableError(String(e?.message || e || ''))) {
        setWorkingTreeStatus(null);
        return;
      }
      console.error(e);
    }
  }, [onRefreshWorkingTree, repoPath]);

  useEffect(() => {
    if (!repoPath) {
      setLayout(null);
      setCommitCount(0);
      commitCountRef.current = 0;
      setHasMoreCommits(true);
      setWorkingTreeStatus(null);
      layoutRef.current = null;
      pendingScrollTopRef.current = null;
      pendingScrollHeightRef.current = null;
      appendInFlightRef.current = false;
      pendingRefreshAfterAppendRef.current = null;
      autoLoadArmedRef.current = true;
      lastRepoPathRef.current = null;
      lastSecondaryHistoryRef.current = showSecondaryHistory;
      pendingScrollModeRef.current = null;
      forceScrollToTopOnNextResetRef.current = false;
      onRepoClearedRef.current?.();
      return;
    }

    const repoChanged = lastRepoPathRef.current !== repoPath;
    const historyModeChanged = lastSecondaryHistoryRef.current !== showSecondaryHistory;
    lastRepoPathRef.current = repoPath;
    lastSecondaryHistoryRef.current = showSecondaryHistory;
    if (repoChanged || historyModeChanged) {
      // Drop previous-repo state immediately to avoid transient sync refreshes
      // restoring stale scroll positions while the new repo is loading.
      setLayout(null);
      layoutRef.current = null;
      setCommitCount(0);
      commitCountRef.current = 0;
      setHasMoreCommits(true);
      setWorkingTreeStatus(null);
      pendingScrollTopRef.current = null;
      pendingScrollHeightRef.current = null;
      pendingScrollModeRef.current = null;
      appendInFlightRef.current = false;
      pendingRefreshAfterAppendRef.current = null;
      autoLoadArmedRef.current = true;
      forceScrollToTopOnNextResetRef.current = repoChanged;
      const cached = graphCache.get(getGraphCacheKey(repoPath, showSecondaryHistory));
      if (cached) {
        cached.touchedAt = Date.now();
        commitCountRef.current = cached.commits.length;
        setCommitCount(cached.commits.length);
        setHasMoreCommits(cached.hasMore);
        updateLayout(cached.commits);
      }
    }

    const mode: RefreshMode = commitCountRef.current === 0 ? 'reset' : 'sync';

    void refreshCommits(mode);
    void refreshWorkingTreeStatus();
  }, [refreshCommits, refreshWorkingTreeStatus, refreshTrigger, repoPath, showSecondaryHistory, updateLayout]);

  useEffect(() => {
    if (commitRefreshTrigger === lastCommitRefreshTriggerRef.current) return;
    lastCommitRefreshTriggerRef.current = commitRefreshTrigger;
    if (!repoPath) return;
    void refreshCommits('quick');
    void refreshWorkingTreeStatus();
  }, [commitRefreshTrigger, refreshCommits, refreshWorkingTreeStatus, repoPath]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    commitCountRef.current = commitCount;
  }, [commitCount]);

  useLayoutEffect(() => {
    if (pendingScrollTopRef.current === null) return;
    const scrollContainer = logContainerRef.current?.parentElement;
    if (!scrollContainer) {
      pendingScrollTopRef.current = null;
      pendingScrollHeightRef.current = null;
      pendingScrollModeRef.current = null;
      onRepoClearedRef.current?.();
      return;
    }

    const previousTop = pendingScrollTopRef.current;
    const previousHeight = pendingScrollHeightRef.current;
    const restoreMode = pendingScrollModeRef.current;

    if (restoreMode === 'sync' && typeof previousHeight === 'number') {
      const deltaHeight = scrollContainer.scrollHeight - previousHeight;
      scrollContainer.scrollTop = Math.max(0, previousTop + deltaHeight);
    } else {
      scrollContainer.scrollTop = previousTop;
    }

    pendingScrollTopRef.current = null;
    pendingScrollHeightRef.current = null;
    pendingScrollModeRef.current = null;
  }, [layout, logContainerRef]);

  useEffect(() => {
    if (onRefreshWorkingTree) return;
    if (!repoPath) return;
    const refreshIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void refreshWorkingTreeStatus();
    };
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refreshWorkingTreeStatus();
      }
    };

    const intervalId = window.setInterval(refreshIfVisible, 3000);
    window.addEventListener('focus', refreshIfVisible);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshIfVisible);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [refreshWorkingTreeStatus, onRefreshWorkingTree, repoPath]);

  useEffect(() => {
    const scrollContainer = logContainerRef.current?.parentElement;
    if (!scrollContainer) return;

    const onScroll = () => {
      const distanceToBottom = scrollContainer.scrollHeight - (scrollContainer.scrollTop + scrollContainer.clientHeight);
      if (distanceToBottom > AUTO_LOAD_RESET_PX) {
        autoLoadArmedRef.current = true;
      }

      if (loading || loadingMore || !hasMoreCommits) return;
      if (!autoLoadArmedRef.current) return;
      if (distanceToBottom <= AUTO_LOAD_TRIGGER_PX) {
        void loadMoreCommits();
      }
    };

    scrollContainer.addEventListener('scroll', onScroll);
    return () => scrollContainer.removeEventListener('scroll', onScroll);
  }, [hasMoreCommits, loadMoreCommits, loading, loadingMore, logContainerRef]);

  const updateCommitStats = useCallback((
    updates: Record<string, CommitStatsUpdate>,
  ) => {
    setLayout((current) => {
      if (!current) return current;
      let changed = false;
      const nodes = current.nodes.map((node) => {
        const update = updates[node.commit.hash];
        if (!update) return node;
        const commit = mergeCommitStatsUpdate(node.commit, update);
        if (commit === node.commit) return node;
        changed = true;
        return {
          ...node,
          commit,
        };
      });
      if (!changed) return current;
      const next = { ...current, nodes };
      if (repoPath) {
        storeGraphCache(
          getGraphCacheKey(repoPath, showSecondaryHistory),
          nodes.map((node) => node.commit),
          hasMoreCommits,
        );
      }
      return next;
    });
  }, [hasMoreCommits, repoPath, showSecondaryHistory]);

  const requestCommitStats = useCallback(async (
    hashes: string[],
    priority: 'selected' | 'visible' | 'background' = 'background',
  ) => {
    if (!repoPath || hashes.length === 0) return;
    const unique = [...new Set(hashes)].slice(0, 500);
    const result = await window.electronAPI.requestCommitStats(unique, priority);
    if (!result.success) return;
    const updates: Record<string, CommitStatsUpdate> = {};
    for (const [hash, value] of Object.entries(result.data)) {
      updates[hash] = {
        stats: value.stats,
        state: value.state,
      };
    }
    updateCommitStats(updates);
  }, [repoPath, updateCommitStats]);

  useEffect(() => {
    if (!repoPath) return;
    return window.electronAPI.onCommitStats((update) => {
      if (normalizeRepoPathKey(update.repoPath) !== normalizeRepoPathKey(repoPath)) return;
      updateCommitStats({
        [update.hash]: {
          stats: update.stats,
          state: update.state,
        },
      });
    });
  }, [repoPath, updateCommitStats]);

  const loadedCommitHashes = layout?.nodes.map((node) => node.commit.hash).join('\0') || '';

  useEffect(() => {
    if (!layout || !repoPath) return;
    const missing = layout.nodes
      .filter((node) => node.commit.statsState === 'missing' || node.commit.statsState === 'error')
      .map((node) => node.commit.hash);
    const enqueue = async () => {
      for (let offset = 0; offset < missing.length; offset += 500) {
        await requestCommitStats(missing.slice(offset, offset + 500), 'background');
      }
    };
    void enqueue();
  }, [loadedCommitHashes, repoPath, requestCommitStats]);

  return {
    layout,
    commitCount,
    workingTreeStatus: externalWorkingTreeStatus === undefined
      ? workingTreeStatus
      : externalWorkingTreeStatus,
    loading,
    loadingMore,
    hasMoreCommits,
    refreshCommits,
    loadMoreCommits,
    refreshWorkingTreeStatus,
    requestCommitStats,
  };
};
