import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DiffRequest } from '@/types/diff';
import type { EditorPosition } from '@/types/editor';
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

export type CommitHistoryEntry = { hash: string | null; diffRequest: DiffRequest | null };

export type WorkingDirectoryFileSelection = {
  path: string;
  repoPath: string;
  position?: EditorPosition;
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
  const [commitHistoryStack, setCommitHistoryStack] = useState<CommitHistoryEntry[]>([]);
  const activeRepoRef = useRef(activeRepo);
  activeRepoRef.current = activeRepo;
  const [workingTreeSelection, setWorkingTreeSelection] = useState<WorkingTreeSelection | null>(null);
  const [workingDirectoryFile, setWorkingDirectoryFile] = useState<WorkingDirectoryFileSelection | null>(null);
  const [isCommitInspectorOpen, setIsCommitInspectorOpen] = useState(false);
  const handledNavigationRequestIdRef = useRef<number | null>(null);
  const preserveNextNavigationHistoryRef = useRef(false);
  const pendingWorkingTreeCommitRef = useRef<{ repoPath: string; hash: string; path: string } | null>(null);
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
    pendingWorkingTreeCommitRef.current = null;
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
  const workingDirectoryFilePosition = workingDirectoryFile?.repoPath === activeRepo ? workingDirectoryFile?.position : undefined;

  useLayoutEffect(() => {
    const request = commitNavigationRequest;
    if (!request) return;
    if (handledNavigationRequestIdRef.current === request.requestId) return;
    handledNavigationRequestIdRef.current = request.requestId;

    onOpenRepoWorkspace();
    const pendingFile = pendingWorkingTreeCommitRef.current;
    pendingWorkingTreeCommitRef.current = null;
    setActiveDiffRequest(
      pendingFile?.repoPath === activeRepo && pendingFile.hash === request.hash ? { source: 'commit', path: pendingFile.path, commitHash: request.hash } : null,
    );
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
  }, [activeRepo, commitNavigationRequest, onOpenRepoWorkspace, setSelectedCommit, setActiveDiffRequest]);

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

      const previousDiff =
        activeDiffRequest?.source === 'commit' && normalizeCommitHash(activeDiffRequest.commitHash) === normalizeCommitHash(selectedCommit)
          ? activeDiffRequest
          : null;
      setCommitHistoryStack((prev) => [...prev, { hash: selectedCommit, diffRequest: previousDiff }]);
      setIsCommitInspectorOpen(true);
      if (onNavigateToCommit) {
        preserveNextNavigationHistoryRef.current = true;
        onNavigateToCommit(normalized);
      } else {
        setSelectedCommit(normalized);
      }
    },
    [activeDiffRequest, onNavigateToCommit, setSelectedCommit],
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
          setWorkingDirectoryFile(null);
          setShowRecoveryCenter(false);
          setActiveDiffRequest({ path, source });
        },
      );
    },
    [activeRepo, setSelectedCommit, setActiveDiffRequest],
  );

  const handleOpenWorkingDirectoryFile = useCallback(
    (path: string, position?: EditorPosition) => {
      if (!activeRepo) return;
      const proceed = () => {
        setActiveDiffRequest(null);
        setActiveConflictPath(null);
        setShowRecoveryCenter(false);
        setWorkingTreeSelection(null);
        setIsCommitInspectorOpen(false);
        setSelectedCommit(null);
        setWorkingDirectoryFile({ path, repoPath: activeRepo, position });
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
    (hash: string, path = workingTreeSelection?.path) => {
      const normalized = normalizeCommitHash(hash);
      if (!normalized || !path || !activeRepo) return;
      const targetDiff: DiffRequest = { source: 'commit', path, commitHash: normalized };
      requestWorkingDirectoryNavigation(
        { kind: 'file', path, identity: fileViewerIdentity(fileViewerRequestFromDiff(activeRepo, targetDiff)), view: 'diff' },
        () => {
          if (activeRepoRef.current !== activeRepo) return;
          const previousDiff = workingTreeSelection ? { ...workingTreeSelection } : null;
          setCommitHistoryStack([{ hash: null, diffRequest: previousDiff }]);
          setWorkingTreeSelection(null);
          setWorkingDirectoryFile(null);
          setActiveConflictPath(null);
          setIsCommitInspectorOpen(true);
          if (onNavigateToCommit) {
            pendingWorkingTreeCommitRef.current = { repoPath: activeRepo, hash: normalized, path };
            preserveNextNavigationHistoryRef.current = true;
            onNavigateToCommit(normalized);
          } else {
            setActiveDiffRequest(targetDiff);
            setSelectedCommit(normalized);
          }
        },
      );
    },
    [activeRepo, onNavigateToCommit, setActiveDiffRequest, setSelectedCommit, workingTreeSelection],
  );

  const handleCommitBack = useCallback(() => {
    const previous = commitHistoryStack.at(-1);
    if (!previous) return;
    const target =
      previous.diffRequest && activeRepo
        ? {
            kind: 'file' as const,
            path: previous.diffRequest.path,
            identity: fileViewerIdentity(fileViewerRequestFromDiff(activeRepo, previous.diffRequest)),
            view: 'diff' as const,
          }
        : { kind: 'view' as const, label: 'commit history' };
    requestWorkingDirectoryNavigation(target, () => {
      if (activeRepoRef.current !== activeRepo) return;
      setCommitHistoryStack((stack) => stack.slice(0, -1));
      setActiveConflictPath(null);
      setWorkingDirectoryFile(null);
      setWorkingTreeSelection(
        previous.diffRequest && previous.diffRequest.source !== 'commit' ? { path: previous.diffRequest.path, source: previous.diffRequest.source } : null,
      );
      setShowRecoveryCenter(false);
      setIsCommitInspectorOpen(Boolean(previous.hash));
      setSelectedCommit(normalizeCommitHash(previous.hash));
      setActiveDiffRequest(previous.diffRequest);
    });
  }, [activeRepo, commitHistoryStack, setActiveDiffRequest, setSelectedCommit]);

  const closeWorkingTreeFileDetails = useCallback(() => setWorkingTreeSelection(null), []);

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

  const handleStageCommitOpen = useCallback(
    (onOpened?: () => void, beforeOpen?: () => void) => {
      requestWorkingDirectoryNavigation({ kind: 'view', label: 'staging and commit' }, () => {
        beforeOpen?.();
        onOpenRepoWorkspace();
        setActiveDiffRequest(null);
        setActiveConflictPath(null);
        setShowRecoveryCenter(false);
        setWorkingDirectoryFile(null);
        handleSelectCommitDirect(null);
        onOpened?.();
      });
    },
    [handleSelectCommitDirect, onOpenRepoWorkspace, setActiveDiffRequest],
  );

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
    workingDirectoryFilePosition,
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
    closeWorkingTreeFileDetails,
    handleStageCommitOpen,
  };
};
