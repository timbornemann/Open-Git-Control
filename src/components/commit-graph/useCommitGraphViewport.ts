import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { GitStatusDetailed } from '@/utils/gitParsing';
import type { GraphLayout } from '@/utils/graphLayout';
import { ROW_HEIGHT } from './commitGraphConstants';
import { findCommitIndexByNavigationTarget } from './commitGraphRefs';

const NAVIGATION_MAX_LOAD_ATTEMPTS = 50;

type CommitNavigationRequest = {
  hash: string;
  requestId: number;
};

type UseCommitGraphViewportParams = {
  logContainerRef: RefObject<HTMLDivElement | null>;
  layout: GraphLayout | null;
  repoPath: string | null;
  navigationRequest?: CommitNavigationRequest | null;
  workingTreeStatus: GitStatusDetailed | null;
  hasMoreCommits: boolean;
  loadingMore: boolean;
  loading: boolean;
  loadMoreCommits: () => Promise<void>;
};

export const useCommitGraphViewport = ({
  logContainerRef,
  layout,
  repoPath,
  navigationRequest,
  workingTreeStatus,
  hasMoreCommits,
  loadingMore,
  loading,
  loadMoreCommits,
}: UseCommitGraphViewportParams) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(800);
  const navigationAttemptRef = useRef<{ requestId: number; attempts: number } | null>(null);
  const completedNavigationRequestIdRef = useRef<number | null>(null);
  const navigationRetryFrameRef = useRef<number | null>(null);
  const [navigationRetryTick, setNavigationRetryTick] = useState(0);
  const topResetLockRef = useRef<{
    repoPath: string | null;
    activeUntil: number;
    userReleased: boolean;
  }>({ repoPath: null, activeUntil: 0, userReleased: false });

  const requestNavigationRetry = useCallback(() => {
    if (navigationRetryFrameRef.current !== null) return;
    navigationRetryFrameRef.current = window.requestAnimationFrame(() => {
      navigationRetryFrameRef.current = null;
      setNavigationRetryTick((current) => current + 1);
    });
  }, []);

  useEffect(
    () => () => {
      if (navigationRetryFrameRef.current !== null) {
        window.cancelAnimationFrame(navigationRetryFrameRef.current);
        navigationRetryFrameRef.current = null;
      }
    },
    [],
  );

  const syncViewportMetrics = useCallback((container: HTMLElement) => {
    const nextTop = container.scrollTop;
    const nextHeight = container.clientHeight;
    setScrollTop((previous) => (previous === nextTop ? previous : nextTop));
    if (nextHeight > 0) {
      setContainerHeight((previous) => (previous === nextHeight ? previous : nextHeight));
    }
  }, []);

  const resetCommitListScroll = useCallback(() => {
    const container = logContainerRef.current?.parentElement;
    if (!container) return;

    container.scrollTop = 0;
    setScrollTop(0);
    const nextHeight = container.clientHeight;
    if (nextHeight > 0) {
      setContainerHeight((previous) => (previous === nextHeight ? previous : nextHeight));
    }
  }, [logContainerRef]);

  const maybeKeepCommitListAtTop = useCallback(() => {
    if (!repoPath || navigationRequest) return;
    const lock = topResetLockRef.current;
    if (lock.repoPath !== repoPath || lock.userReleased) return;
    if (Date.now() > lock.activeUntil) return;
    resetCommitListScroll();
  }, [navigationRequest, repoPath, resetCommitListScroll]);

  useLayoutEffect(() => {
    if (!layout) return;
    const container = logContainerRef.current?.parentElement;
    if (!container) return;

    const onScroll = () => {
      syncViewportMetrics(container);
    };
    const onWindowResize = () => {
      syncViewportMetrics(container);
    };

    syncViewportMetrics(container);
    const rafId = window.requestAnimationFrame(() => {
      syncViewportMetrics(container);
    });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        syncViewportMetrics(container);
      });
      resizeObserver.observe(container);
    }

    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onWindowResize);

    return () => {
      window.cancelAnimationFrame(rafId);
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onWindowResize);
      resizeObserver?.disconnect();
    };
  }, [layout, logContainerRef, repoPath, syncViewportMetrics]);

  useLayoutEffect(() => {
    if (navigationRequest) return;
    topResetLockRef.current = {
      repoPath,
      activeUntil: Date.now() + 4000,
      userReleased: false,
    };
    resetCommitListScroll();
    let secondFrameId: number | null = null;
    const firstFrameId = window.requestAnimationFrame(() => {
      resetCommitListScroll();
      secondFrameId = window.requestAnimationFrame(resetCommitListScroll);
    });
    const settleIntervalId = window.setInterval(() => {
      maybeKeepCommitListAtTop();
    }, 120);
    const releaseTimerId = window.setTimeout(() => {
      if (topResetLockRef.current.repoPath === repoPath) {
        topResetLockRef.current.activeUntil = 0;
      }
    }, 4200);

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      window.clearInterval(settleIntervalId);
      window.clearTimeout(releaseTimerId);
      if (secondFrameId !== null) {
        window.cancelAnimationFrame(secondFrameId);
      }
    };
  }, [maybeKeepCommitListAtTop, navigationRequest, repoPath, resetCommitListScroll]);

  useLayoutEffect(() => {
    maybeKeepCommitListAtTop();
  }, [layout, loading, workingTreeStatus, maybeKeepCommitListAtTop]);

  useEffect(() => {
    const container = logContainerRef.current?.parentElement;
    if (!container) return;

    const releaseTopLock = () => {
      const lock = topResetLockRef.current;
      if (lock.repoPath === repoPath) {
        lock.userReleased = true;
        lock.activeUntil = 0;
      }
    };
    const releaseTopLockOnKey = (event: KeyboardEvent) => {
      if (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) return;
      releaseTopLock();
    };

    container.addEventListener('wheel', releaseTopLock, { passive: true });
    container.addEventListener('touchstart', releaseTopLock, { passive: true });
    container.addEventListener('pointerdown', releaseTopLock);
    window.addEventListener('keydown', releaseTopLockOnKey);

    return () => {
      container.removeEventListener('wheel', releaseTopLock);
      container.removeEventListener('touchstart', releaseTopLock);
      container.removeEventListener('pointerdown', releaseTopLock);
      window.removeEventListener('keydown', releaseTopLockOnKey);
    };
  }, [logContainerRef, repoPath]);

  useEffect(() => {
    if (!navigationRequest || !layout) return;
    if (completedNavigationRequestIdRef.current === navigationRequest.requestId) return;

    if (navigationAttemptRef.current?.requestId !== navigationRequest.requestId) {
      navigationAttemptRef.current = { requestId: navigationRequest.requestId, attempts: 0 };
    }

    const nodeIndex = findCommitIndexByNavigationTarget(layout.nodes, navigationRequest.hash);
    if (nodeIndex >= 0) {
      const container = logContainerRef.current?.parentElement;
      if (!container || container.clientHeight <= 0 || container.scrollHeight <= 0) {
        requestNavigationRetry();
        return;
      }

      const workingTreeRowOffset =
        workingTreeStatus && (workingTreeStatus.staged.length > 0 || workingTreeStatus.unstaged.length > 0 || workingTreeStatus.untracked.length > 0) ? 1 : 0;
      const rowTop = (nodeIndex + workingTreeRowOffset) * ROW_HEIGHT;
      const targetTop = Math.max(0, rowTop - Math.max(0, (container.clientHeight - ROW_HEIGHT) / 2));
      container.scrollTo({ top: targetTop, behavior: 'smooth' });
      navigationAttemptRef.current = null;
      completedNavigationRequestIdRef.current = navigationRequest.requestId;
      return;
    }

    if (!hasMoreCommits) {
      navigationAttemptRef.current = null;
      completedNavigationRequestIdRef.current = navigationRequest.requestId;
      return;
    }
    if (loadingMore || loading) return;

    const attempts = navigationAttemptRef.current?.attempts ?? 0;
    if (attempts >= NAVIGATION_MAX_LOAD_ATTEMPTS) {
      navigationAttemptRef.current = null;
      completedNavigationRequestIdRef.current = navigationRequest.requestId;
      return;
    }

    navigationAttemptRef.current = {
      requestId: navigationRequest.requestId,
      attempts: attempts + 1,
    };
    void loadMoreCommits();
  }, [
    hasMoreCommits,
    layout,
    loadMoreCommits,
    loading,
    loadingMore,
    logContainerRef,
    navigationRetryTick,
    navigationRequest,
    requestNavigationRetry,
    workingTreeStatus,
  ]);

  return {
    scrollTop,
    containerHeight,
  };
};
