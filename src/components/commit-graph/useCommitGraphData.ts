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

const LOG_PAGE_SIZE = 200;
type RefreshMode = 'reset' | 'append' | 'sync';

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
  logContainerRef: RefObject<HTMLDivElement>;
  onRepoCleared?: () => void;
};

export const useCommitGraphData = ({
  repoPath,
  showSecondaryHistory,
  refreshTrigger,
  logContainerRef,
  onRepoCleared,
}: Params) => {
  const [layout, setLayout] = useState<GraphLayout | null>(null);
  const [commitCount, setCommitCount] = useState(0);
  const [workingTreeStatus, setWorkingTreeStatus] = useState<GitStatusDetailed | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreCommits, setHasMoreCommits] = useState(true);

  const commitCountRef = useRef(0);
  const layoutRef = useRef<GraphLayout | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const pendingScrollHeightRef = useRef<number | null>(null);
  const appendInFlightRef = useRef(false);
  const pendingSyncAfterAppendRef = useRef(false);
  const lastRepoPathRef = useRef<string | null>(null);
  const lastSecondaryHistoryRef = useRef(showSecondaryHistory);

  const refreshCommits = useCallback(async (mode: RefreshMode = 'reset') => {
    if (!repoPath || !window.electronAPI) return;

    const isAppend = mode === 'append';
    const isSync = mode === 'sync';
    if (!isAppend && appendInFlightRef.current) {
      pendingSyncAfterAppendRef.current = true;
      return;
    }
    if (isAppend && appendInFlightRef.current) {
      return;
    }

    const shouldShowLoadingState = !layoutRef.current;
    const scrollContainer = logContainerRef.current?.parentElement ?? null;
    const requestedLimit = isAppend
      ? LOG_PAGE_SIZE
      : isSync
        ? Math.max(LOG_PAGE_SIZE, commitCountRef.current)
        : LOG_PAGE_SIZE;

    if ((isAppend || isSync) && scrollContainer) {
      pendingScrollTopRef.current = scrollContainer.scrollTop;
      pendingScrollHeightRef.current = scrollContainer.scrollHeight;
      if (isAppend) {
        appendInFlightRef.current = true;
        setLoadingMore(true);
      }
    } else {
      pendingScrollTopRef.current = scrollContainer ? scrollContainer.scrollTop : null;
      pendingScrollHeightRef.current = null;
      if (shouldShowLoadingState) {
        setLoading(true);
      }
    }

    try {
      const scope = showSecondaryHistory ? 'all' : 'head';
      const offset = isAppend ? commitCountRef.current : 0;
      const { success, data, error } = await window.electronAPI.runGitCommand('log', String(requestedLimit), scope, String(offset));
      if (success) {
        const parsedChunk = parseGitLog(data || '');
        if (isAppend) {
          const merged = mergeUniqueCommits(layoutRef.current?.nodes.map((node) => node.commit) ?? [], parsedChunk);
          const nextCount = merged.length;
          commitCountRef.current = nextCount;
          setCommitCount(nextCount);
          setHasMoreCommits(parsedChunk.length === requestedLimit);
          setLayout(computeGraphLayout(merged));
        } else {
          const normalized = mergeUniqueCommits([], parsedChunk);
          commitCountRef.current = normalized.length;
          setCommitCount(normalized.length);
          setHasMoreCommits(parsedChunk.length >= requestedLimit);
          setLayout(computeGraphLayout(normalized));
        }
      } else {
        if (isRepoUnavailableError(String(error || ''))) {
          setLayout(null);
          setCommitCount(0);
          commitCountRef.current = 0;
          setHasMoreCommits(false);
          return;
        }
        console.error('Failed to fetch commits:', error);
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
        if (pendingSyncAfterAppendRef.current) {
          pendingSyncAfterAppendRef.current = false;
          queueMicrotask(() => {
            void refreshCommits('sync');
          });
        }
      } else if (shouldShowLoadingState) {
        setLoading(false);
      }
    }
  }, [logContainerRef, repoPath, showSecondaryHistory]);

  const loadMoreCommits = useCallback(async () => {
    if (loading || loadingMore || appendInFlightRef.current || !hasMoreCommits) return;
    await refreshCommits('append');
  }, [hasMoreCommits, loading, loadingMore, refreshCommits]);

  const refreshWorkingTreeStatus = useCallback(async () => {
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
  }, [repoPath]);

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
      pendingSyncAfterAppendRef.current = false;
      lastRepoPathRef.current = null;
      lastSecondaryHistoryRef.current = showSecondaryHistory;
      onRepoCleared?.();
      return;
    }

    const repoChanged = lastRepoPathRef.current !== repoPath;
    const historyModeChanged = lastSecondaryHistoryRef.current !== showSecondaryHistory;
    lastRepoPathRef.current = repoPath;
    lastSecondaryHistoryRef.current = showSecondaryHistory;

    const mode: RefreshMode = repoChanged || historyModeChanged || !layoutRef.current || commitCountRef.current === 0
      ? 'reset'
      : 'sync';

    void refreshCommits(mode);
    void refreshWorkingTreeStatus();
  }, [onRepoCleared, refreshCommits, refreshWorkingTreeStatus, refreshTrigger, repoPath, showSecondaryHistory]);

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
      onRepoCleared?.();
      return;
    }

    const previousTop = pendingScrollTopRef.current;
    const previousHeight = pendingScrollHeightRef.current;

    if (typeof previousHeight === 'number') {
      const deltaHeight = scrollContainer.scrollHeight - previousHeight;
      scrollContainer.scrollTop = Math.max(0, previousTop + deltaHeight);
    } else {
      scrollContainer.scrollTop = previousTop;
    }

    pendingScrollTopRef.current = null;
    pendingScrollHeightRef.current = null;
  }, [layout, logContainerRef, onRepoCleared]);

  useEffect(() => {
    if (!repoPath) return;
    const intervalId = window.setInterval(refreshWorkingTreeStatus, 3000);
    window.addEventListener('focus', refreshWorkingTreeStatus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshWorkingTreeStatus);
    };
  }, [refreshWorkingTreeStatus, repoPath]);

  useEffect(() => {
    const scrollContainer = logContainerRef.current?.parentElement;
    if (!scrollContainer) return;

    const onScroll = () => {
      if (loading || loadingMore || !hasMoreCommits) return;
      if (scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 220) {
        void loadMoreCommits();
      }
    };

    scrollContainer.addEventListener('scroll', onScroll);
    return () => scrollContainer.removeEventListener('scroll', onScroll);
  }, [hasMoreCommits, loadMoreCommits, loading, loadingMore, logContainerRef]);

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
  };
};
