import React from 'react';
import { BranchInfo, GitSubmoduleInfo, RemoteSyncState } from '../../../types/git';
import { AppSettingsDto, DeviceFlowStartDto, GitHubCreateReleaseParamsDto, GitHubReleaseDto, GitHubRepositoryDto, GitJobEventDto, PullRequestCiDto, PullRequestDto } from '../../../global';

export type RemoteStatus = {
  title: string;
  detail: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
};

export type BranchContextMenuState = { x: number; y: number; branch: string; isHead: boolean } | null;

export type RepoMetaMap = Record<string, { lastOpened: number; pinned: boolean }>;
export type GithubAuthHelpMethod = 'pat' | 'device' | 'web' | null;
export type SettingsTabId = 'general' | 'integrations' | 'security' | 'system';

export type AppSidebarProps = {
  activeTab: 'repos' | 'github' | 'settings';
  setActiveTab: (tab: 'repos' | 'github' | 'settings') => void;

  activeRepo: string | null;
  openRepos: string[];
  repoMeta: RepoMetaMap;
  onToggleRepoPin: (repoPath: string) => void;
  onOpenFolder: () => void;
  onSwitchRepo: (repoPath: string) => void;
  onCloseRepo: (repoPath: string) => void;
  isRepoPanelCollapsed: boolean;
  onToggleRepoPanelCollapsed: () => void;

  remoteSync: RemoteSyncState;
  isGitActionRunning: boolean;
  onRefreshRemoteQuick: () => void;

  branches: BranchInfo[];
  isCreatingBranch: boolean;
  newBranchName: string;
  newBranchInputRef: React.RefObject<HTMLInputElement>;
  onSetCreatingBranch: (value: boolean) => void;
  onSetNewBranchName: (value: string) => void;
  onCreateBranch: () => void;
  onCheckoutBranch: (name: string) => void;
  onSetBranchContextMenu: (value: BranchContextMenuState) => void;
  isBranchPanelCollapsed: boolean;
  onToggleBranchPanelCollapsed: () => void;

  tags: string[];
  onCreateTag: () => void;
  onPushTags: () => void;
  onDeleteTag: (name: string) => void;
  isTagPanelCollapsed: boolean;
  onToggleTagPanelCollapsed: () => void;

  remotes: { name: string; url: string }[];
  remoteStatus: RemoteStatus;
  remoteOnlyBranchesCount: number;
  remoteOnlyBranches: string[];
  onAddRemote: () => void;
  onRemoveRemote: (name: string) => void;
  onRefreshRemote: () => void;
  onSetUpstreamForCurrentBranch: () => void;
  onCheckoutRemoteBranch: (remoteBranchName: string) => void;
  isRemotePanelCollapsed: boolean;
  onToggleRemotePanelCollapsed: () => void;

  submodules: GitSubmoduleInfo[];
  onSubmoduleInitUpdate: () => void;
  onSubmoduleSync: () => void;
  onOpenSubmodule: (submodulePath: string) => void;
  isSubmodulePanelCollapsed: boolean;
  onToggleSubmodulePanelCollapsed: () => void;

  hasRemoteOrigin: boolean | null;
  isConnectingGithubRepo: boolean;
  connectError: string | null;
  newRepoName: string;
  setNewRepoName: (value: string) => void;
  newRepoDescription: string;
  setNewRepoDescription: (value: string) => void;
  newRepoPrivate: boolean;
  setNewRepoPrivate: (value: boolean) => void;
  onCreateGithubRepoForCurrent: () => void;

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
  onCancelDeviceFlow: () => void;
  isWebFlowRunning: boolean;
  webFlowError: string | null;
  onStartWebFlowLogin: () => void;
  selectedGithubAuthHelpMethod: GithubAuthHelpMethod;
  onSelectGithubAuthHelpMethod: (method: GithubAuthHelpMethod) => void;

  githubUser: string | null;
  githubRepos: GitHubRepositoryDto[];
  githubRepoSearch: string;
  setGithubRepoSearch: (value: string) => void;
  githubReposHasMore: boolean;
  isLoadingGithubRepos: boolean;
  isLoadingMoreGithubRepos: boolean;
  loadMoreGithubRepos: () => void;
  refreshGithubRepos: () => void;
  onLogout: () => void;
  onClone: (cloneUrl: string, repoName: string) => void;
  isCloning: boolean;

  prOwnerRepo: { owner: string; repo: string } | null;
  prFilter: 'open' | 'closed' | 'all';
  setPrFilter: (value: 'open' | 'closed' | 'all') => void;
  prLoading: boolean;
  pullRequests: PullRequestDto[];
  prCiByNumber: Record<number, PullRequestCiDto>;
  onOpenPR: (url: string) => void;
  onCopyPRUrl: (url: string) => void;
  onCheckoutPR: (prNumber: number, headRef: string) => Promise<void>;
  onMergePR: (prNumber: number, mergeMethod?: 'merge' | 'squash' | 'rebase') => Promise<void>;

  showCreatePR: boolean;
  setShowCreatePR: (value: boolean) => void;
  currentBranch: string;
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
  releaseError: string | null;
  releaseSuccess: GitHubReleaseDto | null;
  onCreateRelease: () => Promise<void>;

  settings: AppSettingsDto;
  onUpdateSettings: (partial: Partial<AppSettingsDto>) => Promise<void>;
  jobs: GitJobEventDto[];
  onClearJobs: () => void;
  settingsTab: SettingsTabId;
  onSelectSettingsTab: (tab: SettingsTabId) => void;
};
