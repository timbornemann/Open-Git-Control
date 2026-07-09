import type { Dispatch, PointerEvent as ReactPointerEvent, SetStateAction } from 'react';
import type { AppSidebarProps } from '@/components/layout/sidebar/AppSidebar.types';
import { type BranchContextMenuState } from '@/components/layout/sidebar/AppSidebar.types';
import type { ConfirmDialogState, InputDialogState } from '@/components/layout/layoutTypes';
import type { RunGitCommandOptions } from '@/components/layout/state/appStateShared';
import type { GitHubReleaseContextDto } from '@/global';
import type { GitMergeMode } from '@/types/git';
import type { ReleaseNotesOptions } from '@/types/releaseNotes';
import type { ReleaseVersionBump } from '@/utils/releaseTagSuggestion';

export type CommitNavigationRequest = {
  hash: string;
  requestId: number;
};

export type BaseUIContextValue = Pick<
  AppSidebarProps,
  | 'activeTab'
  | 'setActiveTab'
  | 'isRepoPanelCollapsed'
  | 'onToggleRepoPanelCollapsed'
  | 'isBranchPanelCollapsed'
  | 'onToggleBranchPanelCollapsed'
  | 'isTagPanelCollapsed'
  | 'onToggleTagPanelCollapsed'
  | 'isRemotePanelCollapsed'
  | 'onToggleRemotePanelCollapsed'
  | 'isSubmodulePanelCollapsed'
  | 'onToggleSubmodulePanelCollapsed'
> & {
  onClearGithubAuthHelpMethod: () => void;
  onResetLayout: () => void;
};

export type SettingsContextValue = Pick<AppSidebarProps, 'settings' | 'onUpdateSettings' | 'settingsTab' | 'onSelectSettingsTab'>;

export type RepositoryContextValue = Pick<
  AppSidebarProps,
  | 'activeRepo'
  | 'openRepos'
  | 'repoMeta'
  | 'repoSortBy'
  | 'onSetRepoSortBy'
  | 'onToggleRepoPin'
  | 'onOpenFolder'
  | 'onCloneByUrl'
  | 'onSwitchRepo'
  | 'onCloseRepo'
  | 'remoteSync'
  | 'onRefreshRemoteQuick'
  | 'branches'
  | 'currentBranch'
  | 'isCreatingBranch'
  | 'onSetCreatingBranch'
  | 'onCreateBranch'
  | 'onCheckoutBranch'
  | 'onSetBranchContextMenu'
  | 'tags'
  | 'onCreateTag'
  | 'onPushTags'
  | 'onDeleteTag'
  | 'onSelectTag'
  | 'remotes'
  | 'remoteStatus'
  | 'onAddRemote'
  | 'onRemoveRemote'
  | 'onRenameRemote'
  | 'onSetRemoteUrl'
  | 'onRefreshRemote'
  | 'onSetUpstreamForCurrentBranch'
  | 'submodules'
  | 'onSubmoduleInitUpdate'
  | 'onSubmoduleSync'
  | 'onOpenSubmodule'
  | 'hasRemoteOrigin'
  | 'forceGithubRepoCreationPrompt'
  | 'isConnectingGithubRepo'
  | 'connectError'
  | 'newRepoName'
  | 'setNewRepoName'
  | 'newRepoDescription'
  | 'setNewRepoDescription'
  | 'newRepoPrivate'
  | 'setNewRepoPrivate'
  | 'onCreateGithubRepoForCurrent'
> & {
  selectedCommit: string | null;
  setSelectedCommit: (hash: string | null) => void;
  commitNavigationRequest: CommitNavigationRequest | null;
  onNavigateToCommit: (hash: string) => void;
  refreshTrigger: number;
  triggerRefresh: () => void;
  commitRefreshTrigger: number;
  triggerCommitRefresh: () => void;
  showSecondaryHistory: boolean;
  onMergeBranch: (branchName: string, mode: GitMergeMode) => void;
  onOpenRepoWorkspace: () => void;
};

export type GithubContextValue = Pick<
  AppSidebarProps,
  | 'isAuthenticated'
  | 'tokenInput'
  | 'setTokenInput'
  | 'isAuthenticating'
  | 'authError'
  | 'setAuthError'
  | 'onTokenLogin'
  | 'oauthConfigured'
  | 'deviceFlow'
  | 'isDeviceFlowRunning'
  | 'deviceFlowError'
  | 'onStartDeviceFlowLogin'
  | 'onCancelDeviceFlow'
  | 'isWebFlowRunning'
  | 'webFlowError'
  | 'onStartWebFlowLogin'
  | 'selectedGithubAuthHelpMethod'
  | 'onSelectGithubAuthHelpMethod'
  | 'githubUser'
  | 'githubRepos'
  | 'githubReposHasMore'
  | 'isLoadingGithubRepos'
  | 'isLoadingMoreGithubRepos'
  | 'loadMoreGithubRepos'
  | 'refreshGithubRepos'
  | 'onLogout'
  | 'onClone'
  | 'onForkByUrl'
  | 'isCloning'
  | 'prOwnerRepo'
  | 'prFilter'
  | 'setPrFilter'
  | 'prLoading'
  | 'pullRequests'
  | 'prCiByNumber'
  | 'onOpenPR'
  | 'onCopyPRUrl'
  | 'onCheckoutPR'
  | 'onMergePR'
  | 'showCreatePR'
  | 'setShowCreatePR'
  | 'setNewPRHead'
  | 'newPRTitle'
  | 'setNewPRTitle'
  | 'newPRBody'
  | 'setNewPRBody'
  | 'newPRHead'
  | 'setNewPRHeadInput'
  | 'newPRBase'
  | 'setNewPRBase'
  | 'onCreatePR'
  | 'releaseForm'
  | 'setReleaseForm'
  | 'releaseSubmitting'
  | 'releaseError'
  | 'releaseSuccess'
  | 'onCreateRelease'
> & {
  showReleaseCreator: boolean;
  onOpenReleaseCreator: () => void;
  onCloseReleaseCreator: () => void;
  releaseContextLoading: boolean;
  releaseContextError: string | null;
  releaseContext: GitHubReleaseContextDto | null;
  onRefreshReleaseContext: () => Promise<void>;
  onGenerateReleaseNotes: (versionBump: ReleaseVersionBump) => Promise<void>;
  releaseNotesGenerating: boolean;
  releaseNotesLanguage: 'de' | 'en';
  setReleaseNotesLanguage: (value: 'de' | 'en') => void;
  releaseNotesOptions: ReleaseNotesOptions;
  setReleaseNotesOptions: (updater: (prev: ReleaseNotesOptions) => ReleaseNotesOptions) => void;
};

export type WorkflowContextValue = Pick<AppSidebarProps, 'isGitActionRunning' | 'onPushTags' | 'jobs' | 'onClearJobs'> & {
  activeGitActionLabel: string | null;
  runGitCommand: (args: string[], successMsg: string, actionLabel?: string, options?: RunGitCommandOptions) => Promise<boolean>;
  onFetch: () => void;
  onPull: () => void;
  onPullRebase: () => void;
  onPullFfOnly: () => void;
  onPullNoFf: () => void;
  onPush: () => void;
  onPushForceWithLease: () => void;
  onPushSetUpstream: () => void;
  autoOpenConflictResolverPath?: string | null;
  onAutoOpenConflictResolverConsumed?: () => void;
  onOpenConflictResolverForPath?: (path: string) => void;
  onConflictMergeContinue: () => void;
  onConflictMergeAbort: () => void;
  onConflictRebaseContinue: () => void;
  onConflictRebaseAbort: () => void;
};

export type UIContextValue = BaseUIContextValue & {
  sidebarWidth: number;
  isSidebarCollapsed: boolean;
  isSidebarResizing: boolean;
  onToggleSidebar: () => void;
  onSidebarResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (value: boolean) => void;
  branchContextMenu: BranchContextMenuState;
  setBranchContextMenu: (value: BranchContextMenuState) => void;
  confirmDialog: ConfirmDialogState | null;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  inputDialog: InputDialogState | null;
  setInputDialog: Dispatch<SetStateAction<InputDialogState | null>>;
  closeConfirmDialog: () => void;
  executeConfirmDialog: () => Promise<void>;
  executeConfirmDialogSecondary: () => Promise<void>;
  closeInputDialog: () => void;
  executeInputDialog: (values: Record<string, string>) => Promise<void>;
};

export type AppStateSlicesValue = {
  settings: SettingsContextValue;
  repository: RepositoryContextValue;
  github: GithubContextValue;
  workflow: WorkflowContextValue;
  ui: UIContextValue;
};

export type AppStateUIState = Pick<
  UIContextValue,
  | 'sidebarWidth'
  | 'isSidebarCollapsed'
  | 'isSidebarResizing'
  | 'onToggleSidebar'
  | 'onSidebarResizeStart'
  | 'isCommandPaletteOpen'
  | 'setCommandPaletteOpen'
  | 'branchContextMenu'
  | 'setBranchContextMenu'
  | 'confirmDialog'
  | 'setConfirmDialog'
  | 'inputDialog'
  | 'setInputDialog'
  | 'closeConfirmDialog'
  | 'executeConfirmDialog'
  | 'executeConfirmDialogSecondary'
  | 'closeInputDialog'
  | 'executeInputDialog'
>;
