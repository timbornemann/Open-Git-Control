import type { Dispatch, SetStateAction } from 'react';
import type { SettingsTabId } from '@/app/state/contracts';
import type { useAppState } from '@/components/layout/useAppState';
import type {
  AppStateSlicesValue,
  AppStateUIState,
  RepositoryContextValue,
  SettingsContextValue,
  UIContextValue,
  WorkflowContextValue,
} from '@/contexts/AppStateContext';
import type { TranslationVariables } from '@/i18n';
import { buildCherryPickAbortDialog, buildMergeAbortDialog, buildRebaseAbortDialog } from '@/components/staging-area/conflictAbortDialogs';
import { gitClient } from '@/services/gitClient';
import { requestRemoteTransfer } from '@/components/hosting/remoteTransferDialogState';

type AppState = ReturnType<typeof useAppState>;
type Translate = (key: string, variables?: TranslationVariables) => string;

type CreateAppStateSlicesValueParams = {
  state: AppState;
  settingsTab: SettingsTabId;
  setSettingsTab: Dispatch<SetStateAction<SettingsTabId>>;
  resetLayout: () => void;
  t: Translate;
  tr: (deText: string, enText: string) => string;
  uiState: AppStateUIState;
};

const createSettingsSlice = (state: AppState, settingsTab: SettingsTabId, setSettingsTab: Dispatch<SetStateAction<SettingsTabId>>): SettingsContextValue => ({
  settings: state.settings,
  onUpdateSettings: state.updateSettingsWithResult,
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
  onSetRepoPins: state.handleSetRepoPins,
  onOpenFolder: state.handleOpenFolder,
  onCloneByUrl: state.handleCloneByUrl,
  onSwitchRepo: state.handleSwitchRepo,
  onAddRepo: state.addOpenRepo,
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
  tagConflicts: state.tagConflicts,
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
  onOpenRepoWorkspace: () => {
    state.onCloseRepositoryAnalytics();
    if (state.isRepositoryPublicationOpen) state.onCloseRepositoryPublication();
    state.onCloseRunConfig();
    state.onCloseRemoteConfig();
    state.setActiveTab('repo');
  },
});

const createWorkflowSlice = (state: AppState, t: Translate, tr: (deText: string, enText: string) => string): WorkflowContextValue => ({
  isGitActionRunning: state.isGitActionRunning,
  activeGitActionLabel: state.activeGitActionLabel,
  runGitCommand: state.runGitCommand,
  onFetch: () => state.refreshRemoteState(true),
  onPull: () => {
    if (state.activeRepo) requestRemoteTransfer({ repoPath: state.activeRepo, mode: 'pull' });
  },
  onPullRebase: () => {
    if (state.activeRepo) requestRemoteTransfer({ repoPath: state.activeRepo, mode: 'pull', pullMode: 'rebase' });
  },
  onPullFfOnly: () => {
    if (state.activeRepo) requestRemoteTransfer({ repoPath: state.activeRepo, mode: 'pull', pullMode: 'ff-only' });
  },
  onPullNoFf: () => {
    if (state.activeRepo) requestRemoteTransfer({ repoPath: state.activeRepo, mode: 'pull', pullMode: 'no-ff' });
  },
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

const createUiSlice = ({ state, resetLayout, uiState }: Pick<CreateAppStateSlicesValueParams, 'state' | 'resetLayout' | 'uiState'>): UIContextValue => ({
  activeTab: state.activeTab,
  setActiveTab: (tab) => {
    if (tab !== 'repo') {
      state.onCloseRepositoryAnalytics();
      state.onCloseRunConfig();
      state.onCloseRemoteConfig();
      state.onCloseSecretScanAllowlist();
      if (state.isReleaseCreatorOpen) state.onCloseReleaseCreator();
      if (state.isRepositoryPublicationOpen) state.onCloseRepositoryPublication();
    }
    state.setActiveTab(tab);
  },
  isRunConfigOpen: state.isRunConfigOpen,
  isRepositoryAnalyticsOpen: state.isRepositoryAnalyticsOpen,
  onOpenRepositoryAnalytics: state.onOpenRepositoryAnalytics,
  onCloseRepositoryAnalytics: state.onCloseRepositoryAnalytics,
  onOpenRunConfig: state.onOpenRunConfig,
  onCloseRunConfig: state.onCloseRunConfig,
  isSecretScanAllowlistOpen: state.isSecretScanAllowlistOpen,
  onOpenSecretScanAllowlist: state.onOpenSecretScanAllowlist,
  onCloseSecretScanAllowlist: state.onCloseSecretScanAllowlist,
  isRemoteConfigOpen: state.isRemoteConfigOpen,
  onOpenRemoteConfig: state.onOpenRemoteConfig,
  onCloseRemoteConfig: state.onCloseRemoteConfig,
  isReleaseCreatorOpen: state.isReleaseCreatorOpen,
  isRepositoryPublicationOpen: state.isRepositoryPublicationOpen,
  publicationConnectionId: state.publicationConnectionId,
  onOpenRepositoryPublication: state.onOpenRepositoryPublication,
  onCloseRepositoryPublication: state.onCloseRepositoryPublication,
  releaseCreatorTarget: state.releaseCreatorTarget,
  onOpenReleaseCreator: state.onOpenReleaseCreator,
  onCloseReleaseCreator: state.onCloseReleaseCreator,
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
  settingsTab,
  setSettingsTab,
  resetLayout,
  t,
  tr,
  uiState,
}: CreateAppStateSlicesValueParams): AppStateSlicesValue => ({
  settings: createSettingsSlice(state, settingsTab, setSettingsTab),
  repository: createRepositorySlice(state, tr),
  workflow: createWorkflowSlice(state, t, tr),
  ui: createUiSlice({
    state,
    resetLayout,
    uiState,
  }),
});
