import { useRepositorySecretScanAllowlist } from '@/app/state/useRepositorySecretScanAllowlist';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useToastQueue } from '@/hooks/useToastQueue';
import { useDialogControllers } from './hooks/useDialogControllers';
import { useWorkspaceDomain } from './hooks/useWorkspaceDomain';
import { useRepositoryDomain } from './hooks/useRepositoryDomain';
import { useSidebarCollapseState } from './state/useSidebarCollapseState';
import { useBranchTrackingWorkflow } from './workflows/useBranchTrackingWorkflow';
import { useConflictResolverWorkflow } from './workflows/useConflictResolverWorkflow';
import { useGitCommandWorkflow } from './workflows/useGitCommandWorkflow';
import { useRepoUnavailableWorkflow } from './workflows/useRepoUnavailableWorkflow';
import { useRepositoryCreationWorkflow } from './workflows/useRepositoryCreationWorkflow';
import { useRepositoryCloneWorkflow } from './hooks/useRepositoryCloneWorkflow';
import { useGitJobEvents } from '@/app/state/useGitJobEvents';
import { useRepoScopedNavigationState } from '@/app/state/useRepoScopedNavigationState';
import { useSettingsState } from '@/app/state/useSettingsState';
import { useRepositoryRun } from '@/app/state/useRepositoryRun';
import type { HostedRepositoryRef } from '@/types/hostingDtos';
import { requestWorkingDirectoryNavigation } from '@/components/working-directory/workingDirectoryNavigationGuard';
import { prepareGitErrorNotification, type GitErrorEnvironment } from './workflows/gitErrorPresentation';
import type { NotificationMessage } from '@/types/notifications';
import { useHostingState } from '@/components/hosting/hostingState';
import { hideRemoteTransferResult } from '@/components/hosting/remoteTransferState';

export const useAppState = () => {
  const [plannerRefreshSignal, setPlannerRefreshSignal] = useState(0);
  const [isRunConfigOpen, setRunConfigOpen] = useState(false);
  const [isRemoteConfigOpen, setRemoteConfigOpen] = useState(false);
  const [isSecretScanAllowlistOpen, setSecretScanAllowlistOpen] = useState(false);
  const [isReleaseCreatorOpen, setReleaseCreatorOpen] = useState(false);
  const [isRepositoryPublicationOpen, setRepositoryPublicationOpen] = useState(false);
  const [publicationConnectionId, setPublicationConnectionId] = useState<string | undefined>();
  const [publicationReturnTab, setPublicationReturnTab] = useState<'repo' | 'hosting'>('repo');
  const [releaseCreatorTarget, setReleaseCreatorTarget] = useState<HostedRepositoryRef | null>(null);
  const [releaseReturnTab, setReleaseReturnTab] = useState<'repo' | 'hosting'>('repo');
  const errorEnvironment = useRef<GitErrorEnvironment | null>(null);
  const prepareNotification = useCallback((message: NotificationMessage) => prepareGitErrorNotification(message, () => errorEnvironment.current), []);

  const {
    toast: gitActionToast,
    toasts: gitActionToasts,
    setToast: setGitActionToast,
    dismiss: dismissToast,
    notifications,
  } = useToastQueue({
    autoHideMs: 3000,
    errorAutoHideMs: null,
    prepareMessage: prepareNotification,
  });

  const {
    confirmDialog,
    setConfirmDialog,
    inputDialog,
    setInputDialog,
    closeConfirmDialog,
    executeConfirmDialog,
    executeConfirmDialogSecondary,
    closeInputDialog,
    executeInputDialog,
  } = useDialogControllers();

  const { settings, handleUpdateSettings, updateSettingsWithResult, t, tr } = useSettingsState({ setGitActionToast });

  const {
    selectedCommit,
    setSelectedCommit,
    commitNavigationRequest,
    consumeCommitNavigationRequest,
    autoOpenConflictResolverPath,
    setAutoOpenConflictResolverPath,
    clearAutoOpenConflictResolverPath,
    refreshTrigger,
    triggerRefresh,
    commitRefreshTrigger,
    triggerCommitRefresh,
    resetRepoScopedUi,
    navigateToCommit: navigateToCommitRequest,
  } = useRepoScopedNavigationState({
    setConfirmDialog,
    setInputDialog,
  });

  const resetRepositoryView = useCallback(() => {
    resetRepoScopedUi();
    setSecretScanAllowlistOpen(false);
    setRunConfigOpen(false);
    setRemoteConfigOpen(false);
    setReleaseCreatorOpen(false);
    setRepositoryPublicationOpen(false);
    setReleaseCreatorTarget(null);
  }, [resetRepoScopedUi]);

  const { jobs, clearJobs } = useGitJobEvents();

  const workspace = useWorkspaceDomain({
    triggerRefresh,
    setConfirmDialog,
    setInputDialog,
    setGitActionToast,
    onRepoActivated: resetRepositoryView,
    onNoActiveRepo: resetRepositoryView,
    language: settings.language,
  });
  const setWorkspaceTab = workspace.setActiveTab;
  const onOpenSecretScanAllowlist = useCallback(() => {
    requestWorkingDirectoryNavigation({ kind: 'view', label: 'secret-scan allowlist' }, () => {
      setRunConfigOpen(false);
      setRemoteConfigOpen(false);
      setReleaseCreatorOpen(false);
      setRepositoryPublicationOpen(false);
      setWorkspaceTab('repo');
      setSecretScanAllowlistOpen(true);
    });
  }, [setWorkspaceTab]);
  useRepositorySecretScanAllowlist(workspace.activeRepo, settings.language, setGitActionToast, onOpenSecretScanAllowlist);
  const repositoryRun = useRepositoryRun({ activeRepo: workspace.activeRepo, triggerRefresh });
  const { activeGitActionLabel, activeGitCommand, isGitActionRunning, isGitActionRunningRef, runGitCommand, setActiveGitActionLabel } = useGitCommandWorkflow({
    workspace: {
      activeRepo: workspace.activeRepo,
      addOpenRepo: workspace.addOpenRepo,
      setActiveTab: workspace.setActiveTab,
    },
    settings,
    onUpdateSettings: handleUpdateSettings,
    triggerRefresh,
    setConfirmDialog,
    setGitActionToast,
    setConflictResolverPath: setAutoOpenConflictResolverPath,
  });

  const {
    activeSidebarCollapseState,
    sidebarGeneralCollapseState,
    toggleBranchPanelCollapsed,
    toggleTagPanelCollapsed,
    toggleRemotePanelCollapsed,
    toggleSubmodulePanelCollapsed,
    toggleRepoPanelCollapsed,
  } = useSidebarCollapseState({
    activeRepo: workspace.activeRepo,
  });

  useRepoUnavailableWorkflow({
    activeRepo: workspace.activeRepo,
    handleCloseRepo: workspace.handleCloseRepo,
    handleRecoverRepo: workspace.handleRecoverRepo,
    setPlannerRefreshSignal,
    setConfirmDialog,
    setGitActionToast,
    language: settings.language,
  });

  const { openConflictResolverForPath } = useConflictResolverWorkflow({
    setActiveTab: workspace.setActiveTab,
    setConflictResolverPath: setAutoOpenConflictResolverPath,
    setGitActionToast,
    triggerRefresh,
    language: settings.language,
  });

  const navigateToCommit = useCallback(
    (hash: string) => navigateToCommitRequest(hash, workspace.setActiveTab),
    [navigateToCommitRequest, workspace.setActiveTab],
  );

  const repository = useRepositoryDomain({
    activeRepo: workspace.activeRepo,
    refreshTrigger,
    triggerRefresh,
    setGitActionToast,
    setActiveGitActionLabel,
    isGitActionRunningRef,
    runGitCommand,
    setConfirmDialog,
    setInputDialog,
    autoFetchIntervalMs: settings.autoFetchIntervalMs,
    language: settings.language,
    onNavigateToCommit: navigateToCommit,
  });

  useLayoutEffect(() => {
    const openWorkspace = () =>
      requestWorkingDirectoryNavigation({ kind: 'view', label: 'repository workspace' }, () => {
        hideRemoteTransferResult();
        resetRepositoryView();
        workspace.setActiveTab('repo');
      });
    errorEnvironment.current = {
      repoPath: workspace.activeRepo,
      tr,
      notify: notifications.publish,
      openWorkspace,
      openRepositories: () =>
        requestWorkingDirectoryNavigation({ kind: 'view', label: 'repository list' }, () => {
          hideRemoteTransferResult();
          workspace.setActiveTab('localRepos');
        }),
      openAccounts: (connectionId) =>
        requestWorkingDirectoryNavigation({ kind: 'view', label: 'hosting accounts' }, () => {
          hideRemoteTransferResult();
          useHostingState.getState().navigate('connections');
          if (connectionId) useHostingState.getState().requestConnectionEditor(connectionId);
          workspace.setActiveTab('hosting');
        }),
      openRemoteConfiguration: () =>
        requestWorkingDirectoryNavigation({ kind: 'view', label: 'remote configuration' }, () => {
          hideRemoteTransferResult();
          resetRepositoryView();
          setRemoteConfigOpen(true);
          workspace.setActiveTab('repo');
        }),
      openConflict: (path) =>
        requestWorkingDirectoryNavigation({ kind: 'view', label: 'conflict resolver' }, () => {
          hideRemoteTransferResult();
          openConflictResolverForPath(path);
        }),
    };
  }, [workspace, tr, notifications, resetRepositoryView, openConflictResolverForPath]);

  const clone = useRepositoryCloneWorkflow({
    onRepoCloned: workspace.addOpenRepo,
    setActiveTab: workspace.setActiveTab,
    t,
  });
  const { handleCloneByUrl } = useRepositoryCreationWorkflow({
    cloneRepository: clone.cloneRepository,
    setInputDialog,
    setGitActionToast,
    t,
    tr,
  });

  const { handleCheckoutRemoteBranch, handleSetUpstreamForCurrentBranch } = useBranchTrackingWorkflow({
    activeRepo: workspace.activeRepo,
    currentBranch: repository.currentBranch,
    runGitCommand,
    setGitActionToast,
    language: settings.language,
  });

  return {
    activeTab: workspace.activeTab,
    setActiveTab: workspace.setActiveTab,
    isRunConfigOpen,
    onOpenRunConfig: () => {
      setRepositoryPublicationOpen(false);
      setSecretScanAllowlistOpen(false);
      setReleaseCreatorOpen(false);
      setRemoteConfigOpen(false);
      setRunConfigOpen(true);
    },
    onCloseRunConfig: () => setRunConfigOpen(false),
    isRemoteConfigOpen,
    onOpenRemoteConfig: () => {
      setRepositoryPublicationOpen(false);
      setSecretScanAllowlistOpen(false);
      setReleaseCreatorOpen(false);
      setRunConfigOpen(false);
      setRemoteConfigOpen(true);
      workspace.setActiveTab('repo');
    },
    onCloseRemoteConfig: () => setRemoteConfigOpen(false),
    isSecretScanAllowlistOpen,
    onCloseSecretScanAllowlist: () => setSecretScanAllowlistOpen(false),
    onOpenSecretScanAllowlist,
    isReleaseCreatorOpen,
    releaseCreatorTarget,
    onOpenReleaseCreator: (target?: HostedRepositoryRef) => {
      requestWorkingDirectoryNavigation({ kind: 'view', label: 'release' }, () => {
        setSecretScanAllowlistOpen(false);
        setRepositoryPublicationOpen(false);
        setRunConfigOpen(false);
        setRemoteConfigOpen(false);
        setReleaseCreatorTarget(target ?? null);
        setReleaseReturnTab(target ? 'hosting' : 'repo');
        workspace.setActiveTab('repo');
        setReleaseCreatorOpen(true);
      });
    },
    onCloseReleaseCreator: () => {
      setReleaseCreatorOpen(false);
      workspace.setActiveTab(releaseReturnTab);
    },
    isRepositoryPublicationOpen,
    publicationConnectionId,
    onOpenRepositoryPublication: (connectionId?: string) => {
      requestWorkingDirectoryNavigation({ kind: 'view', label: 'repository publication' }, () => {
        setSecretScanAllowlistOpen(false);
        setRunConfigOpen(false);
        setRemoteConfigOpen(false);
        setReleaseCreatorOpen(false);
        repositoryRun.closeRunConsole();
        setPublicationConnectionId(connectionId);
        setPublicationReturnTab(workspace.activeTab === 'hosting' || workspace.activeTab === 'github' ? 'hosting' : 'repo');
        workspace.setActiveTab('repo');
        setRepositoryPublicationOpen(true);
      });
    },
    onCloseRepositoryPublication: () => {
      setRepositoryPublicationOpen(false);
      workspace.setActiveTab(publicationReturnTab);
    },
    openRepos: workspace.openRepos,
    isRestoringRepos: workspace.isRestoringRepos,
    repoMeta: workspace.repoMeta,
    repoSortBy: workspace.repoSortBy,
    setRepoSortBy: workspace.setRepoSortBy,
    activeRepo: workspace.activeRepo,
    addOpenRepo: workspace.addOpenRepo,
    handleOpenFolder: workspace.handleOpenFolder,
    handleSwitchRepo: workspace.handleSwitchRepo,
    handleCloseRepo: workspace.handleCloseRepo,
    handleToggleRepoPin: workspace.toggleRepoPin,
    handleSetRepoPins: workspace.setRepoPins,

    refreshTrigger,
    triggerRefresh,
    commitRefreshTrigger,
    triggerCommitRefresh,
    selectedCommit,
    setSelectedCommit,
    commitNavigationRequest,
    consumeCommitNavigationRequest,
    onNavigateToCommit: navigateToCommit,
    autoOpenConflictResolverPath,
    clearAutoOpenConflictResolverPath,
    openConflictResolverForPath,

    isGitActionRunning,
    activeGitCommand,
    activeGitActionLabel,
    runGitCommand,
    gitActionToast,
    gitActionToasts,
    setGitActionToast,
    dismissToast,
    notifications,

    branches: repository.branches,
    currentBranch: repository.currentBranch,
    isCreatingBranch: repository.isCreatingBranch,
    setIsCreatingBranch: repository.setIsCreatingBranch,
    branchContextMenu: repository.branchContextMenu,
    setBranchContextMenu: repository.setBranchContextMenu,
    isBranchPanelCollapsed: activeSidebarCollapseState.branchPanelCollapsed,
    toggleBranchPanelCollapsed,
    isTagPanelCollapsed: activeSidebarCollapseState.tagPanelCollapsed,
    toggleTagPanelCollapsed,
    isRepoPanelCollapsed: sidebarGeneralCollapseState.repoPanelCollapsed,
    toggleRepoPanelCollapsed,

    tags: repository.tags,
    tagConflicts: repository.tagConflicts,
    remotes: repository.remotes,
    submodules: repository.submodules,
    hasRemoteOrigin: repository.hasRemoteOrigin,
    remoteSync: repository.remoteSync,
    remoteStatus: repository.remoteStatus,
    refreshRemoteState: repository.refreshRemoteState,
    isRemotePanelCollapsed: activeSidebarCollapseState.remotePanelCollapsed,
    toggleRemotePanelCollapsed,
    isSubmodulePanelCollapsed: activeSidebarCollapseState.submodulePanelCollapsed,
    toggleSubmodulePanelCollapsed,

    handleCreateBranch: repository.handleCreateBranch,
    handleDeleteBranch: repository.handleDeleteBranch,
    handleMergeBranch: repository.handleMergeBranch,
    handleRenameBranch: repository.handleRenameBranch,
    handleCreateTag: repository.handleCreateTag,
    handleDeleteTag: repository.handleDeleteTag,
    handleSelectTag: repository.handleSelectTag,
    handlePushTags: repository.handlePushTags,
    handleAddRemote: repository.handleAddRemote,
    handleRemoveRemote: repository.handleRemoveRemote,
    handleRenameRemote: repository.handleRenameRemote,
    handleSetRemoteUrl: repository.handleSetRemoteUrl,
    handleSubmoduleInitUpdate: repository.handleSubmoduleInitUpdate,
    handleSubmoduleSync: repository.handleSubmoduleSync,
    handleOpenSubmodule: repository.handleOpenSubmodule,
    handleSetUpstreamForCurrentBranch,
    handleCheckoutRemoteBranch,

    isCloning: clone.isCloning,
    closeCloneProgress: clone.closeCloneProgress,
    cloneLog: clone.cloneLog,
    cloneRepoName: clone.cloneRepoName,
    cloneFinished: clone.cloneFinished,
    cloneError: clone.cloneError,
    handleCloneByUrl,

    settings,
    handleUpdateSettings,
    updateSettingsWithResult,
    plannerRefreshSignal,
    jobs,
    clearJobs,
    ...repositoryRun,

    confirmDialog,
    setConfirmDialog,
    inputDialog,
    setInputDialog,
    closeConfirmDialog,
    executeConfirmDialog,
    executeConfirmDialogSecondary,
    closeInputDialog,
    executeInputDialog,
  };
};
