import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DiffRequest } from '@/types/diff';

type WorkingTreeSelection = {
  path: string;
  source: 'staged' | 'unstaged';
};

type Params = {
  autoOpenConflictResolverPath?: string | null;
  onAutoOpenConflictResolverConsumed?: () => void;
  setSelectedCommit: (hash: string | null) => void;
  activeRepo: string | null;
  onOpenRepoWorkspace: () => void;
  onCloseReleaseCreator: () => void;
  commitNavigationRequest?: { hash: string; requestId: number } | null;
  onNavigateToCommit?: (hash: string) => void;
};

const normalizeCommitHash = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const match = String(value).match(/[0-9a-f]{7,40}/i);
  return match ? match[0] : null;
};

export const useMainViewInspector = ({
  autoOpenConflictResolverPath,
  onAutoOpenConflictResolverConsumed,
  setSelectedCommit,
  activeRepo,
  onOpenRepoWorkspace,
  onCloseReleaseCreator,
  commitNavigationRequest,
  onNavigateToCommit,
}: Params) => {
  const [activeDiffRequest, setActiveDiffRequest] = useState<DiffRequest | null>(null);
  const [activeConflictPath, setActiveConflictPath] = useState<string | null>(null);
  const [showRecoveryCenter, setShowRecoveryCenter] = useState(false);
  const [commitHistoryStack, setCommitHistoryStack] = useState<string[]>([]);
  const [workingTreeSelection, setWorkingTreeSelection] = useState<WorkingTreeSelection | null>(null);
  const [isCommitInspectorOpen, setIsCommitInspectorOpen] = useState(false);
  const handledNavigationRequestIdRef = useRef<number | null>(null);
  const preserveNextNavigationHistoryRef = useRef(false);

  useEffect(() => {
    if (!autoOpenConflictResolverPath) return;
    setActiveConflictPath(autoOpenConflictResolverPath);
    setActiveDiffRequest(null);
    setShowRecoveryCenter(false);
    setWorkingTreeSelection(null);
    setIsCommitInspectorOpen(false);
    setCommitHistoryStack([]);
    setSelectedCommit(null);
    onAutoOpenConflictResolverConsumed?.();
  }, [autoOpenConflictResolverPath, onAutoOpenConflictResolverConsumed, setSelectedCommit]);

  useEffect(() => {
    setActiveDiffRequest(null);
    setActiveConflictPath(null);
    setCommitHistoryStack([]);
    setWorkingTreeSelection(null);
    setIsCommitInspectorOpen(false);
    setShowRecoveryCenter(false);
  }, [activeRepo]);

  useLayoutEffect(() => {
    const request = commitNavigationRequest;
    if (!request) return;
    if (handledNavigationRequestIdRef.current === request.requestId) return;
    handledNavigationRequestIdRef.current = request.requestId;

    onOpenRepoWorkspace();
    onCloseReleaseCreator();
    setActiveDiffRequest(null);
    setActiveConflictPath(null);
    setShowRecoveryCenter(false);
    setWorkingTreeSelection(null);
    setIsCommitInspectorOpen(true);
    if (preserveNextNavigationHistoryRef.current) {
      preserveNextNavigationHistoryRef.current = false;
    } else {
      setCommitHistoryStack([]);
    }
    setSelectedCommit(request.hash);
  }, [commitNavigationRequest, onCloseReleaseCreator, onOpenRepoWorkspace, setSelectedCommit]);

  const handleToggleRecoveryCenter = useCallback(() => {
    setActiveDiffRequest(null);
    setActiveConflictPath(null);
    setShowRecoveryCenter((prev) => !prev);
  }, []);

  const handleOpenDiff = useCallback((diffRequest: DiffRequest) => {
    setActiveConflictPath(null);
    setActiveDiffRequest((previous) => {
      if (previous && previous.source === diffRequest.source && previous.path === diffRequest.path && previous.commitHash === diffRequest.commitHash) {
        return previous;
      }
      return diffRequest;
    });
  }, []);

  const handleOpenConflictResolver = useCallback(
    (filePath: string) => {
      setActiveDiffRequest(null);
      setShowRecoveryCenter(false);
      setActiveConflictPath(filePath);
      setWorkingTreeSelection(null);
      setCommitHistoryStack([]);
      setSelectedCommit(null);
    },
    [setSelectedCommit],
  );

  const handleSelectCommitDirect = useCallback(
    (hash: string | null) => {
      const normalized = normalizeCommitHash(hash);
      setWorkingTreeSelection(null);
      setActiveConflictPath(null);
      setCommitHistoryStack([]);
      setIsCommitInspectorOpen(Boolean(normalized));
      setSelectedCommit(normalized);
    },
    [setSelectedCommit],
  );

  const handleSelectCommitFromHistory = useCallback(
    (hash: string, selectedCommit: string | null) => {
      const normalized = normalizeCommitHash(hash);
      if (!normalized) return;

      if (!selectedCommit) {
        setIsCommitInspectorOpen(true);
        if (onNavigateToCommit) {
          onNavigateToCommit(normalized);
        } else {
          setSelectedCommit(normalized);
        }
        return;
      }

      if (selectedCommit === normalized) return;

      setCommitHistoryStack((prev) => [...prev, selectedCommit]);
      setIsCommitInspectorOpen(true);
      if (onNavigateToCommit) {
        preserveNextNavigationHistoryRef.current = true;
        onNavigateToCommit(normalized);
      } else {
        setSelectedCommit(normalized);
      }
    },
    [onNavigateToCommit, setSelectedCommit],
  );

  const handleSelectWorkingTreeFile = useCallback(
    (path: string, source: 'staged' | 'unstaged') => {
      setCommitHistoryStack([]);
      setActiveConflictPath(null);
      setIsCommitInspectorOpen(false);
      setSelectedCommit(null);
      setWorkingTreeSelection({ path, source });
    },
    [setSelectedCommit],
  );

  const handleSelectCommitFromWorkingTree = useCallback(
    (hash: string) => {
      const normalized = normalizeCommitHash(hash);
      if (!normalized) return;
      setWorkingTreeSelection(null);
      setActiveConflictPath(null);
      setIsCommitInspectorOpen(true);
      if (onNavigateToCommit) {
        onNavigateToCommit(normalized);
      } else {
        setSelectedCommit(normalized);
      }
    },
    [onNavigateToCommit, setSelectedCommit],
  );

  const handleCommitBack = useCallback(() => {
    setCommitHistoryStack((prev) => {
      if (prev.length === 0) return prev;
      const nextHash = normalizeCommitHash(prev[prev.length - 1]);
      setIsCommitInspectorOpen(Boolean(nextHash));
      setSelectedCommit(nextHash);
      return prev.slice(0, -1);
    });
  }, [setSelectedCommit]);

  const closeInspector = useCallback(() => {
    setActiveDiffRequest(null);
    setCommitHistoryStack([]);
    setWorkingTreeSelection(null);
    setActiveConflictPath(null);
    setIsCommitInspectorOpen(false);
  }, []);

  const handleStageCommitOpen = useCallback(() => {
    onOpenRepoWorkspace();
    onCloseReleaseCreator();
    setActiveDiffRequest(null);
    setActiveConflictPath(null);
    setShowRecoveryCenter(false);
    handleSelectCommitDirect(null);
  }, [handleSelectCommitDirect, onCloseReleaseCreator, onOpenRepoWorkspace]);

  return {
    activeDiffRequest,
    setActiveDiffRequest,
    activeConflictPath,
    setActiveConflictPath,
    showRecoveryCenter,
    setShowRecoveryCenter,
    commitHistoryStack,
    workingTreeSelection,
    isCommitInspectorOpen,
    handleToggleRecoveryCenter,
    handleOpenDiff,
    handleOpenConflictResolver,
    handleSelectCommitDirect,
    handleSelectCommitFromHistory,
    handleSelectWorkingTreeFile,
    handleSelectCommitFromWorkingTree,
    handleCommitBack,
    closeInspector,
    handleStageCommitOpen,
  };
};
