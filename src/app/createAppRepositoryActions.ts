import type { useAppState } from '@/components/layout/useAppState';
import { requestRemoteTransfer } from '@/components/hosting/remoteTransferDialogState';
import { requestWorkingDirectoryNavigation } from '@/components/working-directory/workingDirectoryNavigationGuard';
import { invalidateResources } from '@/data/clientCache';
import { normalizeRepoPathKey } from '@/utils/repoPath';

type State = Pick<
  ReturnType<typeof useAppState>,
  | 'activeRepo'
  | 'handleOpenFolder'
  | 'handleCloneByUrl'
  | 'setGitActionToast'
  | 'triggerRefresh'
  | 'setActiveTab'
  | 'isBranchPanelCollapsed'
  | 'toggleBranchPanelCollapsed'
  | 'setIsCreatingBranch'
>;

/** Shared entry points for keyboard shortcuts and the command palette. */
export function createAppRepositoryActions({ state, revealSidebar, tr }: { state: State; revealSidebar: () => void; tr: (de: string, en: string) => string }) {
  const requireRepository = (run: (repoPath: string) => void) => {
    if (state.activeRepo) run(state.activeRepo);
    else state.setGitActionToast({ msg: tr('Bitte zuerst ein Repository öffnen.', 'Please open a repository first.'), isError: true });
  };
  return {
    open: () => state.handleOpenFolder(),
    clone: () => state.handleCloneByUrl(),
    refresh: () =>
      requireRepository((repoPath) => {
        invalidateResources('git', normalizeRepoPathKey(repoPath));
        state.triggerRefresh();
      }),
    createBranch: () =>
      requireRepository(() => {
        requestWorkingDirectoryNavigation({ kind: 'view', label: 'create branch' }, () => {
          state.setActiveTab('repo');
          revealSidebar();
          if (state.isBranchPanelCollapsed) state.toggleBranchPanelCollapsed();
          state.setIsCreatingBranch(true);
        });
      }),
    fetch: () => requireRepository((repoPath) => requestRemoteTransfer({ repoPath, mode: 'fetch' })),
    pull: () => requireRepository((repoPath) => requestRemoteTransfer({ repoPath, mode: 'pull' })),
    push: () => requireRepository((repoPath) => requestRemoteTransfer({ repoPath, mode: 'push' })),
  };
}

export type AppRepositoryActions = ReturnType<typeof createAppRepositoryActions>;
