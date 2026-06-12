import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiffRequest } from '../../../types/diff';

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
}: Params) => {
  const [activeDiffRequest, setActiveDiffRequest] = useState<DiffRequest | null>(null);
  const [activeConflictPath, setActiveConflictPath] = useState<string | null>(null);
  const [showRecoveryCenter, setShowRecoveryCenter] = useState(false);
  const [commitHistoryStack, setCommitHistoryStack] = useState<string[]>([]);
  const [workingTreeSelection, setWorkingTreeSelection] = useState<WorkingTreeSelection | null>(null);
  const handledNavigationRequestIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!autoOpenConflictResolverPath) return;
    setActiveConflictPath(autoOpenConflictResolverPath);
    setActiveDiffRequest(null);
    setShowRecoveryCenter(false);
    setWorkingTreeSelection(null);
    setCommitHistoryStack([]);
    setSelectedCommit(null);
    onAutoOpenConflictResolverConsumed?.();
  }, [autoOpenConflictResolverPath, onAutoOpenConflictResolverConsumed, setSelectedCommit]);

  useEffect(() => {
    setActiveDiffRequest(null);
    setActiveConflictPath(null);
    setCommitHistoryStack([]);
    setWorkingTreeSelection(null);
    setShowRecoveryCenter(false);
  }, [activeRepo]);

  useEffect(() => {
    if (!commitNavigationRequest) return;
    if (handledNavigationRequestIdRef.current === commitNavigationRequest.requestId) return;
    handledNavigationRequestIdRef.current = commitNavigationRequest.requestId;

    onOpenRepoWorkspace();
    onCloseReleaseCreator();
    setActiveDiffRequest(null);
    setActiveConflictPath(null);
    setShowRecoveryCenter(false);
    setWorkingTreeSelection(null);
    setCommitHistoryStack([]);
    setSelectedCommit(commitNavigationRequest.hash);
  }, [
    commitNavigationRequest?.requestId,
    commitNavigationRequest?.hash,
    onCloseReleaseCreator,
    onOpenRepoWorkspace,
    setSelectedCommit,
  ]);

  const handleToggleRecoveryCenter = useCallback(() => {
    setActiveDiffRequest(null);
    setActiveConflictPath(null);
    setShowRecoveryCenter((prev) => !prev);
  }, []);

  const handleOpenDiff = useCallback((diffRequest: DiffRequest) => {
    setActiveConflictPath(null);
    setActiveDiffRequest((previous) => {
      if (
        previous
        && previous.source === diffRequest.source
        && previous.path === diffRequest.path
        && previous.commitHash === diffRequest.commitHash
      ) {
        return previous;
      }
      return diffRequest;
    });
  }, []);

  const handleOpenConflictResolver = useCallback((filePath: string) => {
    setActiveDiffRequest(null);
    setShowRecoveryCenter(false);
    setActiveConflictPath(filePath);
    setWorkingTreeSelection(null);
    setCommitHistoryStack([]);
    setSelectedCommit(null);
  }, [setSelectedCommit]);

  const handleSelectCommitDirect = useCallback((hash: string | null) => {
    const normalized = normalizeCommitHash(hash);
    setWorkingTreeSelection(null);
    setActiveConflictPath(null);
    setCommitHistoryStack([]);
    setSelectedCommit(normalized);
  }, [setSelectedCommit]);

  const handleSelectCommitFromHistory = useCallback((hash: string, selectedCommit: string | null) => {
    const normalized = normalizeCommitHash(hash);
    if (!normalized) return;

    if (!selectedCommit) {
      setSelectedCommit(normalized);
      return;
    }

    if (selectedCommit === normalized) return;

    setCommitHistoryStack((prev) => [...prev, selectedCommit]);
    setSelectedCommit(normalized);
  }, [setSelectedCommit]);

  const handleSelectWorkingTreeFile = useCallback((path: string, source: 'staged' | 'unstaged') => {
    setCommitHistoryStack([]);
    setActiveConflictPath(null);
    setSelectedCommit(null);
    setWorkingTreeSelection({ path, source });
  }, [setSelectedCommit]);

  const handleSelectCommitFromWorkingTree = useCallback((hash: string) => {
    const normalized = normalizeCommitHash(hash);
    if (!normalized) return;
    setWorkingTreeSelection(null);
    setActiveConflictPath(null);
    setSelectedCommit(normalized);
  }, [setSelectedCommit]);

  const handleCommitBack = useCallback(() => {
    setCommitHistoryStack((prev) => {
      if (prev.length === 0) return prev;
      const nextHash = normalizeCommitHash(prev[prev.length - 1]);
      setSelectedCommit(nextHash);
      return prev.slice(0, -1);
    });
  }, [setSelectedCommit]);

  const closeInspector = useCallback(() => {
    setCommitHistoryStack([]);
    setWorkingTreeSelection(null);
    setActiveConflictPath(null);
    setSelectedCommit(null);
  }, [setSelectedCommit]);

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
