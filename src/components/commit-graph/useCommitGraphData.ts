import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GraphLayout } from '@/utils/graphLayout';
import { isRepoUnavailableError, parseGitLog, type GitStatusDetailed } from '@/utils/gitParsing';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { gitClient } from '@/services/gitClient';
import { mergeCommitStatsUpdate, type CommitStatsUpdate } from './mergeCommitStatsUpdate';
import { mergeQuickRefreshCommits } from './mergeQuickRefreshCommits';
import {
  applyCachedStats,
  getGraphCacheEntry,
  getGraphCacheKey,
  LOG_MAX_LIMIT,
  LOG_PAGE_SIZE,
  mergeUniqueCommits,
  QUICK_REFRESH_LIMIT,
  storeGraphCache,
} from './commitGraphDataCache';
import { useGraphLayoutEngine } from './useGraphLayoutEngine';
import { useCommitGraphAutoLoad } from './useCommitGraphAutoLoad';
import { useCommitGraphWorkingTreeStatus } from './useCommitGraphWorkingTreeStatus';

type RefreshMode = 'reset' | 'append' | 'sync' | 'quick';

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

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error || ''));

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
  const lastRepoPathRef = useRef<string | null>(null);
  const lastSecondaryHistoryRef = useRef(showSecondaryHistory);
  const lastCommitRefreshTriggerRef = useRef(commitRefreshTrigger);
  const forceScrollToTopOnNextResetRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const updateLayout = useGraphLayoutEngine(setLayout);
  const { workingTreeStatus, refreshWorkingTreeStatus, clearWorkingTreeStatus } = useCommitGraphWorkingTreeStatus({
    repoPath,
    externalWorkingTreeStatus,
    onRefreshWorkingTree,
  });

  useEffect(() => {
    onRepoClearedRef.current = onRepoCleared;
  }, [onRepoCleared]);

  const refreshCommits = useCallback(
    async (mode: RefreshMode = 'reset') => {
      if (!repoPath || !gitClient.isAvailable()) return;

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
      const requestedLimitRaw = isAppend ? LOG_PAGE_SIZE : isQuick ? QUICK_REFRESH_LIMIT : LOG_PAGE_SIZE;
      const requestedLimit = Math.max(1, Math.min(requestedLimitRaw, LOG_MAX_LIMIT));
      const requestGeneration = ++requestGenerationRef.current;

      if ((isAppend || isSync || isQuick) && scrollContainer) {
        pendingScrollTopRef.current = forceTopOnRefresh || isQuick ? 0 : scrollContainer.scrollTop;
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
        pendingScrollTopRef.current = forceTopOnRefresh ? 0 : scrollContainer ? scrollContainer.scrollTop : null;
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
        const result = await gitClient.getCommitLogPage({
          repoPath,
          limit: requestedLimit,
          offset,
          scope,
        });
        if (requestGeneration !== requestGenerationRef.current) return;
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
      } catch (e: unknown) {
        if (requestGeneration !== requestGenerationRef.current) return;
        if (isRepoUnavailableError(errorMessage(e))) {
          setLayout(null);
          setCommitCount(0);
          commitCountRef.current = 0;
          setHasMoreCommits(false);
          return;
        }
        console.error(e);
      } finally {
        if (requestGeneration === requestGenerationRef.current) {
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
      }
    },
    [logContainerRef, repoPath, showSecondaryHistory, updateLayout],
  );

  const loadMoreCommits = useCallback(async () => {
    if (loading || loadingMore || appendInFlightRef.current || !hasMoreCommits) return;
    await refreshCommits('append');
  }, [hasMoreCommits, loading, loadingMore, refreshCommits]);

  useEffect(() => {
    if (!repoPath) {
      requestGenerationRef.current += 1;
      setLayout(null);
      setCommitCount(0);
      setLoading(false);
      setLoadingMore(false);
      commitCountRef.current = 0;
      setHasMoreCommits(true);
      clearWorkingTreeStatus();
      layoutRef.current = null;
      pendingScrollTopRef.current = null;
      pendingScrollHeightRef.current = null;
      appendInFlightRef.current = false;
      pendingRefreshAfterAppendRef.current = null;
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
      requestGenerationRef.current += 1;
      // Drop previous-repo state immediately to avoid transient sync refreshes
      // restoring stale scroll positions while the new repo is loading.
      setLayout(null);
      layoutRef.current = null;
      setCommitCount(0);
      setLoading(false);
      setLoadingMore(false);
      commitCountRef.current = 0;
      setHasMoreCommits(true);
      clearWorkingTreeStatus();
      pendingScrollTopRef.current = null;
      pendingScrollHeightRef.current = null;
      pendingScrollModeRef.current = null;
      appendInFlightRef.current = false;
      pendingRefreshAfterAppendRef.current = null;
      forceScrollToTopOnNextResetRef.current = repoChanged;
      const cached = getGraphCacheEntry(repoPath, showSecondaryHistory);
      if (cached) {
        commitCountRef.current = cached.commits.length;
        setCommitCount(cached.commits.length);
        setHasMoreCommits(cached.hasMore);
        updateLayout(cached.commits);
      }
    }

    const mode: RefreshMode = commitCountRef.current === 0 ? 'reset' : 'sync';

    void refreshCommits(mode);
    void refreshWorkingTreeStatus();
  }, [refreshCommits, refreshWorkingTreeStatus, refreshTrigger, repoPath, showSecondaryHistory, updateLayout, clearWorkingTreeStatus]);

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

  useCommitGraphAutoLoad({
    logContainerRef,
    loading,
    loadingMore,
    hasMoreCommits,
    loadMoreCommits,
  });

  // Always reflects the latest repoPath so async stats responses can detect a
  // repository change that happened while they were in flight.
  const repoPathRef = useRef(repoPath);
  repoPathRef.current = repoPath;

  const updateCommitStats = useCallback(
    (updates: Record<string, CommitStatsUpdate>) => {
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
    },
    [hasMoreCommits, repoPath, showSecondaryHistory],
  );

  const requestCommitStats = useCallback(
    async (hashes: string[], priority: 'selected' | 'visible' | 'background' = 'background') => {
      if (!repoPath || hashes.length === 0) return;
      const unique = [...new Set(hashes)].slice(0, 500);
      const result = await gitClient.requestCommitStats(unique, priority, repoPath);
      // Drop a stats response that arrived after the repository changed, so one
      // repository's stats never merge into another repository's graph or cache.
      if (normalizeRepoPathKey(repoPathRef.current || '') !== normalizeRepoPathKey(repoPath)) return;
      if (!result.success) return;
      const updates: Record<string, CommitStatsUpdate> = {};
      for (const [hash, value] of Object.entries(result.data)) {
        updates[hash] = {
          stats: value.stats,
          state: value.state,
        };
      }
      updateCommitStats(updates);
    },
    [repoPath, updateCommitStats],
  );

  useEffect(() => {
    if (!repoPath) return;
    return gitClient.onCommitStats((update) => {
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
    const missing = layout.nodes.filter((node) => node.commit.statsState === 'missing' || node.commit.statsState === 'error').map((node) => node.commit.hash);
    const enqueue = async () => {
      for (let offset = 0; offset < missing.length; offset += 500) {
        await requestCommitStats(missing.slice(offset, offset + 500), 'background');
      }
    };
    void enqueue();
  }, [layout, loadedCommitHashes, repoPath, requestCommitStats]);

  return {
    layout,
    commitCount,
    workingTreeStatus,
    loading,
    loadingMore,
    hasMoreCommits,
    refreshCommits,
    loadMoreCommits,
    refreshWorkingTreeStatus,
    requestCommitStats,
  };
};
