import type { Dispatch, SetStateAction } from 'react';
import type { SettingsTabId } from '@/components/layout/sidebar/AppSidebar.types';
import type { useAppState } from '@/components/layout/useAppState';
import type { AppContextValue } from '@/contexts/AppStateContext';
import type { TranslationVariables } from '@/i18n';

type AppState = ReturnType<typeof useAppState>;
type Translate = (key: string, variables?: TranslationVariables) => string;

type Params = {
  state: AppState;
  selectedGithubAuthHelpMethod: 'pat' | 'device' | 'web' | null;
  setSelectedGithubAuthHelpMethod: Dispatch<SetStateAction<'pat' | 'device' | 'web' | null>>;
  settingsTab: SettingsTabId;
  setSettingsTab: Dispatch<SetStateAction<SettingsTabId>>;
  resetLayout: () => void;
  t: Translate;
  tr: (deText: string, enText: string) => string;
};

export const createAppContextValue = ({
  state,
  selectedGithubAuthHelpMethod,
  setSelectedGithubAuthHelpMethod,
  settingsTab,
  setSettingsTab,
  resetLayout,
  t,
  tr,
}: Params): AppContextValue => ({
  activeTab: state.activeTab,
  setActiveTab: state.setActiveTab,

  activeRepo: state.activeRepo,
  openRepos: state.openRepos,
  repoMeta: state.repoMeta,
  repoSortBy: state.repoSortBy,
  onSetRepoSortBy: state.setRepoSortBy,
  onToggleRepoPin: state.handleToggleRepoPin,
  onOpenFolder: state.handleOpenFolder,
  onCloneByUrl: state.handleCloneByUrl,
  onSwitchRepo: state.handleSwitchRepo,
  onCloseRepo: state.handleCloseRepo,
  isRepoPanelCollapsed: state.isRepoPanelCollapsed,
  onToggleRepoPanelCollapsed: state.toggleRepoPanelCollapsed,

  remoteSync: state.remoteSync,
  isGitActionRunning: state.isGitActionRunning,
  onRefreshRemoteQuick: () => state.refreshRemoteState(true),

  branches: state.branches,
  isCreatingBranch: state.isCreatingBranch,
  onSetCreatingBranch: state.setIsCreatingBranch,
  onCreateBranch: state.handleCreateBranch,
  onCheckoutBranch: (name) => state.runGitCommand(['checkout', name], tr(`Ausgecheckt: ${name}`, `Checked out: ${name}`)),
  onSetBranchContextMenu: state.setBranchContextMenu,
  isBranchPanelCollapsed: state.isBranchPanelCollapsed,
  onToggleBranchPanelCollapsed: state.toggleBranchPanelCollapsed,

  tags: state.tags,
  onCreateTag: state.handleCreateTag,
  onPushTags: state.handlePushTags,
  onDeleteTag: state.handleDeleteTag,
  onSelectTag: state.handleSelectTag,
  isTagPanelCollapsed: state.isTagPanelCollapsed,
  onToggleTagPanelCollapsed: state.toggleTagPanelCollapsed,

  remotes: state.remotes,
  remoteStatus: state.remoteStatus,
  onAddRemote: state.handleAddRemote,
  onRemoveRemote: state.handleRemoveRemote,
  onRenameRemote: state.handleRenameRemote,
  onSetRemoteUrl: state.handleSetRemoteUrl,
  onRefreshRemote: () => state.refreshRemoteState(true),
  onSetUpstreamForCurrentBranch: state.handleSetUpstreamForCurrentBranch,
  isRemotePanelCollapsed: state.isRemotePanelCollapsed,
  onToggleRemotePanelCollapsed: state.toggleRemotePanelCollapsed,

  submodules: state.submodules,
  onSubmoduleInitUpdate: state.handleSubmoduleInitUpdate,
  onSubmoduleSync: state.handleSubmoduleSync,
  onOpenSubmodule: state.handleOpenSubmodule,
  isSubmodulePanelCollapsed: state.isSubmodulePanelCollapsed,
  onToggleSubmodulePanelCollapsed: state.toggleSubmodulePanelCollapsed,

  hasRemoteOrigin: state.hasRemoteOrigin,
  forceGithubRepoCreationPrompt: state.forceGithubRepoCreationPrompt,
  isConnectingGithubRepo: state.isConnectingGithubRepo,
  connectError: state.connectError,
  newRepoName: state.newRepoName,
  setNewRepoName: state.setNewRepoName,
  newRepoDescription: state.newRepoDescription,
  setNewRepoDescription: state.setNewRepoDescription,
  newRepoPrivate: state.newRepoPrivate,
  setNewRepoPrivate: state.setNewRepoPrivate,
  onCreateGithubRepoForCurrent: state.handleCreateGithubRepoForCurrent,

  isAuthenticated: state.isAuthenticated,
  tokenInput: state.tokenInput,
  setTokenInput: state.setTokenInput,
  isAuthenticating: state.isAuthenticating,
  authError: state.authError,
  setAuthError: state.setAuthError,
  onTokenLogin: state.handleTokenLogin,
  oauthConfigured: state.oauthConfigured,
  deviceFlow: state.deviceFlow,
  isDeviceFlowRunning: state.isDeviceFlowRunning,
  deviceFlowError: state.deviceFlowError,
  onStartDeviceFlowLogin: state.handleStartDeviceFlowLogin,
  onCancelDeviceFlow: state.handleCancelDeviceFlow,
  isWebFlowRunning: state.isWebFlowRunning,
  webFlowError: state.webFlowError,
  onStartWebFlowLogin: state.handleStartWebFlowLogin,
  selectedGithubAuthHelpMethod,
  onSelectGithubAuthHelpMethod: setSelectedGithubAuthHelpMethod,

  githubUser: state.githubUser,
  githubRepos: state.githubRepos,
  githubReposHasMore: state.githubReposHasMore,
  isLoadingGithubRepos: state.isLoadingGithubRepos,
  isLoadingMoreGithubRepos: state.isLoadingMoreGithubRepos,
  loadMoreGithubRepos: state.loadMoreGithubRepos,
  refreshGithubRepos: state.refreshGithubRepos,
  onLogout: state.handleLogout,
  onClone: state.handleClone,
  onForkByUrl: state.handleForkByUrl,
  isCloning: state.isCloning,

  prOwnerRepo: state.prOwnerRepo,
  prFilter: state.prFilter,
  setPrFilter: state.setPrFilter,
  prLoading: state.prLoading,
  pullRequests: state.pullRequests,
  prCiByNumber: state.prCiByNumber,
  onOpenPR: state.handleOpenPR,
  onCopyPRUrl: state.handleCopyPRUrl,
  onCheckoutPR: state.handleCheckoutPR,
  onMergePR: state.handleMergePR,

  showCreatePR: state.showCreatePR,
  setShowCreatePR: state.setShowCreatePR,
  currentBranch: state.currentBranch,
  setNewPRHead: state.setNewPRHead,
  newPRTitle: state.newPRTitle,
  setNewPRTitle: state.setNewPRTitle,
  newPRBody: state.newPRBody,
  setNewPRBody: state.setNewPRBody,
  newPRHead: state.newPRHead,
  setNewPRHeadInput: state.setNewPRHead,
  newPRBase: state.newPRBase,
  setNewPRBase: state.setNewPRBase,
  onCreatePR: state.handleCreatePR,

  releaseForm: state.releaseForm,
  setReleaseForm: state.setReleaseForm,
  releaseSubmitting: state.releaseSubmitting,
  releaseError: state.releaseError,
  releaseSuccess: state.releaseSuccess,
  onCreateRelease: state.handleCreateRelease,

  settings: state.settings,
  onUpdateSettings: state.handleUpdateSettings,
  jobs: state.jobs,
  onClearJobs: state.clearJobs,
  settingsTab,
  onSelectSettingsTab: setSettingsTab,

  onClearGithubAuthHelpMethod: () => setSelectedGithubAuthHelpMethod(null),
  onResetLayout: resetLayout,

  activeGitActionLabel: state.activeGitActionLabel,
  runGitCommand: state.runGitCommand,

  selectedCommit: state.selectedCommit,
  setSelectedCommit: state.setSelectedCommit,
  commitNavigationRequest: state.commitNavigationRequest,
  onNavigateToCommit: state.onNavigateToCommit,
  refreshTrigger: state.refreshTrigger,
  triggerRefresh: state.triggerRefresh,
  commitRefreshTrigger: state.commitRefreshTrigger,
  triggerCommitRefresh: state.triggerCommitRefresh,
  showSecondaryHistory: state.settings.showSecondaryHistory,

  onFetch: () => state.refreshRemoteState(true),
  onPull: () => state.runGitCommand(['pull'], t('generated.app.pull_completed_successfully_a760cd36'), t('generated.app.running_pull_282e1a76')),
  onPullRebase: () =>
    state.runGitCommand(
      ['pull', '--rebase'],
      t('generated.app.pull_with_rebase_completed_successfully_732a6b7f'),
      t('generated.app.running_pull_rebase_f9ca4da2'),
    ),
  onPullFfOnly: () =>
    state.runGitCommand(
      ['pull', '--ff-only'],
      t('generated.app.pull_with_ff_only_completed_successfully_01a725eb'),
      t('generated.app.running_pull_ff_only_efd80da9'),
    ),
  onPullNoFf: () =>
    state.runGitCommand(['pull', '--no-ff'], t('generated.app.pull_with_no_ff_completed_0271e730'), t('generated.app.running_pull_no_ff_222dffa5')),
  onPush: () => state.runGitCommand(['push'], t('generated.app.push_completed_successfully_edf8c1c9'), t('generated.app.running_push_0ab33329')),
  onPushForceWithLease: () =>
    state.runGitCommand(
      ['push', '--force-with-lease'],
      t('generated.app.push_with_force_with_lease_completed_successfully_a27c0ef4'),
      t('generated.app.running_push_force_with_lease_590e0aba'),
    ),
  onPushSetUpstream: () => {
    const branch = state.currentBranch;
    if (!branch) return;
    void state.runGitCommand(
      ['push', '-u', 'origin', branch],
      tr(`Branch "${branch}" gepusht & Upstream gesetzt.`, `Pushed "${branch}" & set upstream.`),
      'Push -u...',
    );
  },
  onMergeBranch: state.handleMergeBranch,
  onOpenRepoWorkspace: () => state.setActiveTab('repo'),

  showReleaseCreator: state.showReleaseCreator,
  onOpenReleaseCreator: state.openReleaseCreator,
  onCloseReleaseCreator: state.closeReleaseCreator,
  releaseContextLoading: state.releaseContextLoading,
  releaseContextError: state.releaseContextError,
  releaseContext: state.releaseContext,
  onRefreshReleaseContext: state.refreshReleaseContext,
  onGenerateReleaseNotes: state.generateReleaseNotesWithAI,
  releaseNotesGenerating: state.releaseNotesGenerating,
  releaseNotesLanguage: state.releaseNotesLanguage,
  setReleaseNotesLanguage: state.setReleaseNotesLanguage,
  releaseNotesOptions: state.releaseNotesOptions,
  setReleaseNotesOptions: (updater) => state.setReleaseNotesOptions(updater),

  autoOpenConflictResolverPath: state.autoOpenConflictResolverPath,
  onAutoOpenConflictResolverConsumed: state.clearAutoOpenConflictResolverPath,
  onOpenConflictResolverForPath: state.openConflictResolverForPath,
  onConflictMergeContinue: () => {
    void state.runGitCommand(['mergeContinue'], t('generated.app.merge_continued_63b9ee36'), t('generated.app.continuing_merge_9ed78a88'));
  },
  onConflictMergeAbort: () => {
    void state.runGitCommand(['mergeAbort'], t('generated.app.merge_aborted_b602bf32'), t('generated.app.aborting_merge_4f4ac264'));
  },
  onConflictRebaseContinue: () => {
    void state.runGitCommand(['rebaseContinue'], t('generated.app.rebase_continued_181b298d'), t('generated.app.continuing_rebase_21242ce6'));
  },
  onConflictRebaseAbort: () => {
    void state.runGitCommand(['rebaseAbort'], t('generated.app.rebase_aborted_74ce61c8'), t('generated.app.aborting_rebase_bd30693b'));
  },
});
