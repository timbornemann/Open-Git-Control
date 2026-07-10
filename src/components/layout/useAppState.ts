import { useCallback, useState } from 'react';
import { useToastQueue } from '@/hooks/useToastQueue';
import { useDialogControllers } from './hooks/useDialogControllers';
import { useWorkspaceDomain } from './hooks/useWorkspaceDomain';
import { useRepositoryDomain } from './hooks/useRepositoryDomain';
import { useGithubDomain } from './hooks/useGithubDomain';
import { usePullRequests } from '@/hooks/usePullRequests';
import { githubClient } from '@/services/githubClient';
import { useSidebarCollapseState } from './state/useSidebarCollapseState';
import { usePrAndReleaseState } from './state/usePrAndReleaseState';
import { useBranchTrackingWorkflow } from './workflows/useBranchTrackingWorkflow';
import { useConflictResolverWorkflow } from './workflows/useConflictResolverWorkflow';
import { useGitCommandWorkflow } from './workflows/useGitCommandWorkflow';
import { usePullRequestWorkflow } from './workflows/usePullRequestWorkflow';
import { useRepoUnavailableWorkflow } from './workflows/useRepoUnavailableWorkflow';
import { useRepositoryCreationWorkflow } from './workflows/useRepositoryCreationWorkflow';
import { useReleaseWorkflow } from './workflows/useReleaseWorkflow';
import { useGitJobEvents } from '@/app/state/useGitJobEvents';
import { useRepoScopedNavigationState } from '@/app/state/useRepoScopedNavigationState';
import { useSettingsState } from '@/app/state/useSettingsState';

export const useAppState = () => {
  const [plannerRefreshSignal, setPlannerRefreshSignal] = useState(0);

  const {
    showCreatePR,
    setShowCreatePR,
    newPRTitle,
    setNewPRTitle,
    newPRBody,
    setNewPRBody,
    newPRHead,
    setNewPRHead,
    newPRBase,
    setNewPRBase,
    releaseForm,
    setReleaseFormState,
    releaseSubmitting,
    setReleaseSubmitting,
    releaseError,
    setReleaseError,
    releaseSuccess,
    setReleaseSuccess,
    showReleaseCreator,
    setShowReleaseCreator,
    releaseContextLoading,
    setReleaseContextLoading,
    releaseContextError,
    setReleaseContextError,
    releaseContext,
    setReleaseContext,
    releaseNotesGenerating,
    setReleaseNotesGenerating,
    releaseNotesLanguage,
    setReleaseNotesLanguage,
    releaseNotesOptions,
    setReleaseNotesOptions,
  } = usePrAndReleaseState();

  const {
    toast: gitActionToast,
    toasts: gitActionToasts,
    setToast: setGitActionToast,
    dismiss: dismissToast,
  } = useToastQueue({
    autoHideMs: 3000,
    errorAutoHideMs: null,
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

  const { settings, handleUpdateSettings, t, tr } = useSettingsState({ setGitActionToast });

  const {
    selectedCommit,
    setSelectedCommit,
    commitNavigationRequest,
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
    setShowCreatePR,
    setNewPRTitle,
    setNewPRBody,
    setNewPRHead,
    setNewPRBase,
    setShowReleaseCreator,
    setReleaseFormState,
    setReleaseSubmitting,
    setReleaseError,
    setReleaseSuccess,
    setReleaseContextLoading,
    setReleaseContext,
    setReleaseContextError,
    setReleaseNotesGenerating,
  });

  const { jobs, clearJobs } = useGitJobEvents();

  const workspace = useWorkspaceDomain({
    triggerRefresh,
    setConfirmDialog,
    setGitActionToast,
    onRepoActivated: resetRepoScopedUi,
    onNoActiveRepo: resetRepoScopedUi,
    language: settings.language,
  });
  const {
    activeGitActionLabel,
    activeGitCommand,
    connectError,
    createGithubRepoAndConnect,
    forceGithubRepoCreationPrompt,
    isConnectingGithubRepo,
    isGitActionRunning,
    isGitActionRunningRef,
    newRepoDescription,
    newRepoName,
    newRepoPrivate,
    runGitCommand,
    setActiveGitActionLabel,
    setConnectError,
    setNewRepoDescription,
    setNewRepoName,
    setNewRepoPrivate,
  } = useGitCommandWorkflow({
    workspace: {
      activeRepo: workspace.activeRepo,
      addOpenRepo: workspace.addOpenRepo,
      setActiveRepo: workspace.setActiveRepo,
      setActiveTab: workspace.setActiveTab,
    },
    settings,
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

  const github = useGithubDomain({
    onRepoCloned: workspace.addOpenRepo,
    setActiveTab: workspace.setActiveTab,
    language: settings.language,
    githubOauthClientId: settings.githubOauthClientId,
    githubHost: settings.githubHost,
  });

  const { handleCloneByUrl, handleForkByUrl } = useRepositoryCreationWorkflow({
    github,
    workspace,
    settings,
    setInputDialog,
    setGitActionToast,
    t,
    tr,
  });

  const pullRequestDomain = usePullRequests({
    activeRepo: workspace.activeRepo,
    isAuthenticated: github.isAuthenticated,
    refreshTrigger,
    language: settings.language,
    githubHost: settings.githubHost,
    onCreated: (number) => {
      setGitActionToast({ msg: tr(`PR #${number} erstellt.`, `Created PR #${number}.`), isError: false });
      setShowCreatePR(false);
      setNewPRTitle('');
      setNewPRBody('');
      triggerRefresh();
    },
    onError: (message) => {
      setGitActionToast({ msg: message, isError: true });
    },
  });

  const handleCreateGithubRepoForCurrent = async () => {
    if (!githubClient.isAvailable() || !workspace.activeRepo) return;
    if (!github.isAuthenticated) {
      setConnectError(t('generated.components.layout.useappstate.please_connect_github_first_github_tab_68715c85'));
      return;
    }
    await createGithubRepoAndConnect({ replaceOriginIfExists: true, pushAfterConnect: true });
  };

  const { closeReleaseCreator, generateReleaseNotesWithAI, handleCreateRelease, openReleaseCreator, refreshReleaseContext, setReleaseForm, releasePendingAssets, addReleasePendingAssets, removeReleasePendingAsset } =
    useReleaseWorkflow({
      activeRepo: workspace.activeRepo,
      isGithubAuthenticated: github.isAuthenticated,
      ownerRepo: pullRequestDomain.prOwnerRepo,
      currentBranch: repository.currentBranch,
      releaseForm,
      setReleaseFormState,
      releaseContext,
      setReleaseContext,
      setReleaseContextError,
      setReleaseContextLoading,
      setReleaseError,
      setReleaseSuccess,
      setReleaseSubmitting,
      showReleaseCreator,
      setShowReleaseCreator,
      setReleaseNotesGenerating,
      releaseNotesLanguage,
      releaseNotesOptions,
      setConfirmDialog,
      setGitActionToast,
      setActiveTab: workspace.setActiveTab,
      triggerRefresh,
      language: settings.language,
    });
  const { handleCheckoutPR, handleCopyPRUrl, handleCreatePR, handleMergePR, handleOpenPR } = usePullRequestWorkflow({
    ownerRepo: pullRequestDomain.prOwnerRepo,
    createPullRequest: pullRequestDomain.createPR,
    currentBranch: repository.currentBranch,
    newPRTitle,
    newPRBody,
    newPRHead,
    newPRBase,
    runGitCommand,
    refreshRemoteState: repository.refreshRemoteState,
    confirmDangerousOps: settings.confirmDangerousOps,
    setConfirmDialog,
    setGitActionToast,
    triggerRefresh,
    language: settings.language,
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
    openRepos: workspace.openRepos,
    repoMeta: workspace.repoMeta,
    repoSortBy: workspace.repoSortBy,
    setRepoSortBy: workspace.setRepoSortBy,
    activeRepo: workspace.activeRepo,
    addOpenRepo: workspace.addOpenRepo,
    handleOpenFolder: workspace.handleOpenFolder,
    handleSwitchRepo: workspace.handleSwitchRepo,
    handleCloseRepo: workspace.handleCloseRepo,
    handleToggleRepoPin: workspace.toggleRepoPin,

    refreshTrigger,
    triggerRefresh,
    commitRefreshTrigger,
    triggerCommitRefresh,
    selectedCommit,
    setSelectedCommit,
    commitNavigationRequest,
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
    remotes: repository.remotes,
    submodules: repository.submodules,
    hasRemoteOrigin: repository.hasRemoteOrigin,
    forceGithubRepoCreationPrompt,
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

    isAuthenticated: github.isAuthenticated,
    githubUser: github.githubUser,
    githubRepos: github.githubRepos,
    githubReposHasMore: github.githubReposHasMore,
    isLoadingGithubRepos: github.isLoadingRepos,
    isLoadingMoreGithubRepos: github.isLoadingMoreRepos,
    loadMoreGithubRepos: () => {
      void github.loadMoreRepos();
    },
    refreshGithubRepos: (search?: string) => {
      void github.refreshRepos(search);
    },
    tokenInput: github.tokenInput,
    setTokenInput: github.setTokenInput,
    isAuthenticating: github.isAuthenticating,
    authError: github.authError,
    setAuthError: github.setAuthError,
    handleTokenLogin: github.handleTokenLogin,
    oauthConfigured: github.oauthConfigured,
    deviceFlow: github.deviceFlow,
    isDeviceFlowRunning: github.isDeviceFlowRunning,
    deviceFlowError: github.deviceFlowError,
    handleStartDeviceFlowLogin: github.handleStartDeviceFlowLogin,
    handleCancelAuthentication: github.handleCancelAuthentication,
    handleCancelDeviceFlow: github.handleCancelDeviceFlow,
    isWebFlowRunning: github.isWebFlowRunning,
    webFlowError: github.webFlowError,
    handleStartWebFlowLogin: github.handleStartWebFlowLogin,
    handleLogout: github.handleLogout,

    isCloning: github.isCloning,
    setIsCloning: github.setIsCloning,
    closeCloneProgress: github.closeCloneProgress,
    cloneLog: github.cloneLog,
    cloneRepoName: github.cloneRepoName,
    cloneFinished: github.cloneFinished,
    cloneError: github.cloneError,
    handleClone: github.handleClone,
    handleCloneByUrl,
    handleForkByUrl,

    prOwnerRepo: pullRequestDomain.prOwnerRepo,
    prFilter: pullRequestDomain.prFilter,
    setPrFilter: pullRequestDomain.setPrFilter,
    prLoading: pullRequestDomain.prLoading,
    prError: pullRequestDomain.prError,
    pullRequests: pullRequestDomain.pullRequests,
    prCiByNumber: pullRequestDomain.prCiByNumber,
    showCreatePR,
    setShowCreatePR,
    newPRTitle,
    setNewPRTitle,
    newPRBody,
    setNewPRBody,
    newPRHead,
    setNewPRHead,
    newPRBase,
    setNewPRBase,
    handleCreatePR,
    releaseForm,
    setReleaseForm,
    releaseSubmitting,
    releaseError,
    releaseSuccess,
    showReleaseCreator,
    openReleaseCreator,
    closeReleaseCreator,
    releaseContextLoading,
    releaseContextError,
    releaseContext,
    refreshReleaseContext,
    releaseNotesGenerating,
    generateReleaseNotesWithAI,
    releaseNotesLanguage,
    setReleaseNotesLanguage,
    releaseNotesOptions,
    setReleaseNotesOptions,
    handleCreateRelease,
    releasePendingAssets,
    addReleasePendingAssets,
    removeReleasePendingAsset,
    handleOpenPR,
    handleCopyPRUrl,
    handleCheckoutPR,
    handleMergePR,

    settings,
    handleUpdateSettings,
    plannerRefreshSignal,
    jobs,
    clearJobs,

    isConnectingGithubRepo,
    connectError,
    newRepoName,
    setNewRepoName,
    newRepoDescription,
    setNewRepoDescription,
    newRepoPrivate,
    setNewRepoPrivate,
    handleCreateGithubRepoForCurrent,

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
