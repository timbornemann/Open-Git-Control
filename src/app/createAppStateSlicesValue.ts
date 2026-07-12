import type { Dispatch, SetStateAction } from 'react';
import type { SettingsTabId } from '@/app/state/contracts';
import type { useAppState } from '@/components/layout/useAppState';
import type {
  AppStateSlicesValue,
  AppStateUIState,
  GithubContextValue,
  RepositoryContextValue,
  SettingsContextValue,
  UIContextValue,
  WorkflowContextValue,
} from '@/contexts/AppStateContext';
import type { TranslationVariables } from '@/i18n';
import { buildCherryPickAbortDialog, buildMergeAbortDialog, buildRebaseAbortDialog } from '@/components/staging-area/conflictAbortDialogs';
import { gitClient } from '@/services/gitClient';

type AppState = ReturnType<typeof useAppState>;
type Translate = (key: string, variables?: TranslationVariables) => string;

type CreateAppStateSlicesValueParams = {
  state: AppState;
  selectedGithubAuthHelpMethod: 'pat' | 'device' | 'web' | null;
  setSelectedGithubAuthHelpMethod: Dispatch<SetStateAction<'pat' | 'device' | 'web' | null>>;
  settingsTab: SettingsTabId;
  setSettingsTab: Dispatch<SetStateAction<SettingsTabId>>;
  resetLayout: () => void;
  t: Translate;
  tr: (deText: string, enText: string) => string;
  uiState: AppStateUIState;
};

const createSettingsSlice = (state: AppState, settingsTab: SettingsTabId, setSettingsTab: Dispatch<SetStateAction<SettingsTabId>>): SettingsContextValue => ({
  settings: state.settings,
  onUpdateSettings: state.handleUpdateSettings,
  settingsTab,
  onSelectSettingsTab: setSettingsTab,
});

const createRepositorySlice = (state: AppState, tr: (deText: string, enText: string) => string): RepositoryContextValue => ({
  activeRepo: state.activeRepo,
  openRepos: state.openRepos,
  isRestoringRepos: state.isRestoringRepos,
  repoMeta: state.repoMeta,
  repoSortBy: state.repoSortBy,
  onSetRepoSortBy: state.setRepoSortBy,
  onToggleRepoPin: state.handleToggleRepoPin,
  onOpenFolder: state.handleOpenFolder,
  onCloneByUrl: state.handleCloneByUrl,
  onSwitchRepo: state.handleSwitchRepo,
  onCloseRepo: state.handleCloseRepo,
  remoteSync: state.remoteSync,
  onRefreshRemoteQuick: () => state.refreshRemoteState(true),
  branches: state.branches,
  currentBranch: state.currentBranch,
  isCreatingBranch: state.isCreatingBranch,
  onSetCreatingBranch: state.setIsCreatingBranch,
  onCreateBranch: state.handleCreateBranch,
  onCheckoutBranch: (name) => state.runGitCommand(gitClient.buildCheckoutBranchArgs(name), tr(`Ausgecheckt: ${name}`, `Checked out: ${name}`)),
  onSetBranchContextMenu: state.setBranchContextMenu,
  tags: state.tags,
  onCreateTag: state.handleCreateTag,
  onPushTags: state.handlePushTags,
  onDeleteTag: state.handleDeleteTag,
  onSelectTag: state.handleSelectTag,
  remotes: state.remotes,
  remoteStatus: state.remoteStatus,
  onAddRemote: state.handleAddRemote,
  onRemoveRemote: state.handleRemoveRemote,
  onRenameRemote: state.handleRenameRemote,
  onSetRemoteUrl: state.handleSetRemoteUrl,
  onRefreshRemote: () => state.refreshRemoteState(true),
  onSetUpstreamForCurrentBranch: state.handleSetUpstreamForCurrentBranch,
  submodules: state.submodules,
  onSubmoduleInitUpdate: state.handleSubmoduleInitUpdate,
  onSubmoduleSync: state.handleSubmoduleSync,
  onOpenSubmodule: state.handleOpenSubmodule,
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
  selectedCommit: state.selectedCommit,
  setSelectedCommit: state.setSelectedCommit,
  commitNavigationRequest: state.commitNavigationRequest,
  onCommitNavigationRequestHandled: state.consumeCommitNavigationRequest,
  onNavigateToCommit: state.onNavigateToCommit,
  refreshTrigger: state.refreshTrigger,
  triggerRefresh: state.triggerRefresh,
  commitRefreshTrigger: state.commitRefreshTrigger,
  triggerCommitRefresh: state.triggerCommitRefresh,
  onToast: (message, isError) => state.setGitActionToast({ msg: message, isError }),
  showSecondaryHistory: state.settings.showSecondaryHistory,
  onMergeBranch: state.handleMergeBranch,
  onOpenRepoWorkspace: () => state.setActiveTab('repo'),
});

const createGithubSlice = (
  state: AppState,
  selectedGithubAuthHelpMethod: 'pat' | 'device' | 'web' | null,
  setSelectedGithubAuthHelpMethod: Dispatch<SetStateAction<'pat' | 'device' | 'web' | null>>,
): GithubContextValue => ({
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
  onCancelAuthentication: state.handleCancelAuthentication,
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
  prHasLoaded: state.prHasLoaded,
  prError: state.prError,
  pullRequests: state.pullRequests,
  prCiByNumber: state.prCiByNumber,
  onOpenPR: state.handleOpenPR,
  onCopyPRUrl: state.handleCopyPRUrl,
  onCheckoutPR: state.handleCheckoutPR,
  onMergePR: state.handleMergePR,
  showCreatePR: state.showCreatePR,
  setShowCreatePR: state.setShowCreatePR,
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
  releasePendingAssets: state.releasePendingAssets,
  onAddReleasePendingAssets: state.addReleasePendingAssets,
  onRemoveReleasePendingAsset: state.removeReleasePendingAsset,
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
});

const createWorkflowSlice = (state: AppState, t: Translate, tr: (deText: string, enText: string) => string): WorkflowContextValue => ({
  isGitActionRunning: state.isGitActionRunning,
  activeGitActionLabel: state.activeGitActionLabel,
  runGitCommand: state.runGitCommand,
  onFetch: () => state.refreshRemoteState(true),
  onPull: () =>
    state.runGitCommand(gitClient.buildPullArgs(), t('generated.app.pull_completed_successfully_a760cd36'), t('generated.app.running_pull_282e1a76')),
  onPullRebase: () =>
    state.runGitCommand(
      gitClient.buildPullRebaseArgs(),
      t('generated.app.pull_with_rebase_completed_successfully_732a6b7f'),
      t('generated.app.running_pull_rebase_f9ca4da2'),
    ),
  onPullFfOnly: () =>
    state.runGitCommand(
      gitClient.buildPullArgs(['--ff-only']),
      t('generated.app.pull_with_ff_only_completed_successfully_01a725eb'),
      t('generated.app.running_pull_ff_only_efd80da9'),
    ),
  onPullNoFf: () =>
    state.runGitCommand(
      gitClient.buildPullArgs(['--no-ff']),
      t('generated.app.pull_with_no_ff_completed_0271e730'),
      t('generated.app.running_pull_no_ff_222dffa5'),
    ),
  onPush: () =>
    state.runGitCommand(gitClient.buildPushArgs(), t('generated.app.push_completed_successfully_edf8c1c9'), t('generated.app.running_push_0ab33329')),
  onPushForceWithLease: () =>
    state.runGitCommand(
      gitClient.buildPushArgs(['--force-with-lease']),
      t('generated.app.push_with_force_with_lease_completed_successfully_a27c0ef4'),
      t('generated.app.running_push_force_with_lease_590e0aba'),
    ),
  onPushTags: state.handlePushTags,
  onPushSetUpstream: () => {
    const branch = state.currentBranch;
    if (!branch) return;
    void state.runGitCommand(
      gitClient.buildPushCurrentBranchArgs({ remote: 'origin', ref: branch, setUpstream: true }),
      tr(`Branch "${branch}" gepusht & Upstream gesetzt.`, `Pushed "${branch}" & set upstream.`),
      'Push -u...',
    );
  },
  jobs: state.jobs,
  onClearJobs: state.clearJobs,
  repositoryRun: state.runState,
  activeRunConfig: state.activeRunConfig,
  isRunConsoleOpen: state.isRunConsoleOpen,
  hasUnreadRepositoryRunResult: state.hasUnreadRepositoryRunResult,
  onStartRepositoryRun: state.startRun,
  onStopRepositoryRun: state.stopRun,
  onOpenRunConsole: state.openRunConsole,
  onCloseRunConsole: state.closeRunConsole,
  onRefreshRunConfig: () => state.refreshRunConfig(),
  autoOpenConflictResolverPath: state.autoOpenConflictResolverPath,
  onAutoOpenConflictResolverConsumed: state.clearAutoOpenConflictResolverPath,
  onOpenConflictResolverForPath: state.openConflictResolverForPath,
  onConflictMergeContinue: () => {
    void state.runGitCommand(gitClient.buildMergeContinueArgs(), t('generated.app.merge_continued_63b9ee36'), t('generated.app.continuing_merge_9ed78a88'));
  },
  onConflictMergeAbort: () => {
    state.setConfirmDialog(
      buildMergeAbortDialog({
        t,
        onConfirm: async () => {
          await state.runGitCommand(gitClient.buildMergeAbortArgs(), t('generated.app.merge_aborted_b602bf32'), t('generated.app.aborting_merge_4f4ac264'));
        },
      }),
    );
  },
  onConflictRebaseContinue: () => {
    void state.runGitCommand(gitClient.buildRebaseContinueArgs(), t('generated.app.rebase_continued_181b298d'), t('generated.app.continuing_rebase_21242ce6'));
  },
  onConflictRebaseAbort: () => {
    state.setConfirmDialog(
      buildRebaseAbortDialog({
        t,
        onConfirm: async () => {
          await state.runGitCommand(gitClient.buildRebaseAbortArgs(), t('generated.app.rebase_aborted_74ce61c8'), t('generated.app.aborting_rebase_bd30693b'));
        },
      }),
    );
  },
  onConflictCherryPickContinue: () => {
    void state.runGitCommand(
      gitClient.buildCherryPickContinueArgs(),
      t('generated.app.cherry_pick_continued_a1b2c3d4'),
      t('generated.app.continuing_cherry_pick_e5f6a7b8'),
    );
  },
  onConflictCherryPickAbort: () => {
    state.setConfirmDialog(
      buildCherryPickAbortDialog({
        t,
        onConfirm: async () => {
          await state.runGitCommand(
            gitClient.buildCherryPickAbortArgs(),
            t('generated.app.cherry_pick_aborted_c9d0e1f2'),
            t('generated.app.aborting_cherry_pick_a3b4c5d6'),
          );
        },
      }),
    );
  },
});

const createUiSlice = ({
  state,
  setSelectedGithubAuthHelpMethod,
  resetLayout,
  uiState,
}: Pick<CreateAppStateSlicesValueParams, 'state' | 'setSelectedGithubAuthHelpMethod' | 'resetLayout' | 'uiState'>): UIContextValue => ({
  activeTab: state.activeTab,
  setActiveTab: state.setActiveTab,
  onClearGithubAuthHelpMethod: () => setSelectedGithubAuthHelpMethod(null),
  onResetLayout: resetLayout,
  isRepoPanelCollapsed: state.isRepoPanelCollapsed,
  onToggleRepoPanelCollapsed: state.toggleRepoPanelCollapsed,
  isBranchPanelCollapsed: state.isBranchPanelCollapsed,
  onToggleBranchPanelCollapsed: state.toggleBranchPanelCollapsed,
  isTagPanelCollapsed: state.isTagPanelCollapsed,
  onToggleTagPanelCollapsed: state.toggleTagPanelCollapsed,
  isRemotePanelCollapsed: state.isRemotePanelCollapsed,
  onToggleRemotePanelCollapsed: state.toggleRemotePanelCollapsed,
  isSubmodulePanelCollapsed: state.isSubmodulePanelCollapsed,
  onToggleSubmodulePanelCollapsed: state.toggleSubmodulePanelCollapsed,
  ...uiState,
});

export const createAppStateSlicesValue = ({
  state,
  selectedGithubAuthHelpMethod,
  setSelectedGithubAuthHelpMethod,
  settingsTab,
  setSettingsTab,
  resetLayout,
  t,
  tr,
  uiState,
}: CreateAppStateSlicesValueParams): AppStateSlicesValue => ({
  settings: createSettingsSlice(state, settingsTab, setSettingsTab),
  repository: createRepositorySlice(state, tr),
  github: createGithubSlice(state, selectedGithubAuthHelpMethod, setSelectedGithubAuthHelpMethod),
  workflow: createWorkflowSlice(state, t, tr),
  ui: createUiSlice({
    state,
    setSelectedGithubAuthHelpMethod,
    resetLayout,
    uiState,
  }),
});
