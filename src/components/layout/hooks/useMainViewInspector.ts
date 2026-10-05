import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DiffRequest } from '@/types/diff';
import { extractGitObjectId } from '@/utils/gitObjectId';
import { fileViewerIdentity, fileViewerRequestFromDiff, fileViewerRequestFromWorkingFile } from '@/components/file-viewer/fileViewerRequest';
import {
  requestWorkingDirectoryNavigation,
  setActiveWorkingDirectoryNavigationGuard,
  type WorkingDirectoryNavigationGuard,
} from '@/components/working-directory/workingDirectoryNavigationGuard';

type WorkingTreeSelection = {
  path: string;
  source: 'staged' | 'unstaged';
};

export type WorkingDirectoryFileSelection = {
  path: string;
  repoPath: string;
};

export type { WorkingDirectoryNavigationGuard } from '@/components/working-directory/workingDirectoryNavigationGuard';

type Params = {
  autoOpenConflictResolverPath?: string | null;
  onAutoOpenConflictResolverConsumed?: () => void;
  setSelectedCommit: (hash: string | null) => void;
  activeRepo: string | null;
  onOpenRepoWorkspace: () => void;
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
  commitNavigationRequest,
  onNavigateToCommit,
}: Params) => {
  const [diffSelection, setDiffSelection] = useState<{ request: DiffRequest; repoPath: string } | null>(null);
  const activeDiffRequest = diffSelection?.repoPath === activeRepo ? diffSelection.request : null;
  const setActiveDiffRequest = useCallback(
    (value: DiffRequest | null) => setDiffSelection(value && activeRepo ? { request: value, repoPath: activeRepo } : null),
    [activeRepo],
  );
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
    requestWorkingDirectoryNavigation({ kind: 'view', label: 'conflict resolver' }, () => {
      setActiveConflictPath(autoOpenConflictResolverPath);
      setActiveDiffRequest(null);
      setShowRecoveryCenter(false);
      setWorkingTreeSelection(null);
      setWorkingDirectoryFile(null);
      setIsCommitInspectorOpen(false);
      setCommitHistoryStack([]);
      setSelectedCommit(null);
      onAutoOpenConflictResolverConsumed?.();
    });
  }, [autoOpenConflictResolverPath, onAutoOpenConflictResolverConsumed, setSelectedCommit, setActiveDiffRequest]);

  useLayoutEffect(() => {
    setActiveDiffRequest(null);
    setActiveConflictPath(null);
    setCommitHistoryStack([]);
    setWorkingTreeSelection(null);
    setWorkingDirectoryFile(null);
    setIsCommitInspectorOpen(false);
    setShowRecoveryCenter(false);
  }, [activeRepo, setActiveDiffRequest]);

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
    setActiveDiffRequest(null);
    setActiveConflictPath(null);
    setShowRecoveryCenter(false);
    setWorkingTreeSelection(null);
    setWorkingDirectoryFile(null);
    setIsCommitInspectorOpen(true);
    if (preserveNextNavigationHistoryRef.current) {
      preserveNextNavigationHistoryRef.current = false;
    } else {
      setCommitHistoryStack([]);
    }
    setSelectedCommit(request.hash);
  }, [commitNavigationRequest, onOpenRepoWorkspace, setSelectedCommit, setActiveDiffRequest]);

  const handleToggleRecoveryCenter = useCallback(() => {
    requestWorkingDirectoryNavigation({ kind: 'view', label: 'recovery center' }, () => {
      setActiveDiffRequest(null);
      setActiveConflictPath(null);
      setWorkingDirectoryFile(null);
      setShowRecoveryCenter((prev) => !prev);
    });
  }, [setActiveDiffRequest]);

  const handleOpenDiff = useCallback(
    (diffRequest: DiffRequest) => {
      if (!activeRepo) return;
      requestWorkingDirectoryNavigation(
        { kind: 'file', path: diffRequest.path, identity: fileViewerIdentity(fileViewerRequestFromDiff(activeRepo, diffRequest)), view: 'diff' },
        () => {
          setActiveConflictPath(null);
          setWorkingDirectoryFile(null);
          setWorkingTreeSelection(diffRequest.source === 'commit' ? null : { path: diffRequest.path, source: diffRequest.source });
          setActiveDiffRequest(diffRequest);
        },
      );
    },
    [activeRepo, setActiveDiffRequest],
  );

  const handleOpenConflictResolver = useCallback(
    (filePath: string) => {
      requestWorkingDirectoryNavigation({ kind: 'view', label: `conflict resolver for "${filePath}"` }, () => {
        setActiveDiffRequest(null);
        setShowRecoveryCenter(false);
        setActiveConflictPath(filePath);
        setWorkingTreeSelection(null);
        setWorkingDirectoryFile(null);
        setCommitHistoryStack([]);
        setSelectedCommit(null);
      });
    },
    [setSelectedCommit, setActiveDiffRequest],
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
      if (!activeRepo) return;
      requestWorkingDirectoryNavigation(
        { kind: 'file', path, identity: fileViewerIdentity(fileViewerRequestFromDiff(activeRepo, { path, source })), view: 'diff' },
        () => {
          setCommitHistoryStack([]);
          setActiveConflictPath(null);
          setIsCommitInspectorOpen(false);
          setSelectedCommit(null);
          setWorkingTreeSelection({ path, source });
        },
      );
    },
    [activeRepo, setSelectedCommit],
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
      if (guard) guard({ kind: 'file', path, identity: fileViewerIdentity(fileViewerRequestFromWorkingFile(activeRepo, path)), view: 'text' }, proceed);
      else proceed();
    },
    [activeRepo, setSelectedCommit, setActiveDiffRequest],
  );

  const handleWorkingDirectoryEntryInvalidated = useCallback((entryPath: string) => {
    setWorkingDirectoryFile((current) => {
      if (!current || (current.path !== entryPath && !current.path.startsWith(`${entryPath}/`))) return current;
      return null;
    });
  }, []);

  const setWorkingDirectoryNavigationGuard = useCallback((guard: WorkingDirectoryNavigationGuard | null) => {
    workingDirectoryNavigationGuardRef.current = guard;
    setActiveWorkingDirectoryNavigationGuard(guard);
  }, []);

  useEffect(
    () => () => {
      setActiveWorkingDirectoryNavigationGuard(null);
    },
    [],
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
    requestWorkingDirectoryNavigation({ kind: 'view', label: 'graph' }, () => {
      setActiveDiffRequest(null);
      setWorkingDirectoryFile(null);
      setCommitHistoryStack([]);
      setWorkingTreeSelection(null);
      setActiveConflictPath(null);
      setIsCommitInspectorOpen(false);
    });
  }, [setActiveDiffRequest]);

  const handleStageCommitOpen = useCallback(() => {
    requestWorkingDirectoryNavigation({ kind: 'view', label: 'staging and commit' }, () => {
      onOpenRepoWorkspace();
      setActiveDiffRequest(null);
      setActiveConflictPath(null);
      setShowRecoveryCenter(false);
      setWorkingDirectoryFile(null);
      handleSelectCommitDirect(null);
    });
  }, [handleSelectCommitDirect, onOpenRepoWorkspace, setActiveDiffRequest]);

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
    handleWorkingDirectoryEntryInvalidated,
    setWorkingDirectoryNavigationGuard,
    handleSelectCommitFromWorkingTree,
    handleCommitBack,
    closeInspector,
    handleStageCommitOpen,
  };
};
