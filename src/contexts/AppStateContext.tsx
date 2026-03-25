import { createContext, useContext } from 'react';
import { AppSidebarProps } from '../components/layout/sidebar/AppSidebar.types';
import { GitHubReleaseContextDto } from '../global';
import { GitMergeMode } from '../types/git';

export type AppContextValue = AppSidebarProps & {
  // Navigation & UI (local App.tsx state)
  onClearGithubAuthHelpMethod: () => void;
  onResetLayout: () => void;

  // Git action status
  activeGitActionLabel: string | null;

  // Commit graph
  selectedCommit: string | null;
  setSelectedCommit: (hash: string | null) => void;
  refreshTrigger: number;
  triggerRefresh: () => void;
  showSecondaryHistory: boolean;

  // Branch merge (used by MainView/TopbarActions and CommitGraph)
  onMergeBranch: (branchName: string, mode: GitMergeMode) => void;

  // Remote sync actions
  onFetch: () => void;
  onPull: () => void;
  onPullRebase: () => void;
  onPullFfOnly: () => void;
  onPullNoFf: () => void;
  onPush: () => void;
  onPushForceWithLease: () => void;
  onPushTags: () => void;
  onPushSetUpstream: () => void;
  onOpenRepoWorkspace: () => void;

  // Release creator
  showReleaseCreator: boolean;
  onOpenReleaseCreator: () => void;
  onCloseReleaseCreator: () => void;
  releaseContextLoading: boolean;
  releaseContextError: string | null;
  releaseContext: GitHubReleaseContextDto | null;
  onRefreshReleaseContext: () => Promise<void>;
  onGenerateReleaseNotes: () => Promise<void>;
  releaseNotesGenerating: boolean;
  releaseNotesLanguage: 'de' | 'en';
  setReleaseNotesLanguage: (value: 'de' | 'en') => void;

  // Conflict resolver
  autoOpenConflictResolverPath?: string | null;
  onAutoOpenConflictResolverConsumed?: () => void;
  onOpenConflictResolverForPath?: (path: string) => void;
  onConflictMergeContinue: () => void;
  onConflictMergeAbort: () => void;
  onConflictRebaseContinue: () => void;
  onConflictRebaseAbort: () => void;
};

export const AppStateContext = createContext<AppContextValue | null>(null);

export const useAppContext = (): AppContextValue => {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppContext must be used within AppStateContext.Provider');
  return ctx;
};
