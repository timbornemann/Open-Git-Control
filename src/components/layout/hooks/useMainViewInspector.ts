import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DiffRequest } from '@/types/diff';
import { extractGitObjectId } from '@/utils/gitObjectId';

type WorkingTreeSelection = {
  path: string;
  source: 'staged' | 'unstaged';
};

export type WorkingDirectoryFileSelection = {
  path: string;
  repoPath: string;
};

export type WorkingDirectoryNavigationGuard = (nextPath: string, proceed: () => void) => void;

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
  return extractGitObjectId(value);
};

export const getActiveWorkingDirectoryFilePath = (selection: WorkingDirectoryFileSelection | null, activeRepo: string | null): string | null => {
  return selection?.repoPath === activeRepo ? selection.path : null;
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
  const [workingDirectoryFile, setWorkingDirectoryFile] = useState<WorkingDirectoryFileSelection | null>(null);
  const [isCommitInspectorOpen, setIsCommitInspectorOpen] = useState(false);
  const handledNavigationRequestIdRef = useRef<number | null>(null);
  const preserveNextNavigationHistoryRef = useRef(false);
  const workingDirectoryNavigationGuardRef = useRef<WorkingDirectoryNavigationGuard | null>(null);

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

  useLayoutEffect(() => {
    setActiveDiffRequest(null);
    setActiveConflictPath(null);
    setCommitHistoryStack([]);
    setWorkingTreeSelection(null);
    setWorkingDirectoryFile(null);
    setIsCommitInspectorOpen(false);
    setShowRecoveryCenter(false);
  }, [activeRepo]);

  // A file path is only meaningful in the repository from which it was
  // selected. Deriving the exposed value keeps a stale selection from ever
  // mounting a viewer against a newly active repository, even before the
  // repository-switch cleanup above has run.
  const workingDirectoryFilePath = getActiveWorkingDirectoryFilePath(workingDirectoryFile, activeRepo);

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

  const handleOpenWorkingDirectoryFile = useCallback(
    (path: string) => {
      if (!activeRepo) return;
      const proceed = () => {
        setActiveDiffRequest(null);
        setActiveConflictPath(null);
        setShowRecoveryCenter(false);
        setWorkingTreeSelection(null);
        setIsCommitInspectorOpen(false);
        setSelectedCommit(null);
        setWorkingDirectoryFile({ path, repoPath: activeRepo });
      };
      const guard = workingDirectoryNavigationGuardRef.current;
      if (guard) guard(path, proceed);
      else proceed();
    },
    [activeRepo, setSelectedCommit],
  );

  const setWorkingDirectoryNavigationGuard = useCallback((guard: WorkingDirectoryNavigationGuard | null) => {
    workingDirectoryNavigationGuardRef.current = guard;
  }, []);

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
    setWorkingDirectoryFile(null);
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
    setWorkingDirectoryFile(null);
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
    workingDirectoryFilePath,
    isCommitInspectorOpen,
    handleToggleRecoveryCenter,
    handleOpenDiff,
    handleOpenConflictResolver,
    handleSelectCommitDirect,
    handleSelectCommitFromHistory,
    handleSelectWorkingTreeFile,
    handleOpenWorkingDirectoryFile,
    setWorkingDirectoryNavigationGuard,
    handleSelectCommitFromWorkingTree,
    handleCommitBack,
    closeInspector,
    handleStageCommitOpen,
  };
};
