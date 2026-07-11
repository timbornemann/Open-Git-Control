import React from 'react';
import { Github, LogOut } from 'lucide-react';
import type { AppSidebarProps } from './AppSidebar.types';
import { useI18n } from '@/i18n';
import { GithubRepoList } from './GithubRepoList';
import { PullRequestPanel } from './PullRequestPanel';
import { ReleaseMiniForm } from './ReleaseMiniForm';

type GithubConnectedContentProps = Pick<
  AppSidebarProps,
  | 'githubUser'
  | 'authError'
  | 'githubRepos'
  | 'githubReposHasMore'
  | 'isLoadingGithubRepos'
  | 'isLoadingMoreGithubRepos'
  | 'loadMoreGithubRepos'
  | 'refreshGithubRepos'
  | 'onLogout'
  | 'onClone'
  | 'onCloneByUrl'
  | 'onForkByUrl'
  | 'isCloning'
  | 'openRepos'
  | 'activeRepo'
  | 'onSwitchRepo'
  | 'prOwnerRepo'
  | 'prFilter'
  | 'setPrFilter'
  | 'prLoading'
  | 'prHasLoaded'
  | 'prError'
  | 'pullRequests'
  | 'prCiByNumber'
  | 'onOpenPR'
  | 'onCopyPRUrl'
  | 'onCheckoutPR'
  | 'onMergePR'
  | 'showCreatePR'
  | 'setShowCreatePR'
  | 'currentBranch'
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
  | 'releaseNotesGenerating'
  | 'releaseError'
  | 'releaseSuccess'
  | 'onCreateRelease'
>;

export const GithubConnectedContent: React.FC<GithubConnectedContentProps> = ({
  githubUser,
  authError,
  githubRepos,
  githubReposHasMore,
  isLoadingGithubRepos,
  isLoadingMoreGithubRepos,
  loadMoreGithubRepos,
  refreshGithubRepos,
  onLogout,
  onClone,
  onCloneByUrl,
  onForkByUrl,
  isCloning,
  openRepos,
  activeRepo,
  onSwitchRepo,
  prOwnerRepo,
  prFilter,
  setPrFilter,
  prLoading,
  prHasLoaded,
  prError,
  pullRequests,
  prCiByNumber,
  onOpenPR,
  onCopyPRUrl,
  onCheckoutPR,
  onMergePR,
  showCreatePR,
  setShowCreatePR,
  currentBranch,
  setNewPRHead,
  newPRTitle,
  setNewPRTitle,
  newPRBody,
  setNewPRBody,
  newPRHead,
  setNewPRHeadInput,
  newPRBase,
  setNewPRBase,
  onCreatePR,
  releaseForm,
  setReleaseForm,
  releaseSubmitting,
  releaseNotesGenerating,
  releaseError,
  releaseSuccess,
  onCreateRelease,
}) => {
  const { t } = useI18n();
  const releaseOwnerRepo = prOwnerRepo?.headOwner ? { owner: prOwnerRepo.headOwner, repo: prOwnerRepo.headRepo || prOwnerRepo.repo } : prOwnerRepo;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px',
          backgroundColor: 'var(--bg-panel)',
          borderRadius: '6px',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Github size={16} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
            {githubUser || t('generated.components.layout.sidebar.githubconnectedcontent.connected_64357a97')}
          </span>
        </div>
        <button
          onClick={onLogout}
          className="icon-btn"
          style={{ padding: '4px' }}
          title={t('generated.components.layout.sidebar.githubconnectedcontent.sign_out_2e3efcd4')}
        >
          <LogOut size={14} />
        </button>
      </div>
      {authError && (
        <div
          role="status"
          style={{
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid var(--status-warning-border)',
            background: 'var(--status-warning-soft)',
            color: 'var(--status-warning)',
            fontSize: '0.78rem',
          }}
        >
          {authError}
        </div>
      )}

      <GithubRepoList
        repos={githubRepos}
        hasMore={githubReposHasMore}
        isLoading={isLoadingGithubRepos}
        isLoadingMore={isLoadingMoreGithubRepos}
        isCloning={isCloning}
        openRepos={openRepos}
        activeRepo={activeRepo}
        onClone={onClone}
        onCloneByUrl={onCloneByUrl}
        onForkByUrl={onForkByUrl}
        onSwitchRepo={onSwitchRepo}
        onLoadMore={loadMoreGithubRepos}
        onRefresh={refreshGithubRepos}
      />

      {prOwnerRepo && (
        <>
          <PullRequestPanel
            ownerRepo={prOwnerRepo}
            prFilter={prFilter}
            setPrFilter={setPrFilter}
            prLoading={prLoading}
            prHasLoaded={prHasLoaded}
            prError={prError}
            pullRequests={pullRequests}
            prCiByNumber={prCiByNumber}
            showCreatePR={showCreatePR}
            setShowCreatePR={setShowCreatePR}
            currentBranch={currentBranch}
            setNewPRHead={setNewPRHead}
            newPRTitle={newPRTitle}
            setNewPRTitle={setNewPRTitle}
            newPRBody={newPRBody}
            setNewPRBody={setNewPRBody}
            newPRHead={newPRHead}
            setNewPRHeadInput={setNewPRHeadInput}
            newPRBase={newPRBase}
            setNewPRBase={setNewPRBase}
            onCreatePR={onCreatePR}
            onOpenPR={onOpenPR}
            onCopyPRUrl={onCopyPRUrl}
            onCheckoutPR={onCheckoutPR}
            onMergePR={onMergePR}
          />
          <ReleaseMiniForm
            ownerRepo={releaseOwnerRepo}
            releaseForm={releaseForm}
            setReleaseForm={setReleaseForm}
            releaseSubmitting={releaseSubmitting}
            releaseNotesGenerating={releaseNotesGenerating}
            releaseError={releaseError}
            releaseSuccess={releaseSuccess}
            onCreateRelease={onCreateRelease}
            onOpenUrl={onOpenPR}
          />
        </>
      )}
    </div>
  );
};
