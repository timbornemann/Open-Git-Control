import React from 'react';
import {
  useGithubContext,
  useRepositoryContext,
  useUIContext,
} from '../../../../contexts/AppStateContext';
import { RepoSidebarContent } from '../RepoSidebarContent';

export const RepoSidebarContainer: React.FC = React.memo(() => {
  const ui = useUIContext();
  const repository = useRepositoryContext();
  const github = useGithubContext();

  return (
    <RepoSidebarContent
      activeRepo={repository.activeRepo}
      setActiveTab={ui.setActiveTab}
      branches={repository.branches}
      isCreatingBranch={repository.isCreatingBranch}
      onSetCreatingBranch={repository.onSetCreatingBranch}
      onCreateBranch={repository.onCreateBranch}
      onCheckoutBranch={repository.onCheckoutBranch}
      onSetBranchContextMenu={repository.onSetBranchContextMenu}
      isBranchPanelCollapsed={ui.isBranchPanelCollapsed}
      onToggleBranchPanelCollapsed={ui.onToggleBranchPanelCollapsed}
      tags={repository.tags}
      onCreateTag={repository.onCreateTag}
      onPushTags={repository.onPushTags}
      onDeleteTag={repository.onDeleteTag}
      onSelectTag={repository.onSelectTag}
      isTagPanelCollapsed={ui.isTagPanelCollapsed}
      onToggleTagPanelCollapsed={ui.onToggleTagPanelCollapsed}
      remotes={repository.remotes}
      remoteSync={repository.remoteSync}
      remoteStatus={repository.remoteStatus}
      onAddRemote={repository.onAddRemote}
      onRemoveRemote={repository.onRemoveRemote}
      onRenameRemote={repository.onRenameRemote}
      onSetRemoteUrl={repository.onSetRemoteUrl}
      onRefreshRemote={repository.onRefreshRemote}
      onSetUpstreamForCurrentBranch={repository.onSetUpstreamForCurrentBranch}
      isRemotePanelCollapsed={ui.isRemotePanelCollapsed}
      onToggleRemotePanelCollapsed={ui.onToggleRemotePanelCollapsed}
      submodules={repository.submodules}
      onSubmoduleInitUpdate={repository.onSubmoduleInitUpdate}
      onSubmoduleSync={repository.onSubmoduleSync}
      onOpenSubmodule={repository.onOpenSubmodule}
      isSubmodulePanelCollapsed={ui.isSubmodulePanelCollapsed}
      onToggleSubmodulePanelCollapsed={ui.onToggleSubmodulePanelCollapsed}
      hasRemoteOrigin={repository.hasRemoteOrigin}
      forceGithubRepoCreationPrompt={repository.forceGithubRepoCreationPrompt}
      isConnectingGithubRepo={repository.isConnectingGithubRepo}
      connectError={repository.connectError}
      newRepoName={repository.newRepoName}
      setNewRepoName={repository.setNewRepoName}
      newRepoDescription={repository.newRepoDescription}
      setNewRepoDescription={repository.setNewRepoDescription}
      newRepoPrivate={repository.newRepoPrivate}
      setNewRepoPrivate={repository.setNewRepoPrivate}
      onCreateGithubRepoForCurrent={repository.onCreateGithubRepoForCurrent}
      isAuthenticated={github.isAuthenticated}
      githubUser={github.githubUser}
      githubRepos={github.githubRepos}
      githubReposHasMore={github.githubReposHasMore}
      isLoadingGithubRepos={github.isLoadingGithubRepos}
      isLoadingMoreGithubRepos={github.isLoadingMoreGithubRepos}
      loadMoreGithubRepos={github.loadMoreGithubRepos}
      refreshGithubRepos={github.refreshGithubRepos}
      onLogout={github.onLogout}
      onClone={github.onClone}
      isCloning={github.isCloning}
      openRepos={repository.openRepos}
      onSwitchRepo={repository.onSwitchRepo}
      prOwnerRepo={github.prOwnerRepo}
      prFilter={github.prFilter}
      setPrFilter={github.setPrFilter}
      prLoading={github.prLoading}
      pullRequests={github.pullRequests}
      prCiByNumber={github.prCiByNumber}
      onOpenPR={github.onOpenPR}
      onCopyPRUrl={github.onCopyPRUrl}
      onCheckoutPR={github.onCheckoutPR}
      onMergePR={github.onMergePR}
      showCreatePR={github.showCreatePR}
      setShowCreatePR={github.setShowCreatePR}
      currentBranch={repository.currentBranch}
      setNewPRHead={github.setNewPRHead}
      newPRTitle={github.newPRTitle}
      setNewPRTitle={github.setNewPRTitle}
      newPRBody={github.newPRBody}
      setNewPRBody={github.setNewPRBody}
      newPRHead={github.newPRHead}
      setNewPRHeadInput={github.setNewPRHeadInput}
      newPRBase={github.newPRBase}
      setNewPRBase={github.setNewPRBase}
      onCreatePR={github.onCreatePR}
      releaseForm={github.releaseForm}
      setReleaseForm={github.setReleaseForm}
      releaseSubmitting={github.releaseSubmitting}
      releaseError={github.releaseError}
      releaseSuccess={github.releaseSuccess}
      onCreateRelease={github.onCreateRelease}
      refreshTrigger={repository.refreshTrigger}
    />
  );
});

RepoSidebarContainer.displayName = 'RepoSidebarContainer';
