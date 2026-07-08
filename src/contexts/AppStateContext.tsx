import { createContext, useContext, type Context, type Dispatch, type PointerEvent as ReactPointerEvent, type ReactNode, type SetStateAction } from 'react';
import type { AppSidebarProps } from '@/components/layout/sidebar/AppSidebar.types';
import { type BranchContextMenuState } from '@/components/layout/sidebar/AppSidebar.types';
import type { GitHubReleaseContextDto } from '@/global';
import type { ReleaseNotesOptions } from '@/types/releaseNotes';
import type { ReleaseVersionBump } from '@/utils/releaseTagSuggestion';
import type { GitMergeMode } from '@/types/git';
import type { RunGitCommandOptions } from '@/components/layout/state/appStateShared';
import type { ConfirmDialogState, InputDialogState } from '@/components/layout/layoutTypes';

export type CommitNavigationRequest = {
  hash: string;
  requestId: number;
};

type BaseUIContextValue = Pick<
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

export type AppContextValue = SettingsContextValue & RepositoryContextValue & GithubContextValue & WorkflowContextValue & BaseUIContextValue;

export type AppStateSlicesValue = {
  settings: SettingsContextValue;
  repository: RepositoryContextValue;
  github: GithubContextValue;
  workflow: WorkflowContextValue;
  ui: UIContextValue;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);
const RepositoryContext = createContext<RepositoryContextValue | null>(null);
const GithubContext = createContext<GithubContextValue | null>(null);
const WorkflowContext = createContext<WorkflowContextValue | null>(null);
const UIContext = createContext<UIContextValue | null>(null);

const useRequiredContext = <T,>(context: Context<T | null>, hookName: string): T => {
  const ctx = useContext(context);
  if (!ctx) throw new Error(`${hookName} must be used within AppStateSlicesProvider`);
  return ctx;
};

export const useSettingsContext = () => useRequiredContext(SettingsContext, 'useSettingsContext');
export const useRepositoryContext = () => useRequiredContext(RepositoryContext, 'useRepositoryContext');
export const useGithubContext = () => useRequiredContext(GithubContext, 'useGithubContext');
export const useWorkflowContext = () => useRequiredContext(WorkflowContext, 'useWorkflowContext');
export const useUIContext = () => useRequiredContext(UIContext, 'useUIContext');
export const useOptionalUIContext = () => useContext(UIContext);

export const AppStateSlicesProvider = ({ value, children }: { value: AppStateSlicesValue; children: ReactNode }) => (
  <SettingsContext.Provider value={value.settings}>
    <RepositoryContext.Provider value={value.repository}>
      <GithubContext.Provider value={value.github}>
        <WorkflowContext.Provider value={value.workflow}>
          <UIContext.Provider value={value.ui}>{children}</UIContext.Provider>
        </WorkflowContext.Provider>
      </GithubContext.Provider>
    </RepositoryContext.Provider>
  </SettingsContext.Provider>
);

export const createAppStateSlices = (
  ctx: AppContextValue,
  uiState: Pick<
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
  >,
): AppStateSlicesValue => ({
  settings: {
    settings: ctx.settings,
    onUpdateSettings: ctx.onUpdateSettings,
    settingsTab: ctx.settingsTab,
    onSelectSettingsTab: ctx.onSelectSettingsTab,
  },
  repository: {
    activeRepo: ctx.activeRepo,
    openRepos: ctx.openRepos,
    repoMeta: ctx.repoMeta,
    repoSortBy: ctx.repoSortBy,
    onSetRepoSortBy: ctx.onSetRepoSortBy,
    onToggleRepoPin: ctx.onToggleRepoPin,
    onOpenFolder: ctx.onOpenFolder,
    onCloneByUrl: ctx.onCloneByUrl,
    onSwitchRepo: ctx.onSwitchRepo,
    onCloseRepo: ctx.onCloseRepo,
    remoteSync: ctx.remoteSync,
    onRefreshRemoteQuick: ctx.onRefreshRemoteQuick,
    branches: ctx.branches,
    currentBranch: ctx.currentBranch,
    isCreatingBranch: ctx.isCreatingBranch,
    onSetCreatingBranch: ctx.onSetCreatingBranch,
    onCreateBranch: ctx.onCreateBranch,
    onCheckoutBranch: ctx.onCheckoutBranch,
    onSetBranchContextMenu: ctx.onSetBranchContextMenu,
    tags: ctx.tags,
    onCreateTag: ctx.onCreateTag,
    onPushTags: ctx.onPushTags,
    onDeleteTag: ctx.onDeleteTag,
    onSelectTag: ctx.onSelectTag,
    remotes: ctx.remotes,
    remoteStatus: ctx.remoteStatus,
    onAddRemote: ctx.onAddRemote,
    onRemoveRemote: ctx.onRemoveRemote,
    onRenameRemote: ctx.onRenameRemote,
    onSetRemoteUrl: ctx.onSetRemoteUrl,
    onRefreshRemote: ctx.onRefreshRemote,
    onSetUpstreamForCurrentBranch: ctx.onSetUpstreamForCurrentBranch,
    submodules: ctx.submodules,
    onSubmoduleInitUpdate: ctx.onSubmoduleInitUpdate,
    onSubmoduleSync: ctx.onSubmoduleSync,
    onOpenSubmodule: ctx.onOpenSubmodule,
    hasRemoteOrigin: ctx.hasRemoteOrigin,
    forceGithubRepoCreationPrompt: ctx.forceGithubRepoCreationPrompt,
    isConnectingGithubRepo: ctx.isConnectingGithubRepo,
    connectError: ctx.connectError,
    newRepoName: ctx.newRepoName,
    setNewRepoName: ctx.setNewRepoName,
    newRepoDescription: ctx.newRepoDescription,
    setNewRepoDescription: ctx.setNewRepoDescription,
    newRepoPrivate: ctx.newRepoPrivate,
    setNewRepoPrivate: ctx.setNewRepoPrivate,
    onCreateGithubRepoForCurrent: ctx.onCreateGithubRepoForCurrent,
    selectedCommit: ctx.selectedCommit,
    setSelectedCommit: ctx.setSelectedCommit,
    commitNavigationRequest: ctx.commitNavigationRequest,
    onNavigateToCommit: ctx.onNavigateToCommit,
    refreshTrigger: ctx.refreshTrigger,
    triggerRefresh: ctx.triggerRefresh,
    commitRefreshTrigger: ctx.commitRefreshTrigger,
    triggerCommitRefresh: ctx.triggerCommitRefresh,
    showSecondaryHistory: ctx.showSecondaryHistory,
    onMergeBranch: ctx.onMergeBranch,
    onOpenRepoWorkspace: ctx.onOpenRepoWorkspace,
  },
  github: {
    isAuthenticated: ctx.isAuthenticated,
    tokenInput: ctx.tokenInput,
    setTokenInput: ctx.setTokenInput,
    isAuthenticating: ctx.isAuthenticating,
    authError: ctx.authError,
    setAuthError: ctx.setAuthError,
    onTokenLogin: ctx.onTokenLogin,
    oauthConfigured: ctx.oauthConfigured,
    deviceFlow: ctx.deviceFlow,
    isDeviceFlowRunning: ctx.isDeviceFlowRunning,
    deviceFlowError: ctx.deviceFlowError,
    onStartDeviceFlowLogin: ctx.onStartDeviceFlowLogin,
    onCancelDeviceFlow: ctx.onCancelDeviceFlow,
    isWebFlowRunning: ctx.isWebFlowRunning,
    webFlowError: ctx.webFlowError,
    onStartWebFlowLogin: ctx.onStartWebFlowLogin,
    selectedGithubAuthHelpMethod: ctx.selectedGithubAuthHelpMethod,
    onSelectGithubAuthHelpMethod: ctx.onSelectGithubAuthHelpMethod,
    githubUser: ctx.githubUser,
    githubRepos: ctx.githubRepos,
    githubReposHasMore: ctx.githubReposHasMore,
    isLoadingGithubRepos: ctx.isLoadingGithubRepos,
    isLoadingMoreGithubRepos: ctx.isLoadingMoreGithubRepos,
    loadMoreGithubRepos: ctx.loadMoreGithubRepos,
    refreshGithubRepos: ctx.refreshGithubRepos,
    onLogout: ctx.onLogout,
    onClone: ctx.onClone,
    onForkByUrl: ctx.onForkByUrl,
    isCloning: ctx.isCloning,
    prOwnerRepo: ctx.prOwnerRepo,
    prFilter: ctx.prFilter,
    setPrFilter: ctx.setPrFilter,
    prLoading: ctx.prLoading,
    pullRequests: ctx.pullRequests,
    prCiByNumber: ctx.prCiByNumber,
    onOpenPR: ctx.onOpenPR,
    onCopyPRUrl: ctx.onCopyPRUrl,
    onCheckoutPR: ctx.onCheckoutPR,
    onMergePR: ctx.onMergePR,
    showCreatePR: ctx.showCreatePR,
    setShowCreatePR: ctx.setShowCreatePR,
    setNewPRHead: ctx.setNewPRHead,
    newPRTitle: ctx.newPRTitle,
    setNewPRTitle: ctx.setNewPRTitle,
    newPRBody: ctx.newPRBody,
    setNewPRBody: ctx.setNewPRBody,
    newPRHead: ctx.newPRHead,
    setNewPRHeadInput: ctx.setNewPRHeadInput,
    newPRBase: ctx.newPRBase,
    setNewPRBase: ctx.setNewPRBase,
    onCreatePR: ctx.onCreatePR,
    releaseForm: ctx.releaseForm,
    setReleaseForm: ctx.setReleaseForm,
    releaseSubmitting: ctx.releaseSubmitting,
    releaseError: ctx.releaseError,
    releaseSuccess: ctx.releaseSuccess,
    onCreateRelease: ctx.onCreateRelease,
    showReleaseCreator: ctx.showReleaseCreator,
    onOpenReleaseCreator: ctx.onOpenReleaseCreator,
    onCloseReleaseCreator: ctx.onCloseReleaseCreator,
    releaseContextLoading: ctx.releaseContextLoading,
    releaseContextError: ctx.releaseContextError,
    releaseContext: ctx.releaseContext,
    onRefreshReleaseContext: ctx.onRefreshReleaseContext,
    onGenerateReleaseNotes: ctx.onGenerateReleaseNotes,
    releaseNotesGenerating: ctx.releaseNotesGenerating,
    releaseNotesLanguage: ctx.releaseNotesLanguage,
    setReleaseNotesLanguage: ctx.setReleaseNotesLanguage,
    releaseNotesOptions: ctx.releaseNotesOptions,
    setReleaseNotesOptions: ctx.setReleaseNotesOptions,
  },
  workflow: {
    isGitActionRunning: ctx.isGitActionRunning,
    activeGitActionLabel: ctx.activeGitActionLabel,
    runGitCommand: ctx.runGitCommand,
    onFetch: ctx.onFetch,
    onPull: ctx.onPull,
    onPullRebase: ctx.onPullRebase,
    onPullFfOnly: ctx.onPullFfOnly,
    onPullNoFf: ctx.onPullNoFf,
    onPush: ctx.onPush,
    onPushForceWithLease: ctx.onPushForceWithLease,
    onPushTags: ctx.onPushTags,
    onPushSetUpstream: ctx.onPushSetUpstream,
    jobs: ctx.jobs,
    onClearJobs: ctx.onClearJobs,
    autoOpenConflictResolverPath: ctx.autoOpenConflictResolverPath,
    onAutoOpenConflictResolverConsumed: ctx.onAutoOpenConflictResolverConsumed,
    onOpenConflictResolverForPath: ctx.onOpenConflictResolverForPath,
    onConflictMergeContinue: ctx.onConflictMergeContinue,
    onConflictMergeAbort: ctx.onConflictMergeAbort,
    onConflictRebaseContinue: ctx.onConflictRebaseContinue,
    onConflictRebaseAbort: ctx.onConflictRebaseAbort,
  },
  ui: {
    activeTab: ctx.activeTab,
    setActiveTab: ctx.setActiveTab,
    onClearGithubAuthHelpMethod: ctx.onClearGithubAuthHelpMethod,
    onResetLayout: ctx.onResetLayout,
    isRepoPanelCollapsed: ctx.isRepoPanelCollapsed,
    onToggleRepoPanelCollapsed: ctx.onToggleRepoPanelCollapsed,
    isBranchPanelCollapsed: ctx.isBranchPanelCollapsed,
    onToggleBranchPanelCollapsed: ctx.onToggleBranchPanelCollapsed,
    isTagPanelCollapsed: ctx.isTagPanelCollapsed,
    onToggleTagPanelCollapsed: ctx.onToggleTagPanelCollapsed,
    isRemotePanelCollapsed: ctx.isRemotePanelCollapsed,
    onToggleRemotePanelCollapsed: ctx.onToggleRemotePanelCollapsed,
    isSubmodulePanelCollapsed: ctx.isSubmodulePanelCollapsed,
    onToggleSubmodulePanelCollapsed: ctx.onToggleSubmodulePanelCollapsed,
    ...uiState,
  },
});
