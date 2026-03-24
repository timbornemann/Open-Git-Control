import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type RefObject } from 'react';
import { computeGraphLayout, type GraphLayout } from '../../utils/graphLayout';
import { parseGitLog, parseGitStatusDetailed, type GitStatusDetailed } from '../../utils/gitParsing';

const LOG_PAGE_SIZE = 200;

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

  const refreshCommits = useCallback(async (mode: 'reset' | 'append' = 'reset') => {
    if (!repoPath || !window.electronAPI) return;

    const isAppend = mode === 'append';
    const shouldShowLoadingState = !layoutRef.current;
    const scrollContainer = logContainerRef.current?.parentElement ?? null;

    if (isAppend && scrollContainer) {
      pendingScrollTopRef.current = scrollContainer.scrollTop;
      pendingScrollHeightRef.current = scrollContainer.scrollHeight;
      setLoadingMore(true);
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
      const { success, data, error } = await window.electronAPI.runGitCommand('log', String(LOG_PAGE_SIZE), scope, String(offset));
      if (success) {
        const parsedChunk = parseGitLog(data || '');
        const nextCount = (isAppend ? commitCountRef.current : 0) + parsedChunk.length;
        commitCountRef.current = nextCount;
        setCommitCount(nextCount);
        setHasMoreCommits(parsedChunk.length === LOG_PAGE_SIZE);

        if (isAppend && layoutRef.current) {
          const merged = [...layoutRef.current.nodes.map((node) => node.commit), ...parsedChunk];
          setLayout(computeGraphLayout(merged));
        } else {
          setLayout(computeGraphLayout(parsedChunk));
        }
      } else {
        console.error('Failed to fetch commits:', error);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (isAppend) {
        setLoadingMore(false);
      } else if (shouldShowLoadingState) {
        setLoading(false);
      }
    }
  }, [logContainerRef, repoPath, showSecondaryHistory]);

  const loadMoreCommits = useCallback(async () => {
    if (loading || loadingMore || !hasMoreCommits) return;
    await refreshCommits('append');
  }, [hasMoreCommits, loading, loadingMore, refreshCommits]);

  const refreshWorkingTreeStatus = useCallback(async () => {
    if (!repoPath || !window.electronAPI) return;
    try {
      const { success, data } = await window.electronAPI.runGitCommand('status', '-s');
      if (success) {
        setWorkingTreeStatus(parseGitStatusDetailed(data || ''));
      }
    } catch (e) {
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
      onRepoCleared?.();
      return;
    }
    void refreshCommits();
    void refreshWorkingTreeStatus();
  }, [onRepoCleared, refreshCommits, refreshWorkingTreeStatus, refreshTrigger, repoPath]);

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
  }, [layout, logContainerRef, onRepoCleared, workingTreeStatus]);

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
