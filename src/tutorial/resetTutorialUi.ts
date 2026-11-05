import { queryClient } from '@/data/queryClient';
import { setActiveResourceRepository } from '@/data/clientCache';
import { useHostingState } from '@/components/hosting/hostingState';
import { useAnalyticsWorkspace } from '@/components/repository-analytics/analyticsWorkspaceState';
import { initialRemoteTransferState, useRemoteTransferState } from '@/components/hosting/remoteTransferState';
import { useRemoteTransferDialogState } from '@/components/hosting/remoteTransferDialogState';
import { usePlannerWorkDialogState } from '@/components/project-planner/plannerWorkDialogState';
import { useBranchChangeDialogState } from '@/components/branch-change/branchChangeDialogState';
import { resetCommitFormDraft } from '@/components/staging-area/commitFormDraft';
import { usePublicationDraftState } from '@/components/repository-publication/publicationDraftState';
import { allowlistDrafts } from '@/components/repository-security/allowlistDrafts';
import { DEMO_REPO, DEMO_SECOND_REPO, DEMO_NEW_REPO, DEMO_CLONE_REPO } from './demoRepository';

/** All modules here belong to the tutorial renderer's own JavaScript realm. */
export function resetTutorialUi(): void {
  if (!window.tutorialHost || window.electronAPI) throw new Error('An isolated tutorial renderer is required.');
  // A remounted App initially has no active repository. Its null config must
  // be cached at application scope, never over the next repository's config.
  setActiveResourceRepository(null);
  queryClient.clear();
  window.localStorage.clear();
  window.sessionStorage.clear();
  useHostingState.setState(useHostingState.getInitialState());
  useAnalyticsWorkspace.setState({ filters: {}, snapshots: {} });
  useRemoteTransferState.setState(initialRemoteTransferState());
  useRemoteTransferDialogState.setState(useRemoteTransferDialogState.getInitialState());
  usePlannerWorkDialogState.getState().close();
  useBranchChangeDialogState.getState().pending?.finish(null);
  useBranchChangeDialogState.setState({ pending: null });
  usePublicationDraftState.setState(usePublicationDraftState.getInitialState());
  allowlistDrafts.clear();
  for (const path of [DEMO_REPO, DEMO_SECOND_REPO, DEMO_NEW_REPO, DEMO_CLONE_REPO]) resetCommitFormDraft(path);
}
