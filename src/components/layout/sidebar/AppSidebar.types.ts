import React from 'react';
import { BranchInfo, RemoteSyncState } from '../../../types/git';
import { AppSettingsDto, GitHubRepositoryDto, GitJobEventDto, PullRequestDto } from '../../../global';

export type RemoteStatus = {
  title: string;
  detail: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
};

export type BranchContextMenuState = { x: number; y: number; branch: string; isHead: boolean } | null;

export type AppSidebarProps = {
  activeTab: 'repos' | 'github' | 'settings';
  setActiveTab: (tab: 'repos' | 'github' | 'settings') => void;

  activeRepo: string | null;
  openRepos: string[];
  onOpenFolder: () => void;
  onSwitchRepo: (repoPath: string) => void;
  onCloseRepo: (repoPath: string) => void;

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

  tags: string[];
  onCreateTag: () => void;
  onPushTags: () => void;
  onDeleteTag: (name: string) => void;

  remotes: { name: string; url: string }[];
  remoteStatus: RemoteStatus;
  remoteOnlyBranchesCount: number;
  onAddRemote: () => void;
  onRemoveRemote: (name: string) => void;
  onRefreshRemote: () => void;

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

  githubUser: string | null;
  githubRepos: GitHubRepositoryDto[];
  onLogout: () => void;
  onClone: (cloneUrl: string, repoName: string) => void;
  isCloning: boolean;

  prOwnerRepo: { owner: string; repo: string } | null;
  prFilter: 'open' | 'closed' | 'all';
  setPrFilter: (value: 'open' | 'closed' | 'all') => void;
  prLoading: boolean;
  pullRequests: PullRequestDto[];
  onOpenPR: (url: string) => void;
  onCopyPRUrl: (url: string) => void;
  onCheckoutPR: (prNumber: number, headRef: string) => Promise<void>;

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

  settings: AppSettingsDto;
  onUpdateSettings: (partial: Partial<AppSettingsDto>) => Promise<void>;
  jobs: GitJobEventDto[];
  onClearJobs: () => void;
};
