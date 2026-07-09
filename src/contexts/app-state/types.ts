import type { Dispatch, PointerEvent as ReactPointerEvent, SetStateAction } from 'react';
import type {
  BranchContextMenuState,
  CommitNavigationRequest,
  ConfirmDialogState,
  GithubStateContract,
  InputDialogState,
  RepositoryStateContract,
  RunGitCommandOptions,
  SettingsStateContract,
  SidebarCoreState,
  WorkflowStateContract,
} from '@/app/state/contracts';
import type { GitHubReleaseContextDto } from '@/global';
import type { GitMergeMode } from '@/types/git';
import type { ReleaseNotesOptions } from '@/types/releaseNotes';
import type { ReleaseVersionBump } from '@/utils/releaseTagSuggestion';

export type { CommitNavigationRequest } from '@/app/state/contracts';

export type BaseUIContextValue = SidebarCoreState & {
  onClearGithubAuthHelpMethod: () => void;
  onResetLayout: () => void;
};

export type SettingsContextValue = SettingsStateContract;

export type RepositoryContextValue = RepositoryStateContract & {
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

export type GithubContextValue = GithubStateContract & {
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

export type WorkflowContextValue = WorkflowStateContract & {
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
