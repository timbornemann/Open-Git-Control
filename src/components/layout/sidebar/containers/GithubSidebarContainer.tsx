import React from 'react';
import { useGithubContext, useRepositoryContext } from '@/contexts/AppStateContext';
import { GithubAuthContent } from '@/components/layout/sidebar/GithubAuthContent';
import { GithubConnectedContent } from '@/components/layout/sidebar/GithubConnectedContent';

const GithubAuthSidebarContainer: React.FC = React.memo(() => {
  const github = useGithubContext();

  return (
    <GithubAuthContent
      tokenInput={github.tokenInput}
      setTokenInput={github.setTokenInput}
      isAuthenticating={github.isAuthenticating}
      authError={github.authError}
      setAuthError={github.setAuthError}
      onTokenLogin={github.onTokenLogin}
      oauthConfigured={github.oauthConfigured}
      deviceFlow={github.deviceFlow}
      isDeviceFlowRunning={github.isDeviceFlowRunning}
      deviceFlowError={github.deviceFlowError}
      onStartDeviceFlowLogin={github.onStartDeviceFlowLogin}
      onCancelDeviceFlow={github.onCancelDeviceFlow}
      isWebFlowRunning={github.isWebFlowRunning}
      webFlowError={github.webFlowError}
      onStartWebFlowLogin={github.onStartWebFlowLogin}
      selectedGithubAuthHelpMethod={github.selectedGithubAuthHelpMethod}
      onSelectGithubAuthHelpMethod={github.onSelectGithubAuthHelpMethod}
    />
  );
});

GithubAuthSidebarContainer.displayName = 'GithubAuthSidebarContainer';

const GithubConnectedSidebarContainer: React.FC = React.memo(() => {
  const repository = useRepositoryContext();
  const github = useGithubContext();

  return (
    <GithubConnectedContent
      githubUser={github.githubUser}
      githubRepos={github.githubRepos}
      githubReposHasMore={github.githubReposHasMore}
      isLoadingGithubRepos={github.isLoadingGithubRepos}
      isLoadingMoreGithubRepos={github.isLoadingMoreGithubRepos}
      loadMoreGithubRepos={github.loadMoreGithubRepos}
      refreshGithubRepos={github.refreshGithubRepos}
      onLogout={github.onLogout}
      onClone={github.onClone}
      onCloneByUrl={repository.onCloneByUrl}
      onForkByUrl={github.onForkByUrl}
      isCloning={github.isCloning}
      openRepos={repository.openRepos}
      activeRepo={repository.activeRepo}
      onSwitchRepo={repository.onSwitchRepo}
      prOwnerRepo={github.prOwnerRepo}
      prFilter={github.prFilter}
      setPrFilter={github.setPrFilter}
      prLoading={github.prLoading}
      prError={github.prError}
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
    />
  );
});

GithubConnectedSidebarContainer.displayName = 'GithubConnectedSidebarContainer';

export const GithubSidebarContainer: React.FC = React.memo(() => {
  const { isAuthenticated } = useGithubContext();
  return isAuthenticated ? <GithubConnectedSidebarContainer /> : <GithubAuthSidebarContainer />;
});

GithubSidebarContainer.displayName = 'GithubSidebarContainer';
