import type { AppSettingsDto, RepoSortByDto } from '@/types/appDtos';
import type { GitJobEventDto } from '@/types/aiDtos';
import type {
  DeviceFlowStartDto,
  GitHubCreateReleaseParamsDto,
  GitHubReleaseDto,
  GitHubRepositoryDto,
  PullRequestCiDto,
  PullRequestDto,
} from '@/types/githubDtos';
import type { BranchInfo, GitSubmoduleInfo, RemoteSyncState, RepoOwnerRef } from '@/types/git';
import type { RepositoryRunActionId, RepositoryRunConfigStateDto, RepositoryRunStateDto } from '@/types/repositoryRun';

export type AppTabId = 'localRepos' | 'repo' | 'planner' | 'github' | 'settings';
export type SettingsTabId = 'general' | 'integrations' | 'api' | 'security' | 'run' | 'system';
export type SettingsUpdateResult = { success: true; settings: AppSettingsDto } | { success: false; error: string };
export type GithubAuthHelpMethod = 'pat' | 'device' | 'web' | null;

export type RepoMetaMap = Record<string, { lastOpened: number; pinned: boolean; createdAt: number }>;

export type RemoteStatus = {
  title: string;
  detail: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
};

export type BranchContextMenuState = { x: number; y: number; branch: string; isHead: boolean } | null;

export interface DialogContextItem {
  label: string;
  value: string;
}

export interface InputDialogField {
  id: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  helperText?: string;
  multiline?: boolean;
  rows?: number;
  type?: 'text' | 'url' | 'checkbox' | 'select';
  options?: Array<{ value: string; label: string }>;
  visible?: (values: Record<string, string>) => boolean;
  validate?: (value: string, values: Record<string, string>) => string | null;
}

export type ConfirmDialogState = {
  variant: 'confirm' | 'danger';
  title: string;
  message: string;
  contextItems: DialogContextItem[];
  irreversible: boolean;
  consequences: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  onCancel?: () => Promise<void> | void;
  secondaryActionLabel?: string;
  secondaryActionVariant?: 'default' | 'danger';
  onSecondaryAction?: () => Promise<void> | void;
};

export type InputDialogState = {
  title: string;
  message: string;
  fields: InputDialogField[];
  contextItems: DialogContextItem[];
  irreversible: boolean;
  consequences: string;
  confirmLabel?: string;
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
};

export type RunGitCommandOptions = {
  /** Repository captured when an asynchronous workflow/dialog was opened. */
  expectedRepoPath?: string;
  skipDirtyGuard?: boolean;
  skipRemoteAheadDirtyGuard?: boolean;
  skipSecretScan?: boolean;
  skipAutoSetUpstreamOnPushFailure?: boolean;
  skipGithubRecoveryOnPushFailure?: boolean;
  skipAutoInitialCommitOnPushFailure?: boolean;
  skipSyncMismatchRecovery?: boolean;
  confirmedAutoInitialCommit?: boolean;
};

export type CommitNavigationRequest = {
  hash: string;
  requestId: number;
};

export type SidebarCoreState = {
  activeTab: AppTabId;
  setActiveTab: (tab: AppTabId) => void;
  isRepoPanelCollapsed: boolean;
  onToggleRepoPanelCollapsed: () => void;
  isBranchPanelCollapsed: boolean;
  onToggleBranchPanelCollapsed: () => void;
  isTagPanelCollapsed: boolean;
  onToggleTagPanelCollapsed: () => void;
  isRemotePanelCollapsed: boolean;
  onToggleRemotePanelCollapsed: () => void;
  isSubmodulePanelCollapsed: boolean;
  onToggleSubmodulePanelCollapsed: () => void;
};

export type SettingsStateContract = {
  settings: AppSettingsDto;
  onUpdateSettings: (partial: Partial<AppSettingsDto>) => Promise<SettingsUpdateResult>;
  settingsTab: SettingsTabId;
  onSelectSettingsTab: (tab: SettingsTabId) => void;
};

export type RepositoryStateContract = {
  activeRepo: string | null;
  openRepos: string[];
  isRestoringRepos: boolean;
  repoMeta: RepoMetaMap;
  repoSortBy: RepoSortByDto;
  onSetRepoSortBy: (sortBy: RepoSortByDto) => void;
  onToggleRepoPin: (repoPath: string) => void;
  onOpenFolder: () => void;
  onCloneByUrl: () => void;
  onSwitchRepo: (repoPath: string) => void;
  onCloseRepo: (repoPath: string) => void;
  remoteSync: RemoteSyncState;
  onRefreshRemoteQuick: () => void;
  branches: BranchInfo[];
  currentBranch: string;
  isCreatingBranch: boolean;
  onSetCreatingBranch: (value: boolean) => void;
  onCreateBranch: (branchName: string) => void;
  onCheckoutBranch: (name: string) => void;
  onSetBranchContextMenu: (value: BranchContextMenuState) => void;
  tags: string[];
  onCreateTag: () => void;
  onPushTags: () => void;
  onDeleteTag: (name: string) => void;
  onSelectTag: (name: string) => void;
  remotes: { name: string; url: string }[];
  remoteStatus: RemoteStatus;
  onAddRemote: () => void;
  onRemoveRemote: (name: string) => void;
  onRenameRemote: (name: string) => void;
  onSetRemoteUrl: (name: string, currentUrl: string) => void;
  onRefreshRemote: () => void;
  onSetUpstreamForCurrentBranch: () => void;
  submodules: GitSubmoduleInfo[];
  onSubmoduleInitUpdate: () => void;
  onSubmoduleSync: () => void;
  onOpenSubmodule: (submodulePath: string) => void;
  hasRemoteOrigin: boolean | null;
  forceGithubRepoCreationPrompt: boolean;
  isConnectingGithubRepo: boolean;
  connectError: string | null;
  newRepoName: string;
  setNewRepoName: (value: string) => void;
  newRepoDescription: string;
  setNewRepoDescription: (value: string) => void;
  newRepoPrivate: boolean;
  setNewRepoPrivate: (value: boolean) => void;
  onCreateGithubRepoForCurrent: () => void;
};

export type GithubStateContract = {
  isAuthenticated: boolean;
  tokenInput: string;
  setTokenInput: (value: string) => void;
  isAuthenticating: boolean;
  authError: string | null;
  setAuthError: (value: string | null) => void;
  onTokenLogin: () => void;
  oauthConfigured: boolean;
  deviceFlow: DeviceFlowStartDto | null;
  isDeviceFlowRunning: boolean;
  deviceFlowError: string | null;
  onStartDeviceFlowLogin: () => void;
  onCancelAuthentication: () => void;
  onCancelDeviceFlow: () => void;
  isWebFlowRunning: boolean;
  webFlowError: string | null;
  onStartWebFlowLogin: () => void;
  selectedGithubAuthHelpMethod: GithubAuthHelpMethod;
  onSelectGithubAuthHelpMethod: (method: GithubAuthHelpMethod) => void;
  githubUser: string | null;
  githubRepos: GitHubRepositoryDto[];
  githubReposHasMore: boolean;
  isLoadingGithubRepos: boolean;
  isLoadingMoreGithubRepos: boolean;
  loadMoreGithubRepos: () => void;
  refreshGithubRepos: (search?: string) => void;
  onLogout: () => void;
  onClone: (cloneUrl: string, repoName: string) => void;
  onForkByUrl: () => void;
  isCloning: boolean;
  prOwnerRepo: RepoOwnerRef | null;
  prFilter: 'open' | 'closed' | 'all';
  setPrFilter: (value: 'open' | 'closed' | 'all') => void;
  prLoading: boolean;
  prHasLoaded: boolean;
  prError: string | null;
  pullRequests: PullRequestDto[];
  prCiByNumber: Record<number, PullRequestCiDto>;
  onOpenPR: (url: string) => void;
  onCopyPRUrl: (url: string) => void;
  onCheckoutPR: (prNumber: number, headRef: string) => Promise<void>;
  onMergePR: (prNumber: number, mergeMethod?: 'merge' | 'squash' | 'rebase') => Promise<void>;
  showCreatePR: boolean;
  setShowCreatePR: (value: boolean) => void;
  setNewPRHead: (value: string) => void;
  newPRTitle: string;
  setNewPRTitle: (value: string) => void;
  newPRBody: string;
  setNewPRBody: (value: string) => void;
  newPRHead: string;
  setNewPRHeadInput: (value: string) => void;
  newPRBase: string;
  setNewPRBase: (value: string) => void;
  onCreatePR: () => void;
  releaseForm: GitHubCreateReleaseParamsDto;
  setReleaseForm: (updater: (prev: GitHubCreateReleaseParamsDto) => GitHubCreateReleaseParamsDto) => void;
  releaseSubmitting: boolean;
  releaseNotesGenerating: boolean;
  releaseError: string | null;
  releaseSuccess: GitHubReleaseDto | null;
  onCreateRelease: () => Promise<void>;
  releasePendingAssets: string[];
  onAddReleasePendingAssets: () => Promise<void>;
  onRemoveReleasePendingAsset: (filePath: string) => void;
};

export type WorkflowStateContract = {
  isGitActionRunning: boolean;
  onPushTags: () => void;
  jobs: GitJobEventDto[];
  onClearJobs: () => void;
  repositoryRun: RepositoryRunStateDto | null;
  activeRunConfig: RepositoryRunConfigStateDto | null;
  isRunConsoleOpen: boolean;
  hasUnreadRepositoryRunResult: boolean;
  onStartRepositoryRun: (action: RepositoryRunActionId) => Promise<boolean>;
  onStopRepositoryRun: () => Promise<boolean>;
  onOpenRunConsole: () => void;
  onCloseRunConsole: () => void;
  onRefreshRunConfig: () => Promise<void>;
};
