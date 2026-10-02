import { errorMessage, isGitOperationAborted, requestDeferredFrame, cancelDeferredFrame, cancelDeferredRetry } from './commitGraphRequestUtils';
import { useCachedResult } from '@/data/resourceHooks';
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { historyRevision, subscribeHistoryRevision } from '@/data/historyRevision';
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
  graphQueryKey,
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
  const graphScopeKey = getGraphCacheKey(repoPath || '', showSecondaryHistory);
  const revision = useSyncExternalStore(subscribeHistoryRevision, () => historyRevision(repoPath || ''));
  const lastRevisionRef = useRef(revision);
  useCachedResult(graphQueryKey(graphScopeKey));
  const cachedAtMount = repoPath ? getGraphCacheEntry(repoPath, showSecondaryHistory) : undefined;
  const [layout, setLayout] = useState<GraphLayout | null>(() => cachedAtMount?.layout || null);
  const [commitCount, setCommitCount] = useState(() => cachedAtMount?.commits.length || 0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMoreCommits, setHasMoreCommits] = useState(cachedAtMount?.hasMore ?? true);
  // A restored/worker layout can arrive while the live request is still pending.
  // Once it is usable, no request's loading flag may hide it.
  const isInitialLoading = loading && !layout;

  const commitCountRef = useRef(0);
  const layoutRef = useRef<GraphLayout | null>(cachedAtMount?.layout || null);
  const onRepoClearedRef = useRef(onRepoCleared);
  const pendingScrollTopRef = useRef<number | null>(null);
  const pendingScrollHeightRef = useRef<number | null>(null);
  const pendingScrollModeRef = useRef<RefreshMode | null>(null);
  const appendInFlightRef = useRef(false);
  const pendingRefreshAfterAppendRef = useRef<RefreshMode | null>(null);
  const lastRepoPathRef = useRef<string | null>(null);
  const lastSecondaryHistoryRef = useRef(showSecondaryHistory);
  const layoutBelongsToRepository =
    lastRepoPathRef.current === repoPath && lastSecondaryHistoryRef.current === showSecondaryHistory && lastRevisionRef.current === revision;
  const lastCommitRefreshTriggerRef = useRef(commitRefreshTrigger);
  const forceScrollToTopOnNextResetRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const abortRetryTimeoutRef = useRef<number | null>(null);
  const scrollRestoreFrameRef = useRef<number | null>(null);
  const updateLayout = useGraphLayoutEngine(setLayout, repoPath || '', `${graphScopeKey}\0${revision}`);
  const { workingTreeStatus, refreshWorkingTreeStatus, clearWorkingTreeStatus } = useCommitGraphWorkingTreeStatus({
    repoPath,
    externalWorkingTreeStatus,
    onRefreshWorkingTree,
  });

  useEffect(() => {
    onRepoClearedRef.current = onRepoCleared;
  }, [onRepoCleared]);

  useEffect(
    () => () => {
      requestGenerationRef.current += 1;
      cancelDeferredRetry(abortRetryTimeoutRef);
      if (scrollRestoreFrameRef.current !== null) {
        cancelDeferredFrame(scrollRestoreFrameRef.current);
        scrollRestoreFrameRef.current = null;
      }
    },
    [],
  );

  const refreshCommits = useCallback(
    async (mode: RefreshMode = 'reset', retryAttempt = 0) => {
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

      const scrollContainer = logContainerRef.current?.parentElement ?? null;
      const forceTopOnRefresh = !isAppend && forceScrollToTopOnNextResetRef.current;
      const requestedLimitRaw = isAppend ? LOG_PAGE_SIZE : isQuick ? QUICK_REFRESH_LIMIT : LOG_PAGE_SIZE;
      const requestedLimit = Math.max(1, Math.min(requestedLimitRaw, LOG_MAX_LIMIT));
      const requestGeneration = ++requestGenerationRef.current;
      const requestRevision = historyRevision(repoPath);
      let retryScheduled = false;
      cancelDeferredRetry(abortRetryTimeoutRef);
      setLoadError(null);
      // Loading belongs to the latest request, independently of whether the
      // graph's scroll container is mounted yet.
      if (isAppend) {
        appendInFlightRef.current = true;
        setLoadingMore(true);
      } else {
        setLoading(!layoutRef.current);
      }

      if ((isAppend || isSync || isQuick) && scrollContainer) {
        pendingScrollTopRef.current = forceTopOnRefresh || isQuick ? 0 : scrollContainer.scrollTop;
        pendingScrollHeightRef.current = isSync && !forceTopOnRefresh ? scrollContainer.scrollHeight : null;
        pendingScrollModeRef.current = forceTopOnRefresh ? 'reset' : isAppend ? 'append' : isQuick ? 'quick' : 'sync';
      } else {
        pendingScrollTopRef.current = forceTopOnRefresh ? 0 : scrollContainer ? scrollContainer.scrollTop : null;
        pendingScrollHeightRef.current = null;
        pendingScrollModeRef.current = 'reset';
      }

      const handleFailure = (error: unknown) => {
        if (isGitOperationAborted(error) && retryAttempt < 2) {
          retryScheduled = true;
          abortRetryTimeoutRef.current = window.setTimeout(
            () => {
              abortRetryTimeoutRef.current = null;
              if (requestGeneration === requestGenerationRef.current) void refreshCommits(mode, retryAttempt + 1);
            },
            100 * (retryAttempt + 1),
          );
          return;
        }
        const message = errorMessage(error);
        setLoadError(message || 'Failed to fetch commits.');
        if (isRepoUnavailableError(message)) {
          setLayout(null);
          layoutRef.current = null;
          setCommitCount(0);
          commitCountRef.current = 0;
          setHasMoreCommits(false);
        }
        console.error('Failed to fetch commits:', error);
      };

      try {
        const scope = showSecondaryHistory ? 'all' : 'head';
        const offset = isAppend ? commitCountRef.current : 0;
        const result = await gitClient.getCommitLogPage({
          repoPath,
          limit: requestedLimit,
          offset,
          scope,
        });
        if (requestGeneration !== requestGenerationRef.current || requestRevision !== historyRevision(repoPath)) return;
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
            await updateLayout(merged);
          } else if (isQuick || isSync) {
            const existing = layoutRef.current?.nodes.map((node) => node.commit) ?? [];
            const merged = mergeQuickRefreshCommits(existing, visibleChunk);
            commitCountRef.current = merged.length;
            setCommitCount(merged.length);
            setHasMoreCommits(hasMore || merged.length > visibleChunk.length);
            storeGraphCache(cacheKey, merged, hasMore || merged.length > visibleChunk.length);
            await updateLayout(merged);
          } else {
            const normalized = mergeUniqueCommits([], visibleChunk);
            commitCountRef.current = normalized.length;
            setCommitCount(normalized.length);
            setHasMoreCommits(hasMore);
            storeGraphCache(cacheKey, normalized, hasMore);
            await updateLayout(normalized);
          }
        } else {
          handleFailure(result.error);
        }
      } catch (e: unknown) {
        if (requestGeneration !== requestGenerationRef.current) return;
        handleFailure(e);
      } finally {
        if (requestGeneration === requestGenerationRef.current) {
          if (isAppend) {
            appendInFlightRef.current = false;
            setLoadingMore(false);
            if (pendingRefreshAfterAppendRef.current) {
              const pendingMode = pendingRefreshAfterAppendRef.current;
              pendingRefreshAfterAppendRef.current = null;
              queueMicrotask(() => {
                if (requestGeneration === requestGenerationRef.current) void refreshCommits(pendingMode);
              });
            }
          } else if (!retryScheduled) {
            setLoading(false);
          }
        }
      }
    },
    [logContainerRef, repoPath, showSecondaryHistory, updateLayout],
  );

  const loadMoreCommits = useCallback(async () => {
    if (isInitialLoading || loadingMore || appendInFlightRef.current || !hasMoreCommits) return;
    await refreshCommits('append');
  }, [hasMoreCommits, isInitialLoading, loadingMore, refreshCommits]);

  useLayoutEffect(() => {
    if (!repoPath) {
      requestGenerationRef.current += 1;
      cancelDeferredRetry(abortRetryTimeoutRef);
      setLayout(null);
      setCommitCount(0);
      setLoading(false);
      setLoadingMore(false);
      setLoadError(null);
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
    const historyRewritten = lastRevisionRef.current !== revision;
    lastRevisionRef.current = revision;
    const historyModeChanged = lastSecondaryHistoryRef.current !== showSecondaryHistory;
    lastRepoPathRef.current = repoPath;
    lastSecondaryHistoryRef.current = showSecondaryHistory;
    if (repoChanged || historyModeChanged || historyRewritten) {
      requestGenerationRef.current += 1;
      cancelDeferredRetry(abortRetryTimeoutRef);
      // Drop previous-repo state immediately to avoid transient sync refreshes
      // restoring stale scroll positions while the new repo is loading.
      setLayout(null);
      layoutRef.current = null;
      setCommitCount(0);
      setLoading(false);
      setLoadingMore(false);
      setLoadError(null);
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
        if (cached.layout) {
          setLayout(cached.layout);
          layoutRef.current = cached.layout;
        } else {
          // The live refresh below owns retry/error handling. Preparing the
          // preview must not leave an unhandled rejection if it is superseded.
          void updateLayout(cached.commits).catch(() => {});
        }
      }
    }

    const mode: RefreshMode = commitCountRef.current === 0 ? 'reset' : 'sync';

    void refreshCommits(mode);
    void refreshWorkingTreeStatus();
  }, [refreshCommits, refreshWorkingTreeStatus, refreshTrigger, repoPath, showSecondaryHistory, updateLayout, clearWorkingTreeStatus, revision]);

  useLayoutEffect(() => {
    if (layoutRef.current || !cachedAtMount?.layout) return;
    layoutRef.current = cachedAtMount.layout;
    setLayout(cachedAtMount.layout);
    setCommitCount(cachedAtMount.commits.length);
    setHasMoreCommits(cachedAtMount.hasMore);
  }, [cachedAtMount]);

  useEffect(() => {
    if (commitRefreshTrigger === lastCommitRefreshTriggerRef.current) return;
    lastCommitRefreshTriggerRef.current = commitRefreshTrigger;
    if (!repoPath) return;
    void refreshCommits('quick');
    void refreshWorkingTreeStatus();
  }, [commitRefreshTrigger, refreshCommits, refreshWorkingTreeStatus, repoPath]);

  useEffect(() => {
    if (!layoutBelongsToRepository) return;
    layoutRef.current = layout;
    if (layout && repoPath)
      storeGraphCache(
        getGraphCacheKey(repoPath, showSecondaryHistory),
        layout.nodes.map((node) => node.commit),
        hasMoreCommits,
        layout,
      );
  }, [layout, repoPath, showSecondaryHistory, hasMoreCommits, layoutBelongsToRepository]);

  useEffect(() => {
    commitCountRef.current = commitCount;
  }, [commitCount]);

  useEffect(() => {
    if (pendingScrollTopRef.current === null) return;
    scrollRestoreFrameRef.current = requestDeferredFrame(() => {
      scrollRestoreFrameRef.current = null;
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
      if (previousTop === null) return;

      if (restoreMode === 'sync' && typeof previousHeight === 'number') {
        const deltaHeight = scrollContainer.scrollHeight - previousHeight;
        scrollContainer.scrollTop = Math.max(0, previousTop + deltaHeight);
      } else {
        scrollContainer.scrollTop = previousTop;
      }

      // A repository change can trigger several refreshes before any resulting
      // layout commits. Keep every one of those refreshes pinned to the top; only
      // release the marker after the first new layout was actually rendered.
      if (restoreMode === 'reset') {
        forceScrollToTopOnNextResetRef.current = false;
      }

      pendingScrollTopRef.current = null;
      pendingScrollHeightRef.current = null;
      pendingScrollModeRef.current = null;
    });

    return () => {
      if (scrollRestoreFrameRef.current !== null) {
        cancelDeferredFrame(scrollRestoreFrameRef.current);
        scrollRestoreFrameRef.current = null;
      }
    };
  }, [layout, logContainerRef]);

  useCommitGraphAutoLoad({
    logContainerRef,
    loading: isInitialLoading,
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
    loading: isInitialLoading,
    loadingMore,
    loadError,
    hasMoreCommits,
    refreshCommits,
    loadMoreCommits,
    refreshWorkingTreeStatus,
    requestCommitStats,
  };
};
