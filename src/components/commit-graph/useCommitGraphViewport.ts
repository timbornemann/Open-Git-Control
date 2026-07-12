import { useCallback, useEffect, useRef, useState } from 'react';
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
  onNavigationRequestHandled?: (requestId: number) => void;
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
  onNavigationRequestHandled,
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

  const requestNavigationRetry = useCallback(() => {
    if (navigationRetryFrameRef.current !== null) return;
    navigationRetryFrameRef.current = window.requestAnimationFrame(() => {
      navigationRetryFrameRef.current = null;
      setNavigationRetryTick((current) => current + 1);
    });
  }, []);

  const completeNavigationRequest = useCallback(
    (requestId: number) => {
      navigationAttemptRef.current = null;
      completedNavigationRequestIdRef.current = requestId;
      onNavigationRequestHandled?.(requestId);
    },
    [onNavigationRequestHandled],
  );

  useEffect(
    () => () => {
      if (navigationRetryFrameRef.current !== null) {
        window.cancelAnimationFrame(navigationRetryFrameRef.current);
        navigationRetryFrameRef.current = null;
      }
    },
    [],
  );

  const syncViewportMetrics = useCallback((container: HTMLElement, measuredHeight?: number) => {
    const nextTop = container.scrollTop;
    const nextHeight = measuredHeight ?? container.clientHeight;
    setScrollTop((previous) => (previous === nextTop ? previous : nextTop));
    if (nextHeight > 0) {
      setContainerHeight((previous) => (previous === nextHeight ? previous : nextHeight));
    }
  }, []);

  const scrollToCommitIndex = useCallback(
    (nodeIndex: number) => {
      const container = logContainerRef.current?.parentElement;
      if (!container || nodeIndex < 0) return;
      const workingTreeRowOffset =
        workingTreeStatus && (workingTreeStatus.staged.length > 0 || workingTreeStatus.unstaged.length > 0 || workingTreeStatus.untracked.length > 0) ? 1 : 0;
      const rowTop = (nodeIndex + workingTreeRowOffset) * ROW_HEIGHT;
      const targetTop = Math.max(0, rowTop - Math.max(0, (container.clientHeight - ROW_HEIGHT) / 2));
      container.scrollTo({ top: targetTop, behavior: 'smooth' });
      setScrollTop(targetTop);
    },
    [logContainerRef, workingTreeStatus],
  );

  useEffect(() => {
    if (!layout) return;
    const container = logContainerRef.current?.parentElement;
    if (!container) return;

    const onScroll = () => {
      syncViewportMetrics(container);
    };
    let resizeObserver: ResizeObserver | null = null;
    let initialFrameId: number | null = null;
    let initialTimeoutId: number | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries.find((candidate) => candidate.target === container);
        if (entry) syncViewportMetrics(container, entry.contentRect.height);
      });
      resizeObserver.observe(container);
    } else {
      if (typeof window.requestAnimationFrame === 'function') {
        initialFrameId = window.requestAnimationFrame(() => syncViewportMetrics(container));
      } else {
        initialTimeoutId = window.setTimeout(() => syncViewportMetrics(container), 0);
      }
    }

    container.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      if (initialFrameId !== null) window.cancelAnimationFrame(initialFrameId);
      if (initialTimeoutId !== null) window.clearTimeout(initialTimeoutId);
      container.removeEventListener('scroll', onScroll);
      resizeObserver?.disconnect();
    };
  }, [layout, logContainerRef, repoPath, syncViewportMetrics]);

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
      completeNavigationRequest(navigationRequest.requestId);
      return;
    }

    if (!hasMoreCommits) {
      completeNavigationRequest(navigationRequest.requestId);
      return;
    }
    if (loadingMore || loading) return;

    const attempts = navigationAttemptRef.current?.attempts ?? 0;
    if (attempts >= NAVIGATION_MAX_LOAD_ATTEMPTS) {
      completeNavigationRequest(navigationRequest.requestId);
      return;
    }

    navigationAttemptRef.current = {
      requestId: navigationRequest.requestId,
      attempts: attempts + 1,
    };
    void loadMoreCommits();
  }, [
    hasMoreCommits,
    completeNavigationRequest,
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
    scrollToCommitIndex,
  };
};
