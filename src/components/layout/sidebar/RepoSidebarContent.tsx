import React from 'react';
import { Github } from 'lucide-react';
import type { AppSidebarProps } from './AppSidebar.types';
import { BranchPanel } from '@/components/sidebar/BranchPanel';
import { TagPanel } from '@/components/sidebar/TagPanel';
import { RemotePanel } from '@/components/sidebar/RemotePanel';
import { SubmodulePanel } from '@/components/sidebar/SubmodulePanel';
import { RepoCard, RepoCardContent, RepoCardHeader, RepoCardStatus } from '@/components/sidebar/RepoCard';
import { RepoGithubActionsContent } from './RepoGithubActionsContent';
import { useI18n } from '@/i18n';

type RepoSidebarContentProps = Pick<
  AppSidebarProps,
  | 'activeRepo'
  | 'setActiveTab'
  | 'branches'
  | 'isCreatingBranch'
  | 'onSetCreatingBranch'
  | 'onCreateBranch'
  | 'onCheckoutBranch'
  | 'onSetBranchContextMenu'
  | 'isBranchPanelCollapsed'
  | 'onToggleBranchPanelCollapsed'
  | 'tags'
  | 'onCreateTag'
  | 'onPushTags'
  | 'onDeleteTag'
  | 'onSelectTag'
  | 'isTagPanelCollapsed'
  | 'onToggleTagPanelCollapsed'
  | 'remotes'
  | 'remoteSync'
  | 'remoteStatus'
  | 'onAddRemote'
  | 'onRemoveRemote'
  | 'onRenameRemote'
  | 'onSetRemoteUrl'
  | 'onRefreshRemote'
  | 'onSetUpstreamForCurrentBranch'
  | 'isRemotePanelCollapsed'
  | 'onToggleRemotePanelCollapsed'
  | 'submodules'
  | 'onSubmoduleInitUpdate'
  | 'onSubmoduleSync'
  | 'onOpenSubmodule'
  | 'isSubmodulePanelCollapsed'
  | 'onToggleSubmodulePanelCollapsed'
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
  | 'isAuthenticated'
  | 'githubUser'
  | 'githubRepos'
  | 'githubReposHasMore'
  | 'isLoadingGithubRepos'
  | 'isLoadingMoreGithubRepos'
  | 'loadMoreGithubRepos'
  | 'refreshGithubRepos'
  | 'onLogout'
  | 'onClone'
  | 'isCloning'
  | 'openRepos'
  | 'onSwitchRepo'
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
  | 'releaseError'
  | 'releaseSuccess'
  | 'onCreateRelease'
> & {
  refreshTrigger: number;
};

export const RepoSidebarContent: React.FC<RepoSidebarContentProps> = (props) => {
  const { t } = useI18n();
  const shouldShowGithubConnect = props.hasRemoteOrigin === false || props.forceGithubRepoCreationPrompt;

  if (!props.activeRepo) {
    return (
      <RepoCard className="repo-empty-card">
        <div className="repo-state-text" style={{ fontSize: '0.82rem' }}>
          {t('generated.components.layout.sidebar.reposidebarcontent.no_active_repository_please_select_a_local_repository_fi_5152f3b9')}
        </div>
        <button className="staging-tool-btn" onClick={() => props.setActiveTab('localRepos')}>
          {t('generated.components.layout.sidebar.reposidebarcontent.go_to_local_repositories_0c75965d')}
        </button>
      </RepoCard>
    );
  }

  const repoName = props.activeRepo.split(/[\\/]/).filter(Boolean).pop() || props.activeRepo;

  return (
    <div className="repo-cockpit">
      <div className="repo-cockpit-header">
        <div className="repo-cockpit-kicker">{t('generated.components.layout.sidebar.reposidebarcontent.repository_workspace_4af6930f')}</div>
        <div className="repo-cockpit-title" title={repoName}>
          {repoName}
        </div>
        <div className="repo-cockpit-path" title={props.activeRepo}>
          {props.activeRepo}
        </div>
      </div>

      <RemotePanel
        remotes={props.remotes}
        remoteSync={props.remoteSync}
        remoteStatus={props.remoteStatus}
        onAddRemote={props.onAddRemote}
        onRemoveRemote={props.onRemoveRemote}
        onRenameRemote={props.onRenameRemote}
        onSetRemoteUrl={props.onSetRemoteUrl}
        onRefreshRemote={props.onRefreshRemote}
        onSetUpstreamForCurrentBranch={props.onSetUpstreamForCurrentBranch}
        collapsed={props.isRemotePanelCollapsed}
        onToggleCollapsed={props.onToggleRemotePanelCollapsed}
      />

      <BranchPanel
        branches={props.branches}
        isCreatingBranch={props.isCreatingBranch}
        onSetCreatingBranch={props.onSetCreatingBranch}
        onCreateBranch={props.onCreateBranch}
        onCheckoutBranch={props.onCheckoutBranch}
        onSetBranchContextMenu={props.onSetBranchContextMenu}
        collapsed={props.isBranchPanelCollapsed}
        onToggleCollapsed={props.onToggleBranchPanelCollapsed}
      />

      <TagPanel
        tags={props.tags}
        onCreateTag={props.onCreateTag}
        onPushTags={props.onPushTags}
        onDeleteTag={props.onDeleteTag}
        onSelectTag={props.onSelectTag}
        collapsed={props.isTagPanelCollapsed}
        onToggleCollapsed={props.onToggleTagPanelCollapsed}
      />

      <SubmodulePanel
        submodules={props.submodules}
        onInitUpdate={props.onSubmoduleInitUpdate}
        onSync={props.onSubmoduleSync}
        onOpenSubmodule={props.onOpenSubmodule}
        collapsed={props.isSubmodulePanelCollapsed}
        onToggleCollapsed={props.onToggleSubmodulePanelCollapsed}
      />

      {shouldShowGithubConnect && (
        <RepoCard>
          <RepoCardHeader title={t('generated.components.layout.sidebar.reposidebarcontent.github_connection_461ea598')} />
          <RepoCardContent className="repo-form-stack">
            <RepoCardStatus
              variant="warning"
              title={
                props.hasRemoteOrigin === false
                  ? t('generated.components.layout.sidebar.reposidebarcontent.not_connected_to_github_yet_9a7afeaa')
                  : t('generated.components.layout.sidebar.reposidebarcontent.remote_is_no_longer_valid_6ffdf83b')
              }
              detail={
                props.hasRemoteOrigin === false
                  ? t('generated.components.layout.sidebar.reposidebarcontent.create_a_github_repository_and_connect_it_as_origin_83d10e69')
                  : t('generated.components.layout.sidebar.reposidebarcontent.please_create_a_new_github_repository_origin_will_be_rep_882432c5')
              }
            />
            <div className="repo-form-stack">
              <input
                className="repo-filter-input"
                type="text"
                placeholder={t('generated.components.layout.sidebar.reposidebarcontent.repository_name_on_github_9ca29e86')}
                value={props.newRepoName}
                onChange={(e) => props.setNewRepoName(e.target.value)}
              />
              <textarea
                className="repo-filter-input"
                placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.description_optional_30003d39')}
                value={props.newRepoDescription}
                onChange={(e) => props.setNewRepoDescription(e.target.value)}
                rows={2}
                style={{ resize: 'vertical' }}
              />
              <div className="repo-check-row">
                <label>
                  <input type="checkbox" checked={props.newRepoPrivate} onChange={(e) => props.setNewRepoPrivate(e.target.checked)} />
                  {t('generated.components.layout.sidebar.reposidebarcontent.private_d6902471')}
                </label>
              </div>
            </div>
            {props.connectError && (
              <div className="repo-state-text" style={{ fontSize: '0.8rem', color: 'var(--status-danger)' }}>
                {props.connectError}
              </div>
            )}
            <button
              className="staging-tool-btn"
              onClick={props.onCreateGithubRepoForCurrent}
              disabled={props.isConnectingGithubRepo}
              style={{
                padding: '6px 10px',
                backgroundColor: !props.isConnectingGithubRepo ? 'var(--accent-primary)' : 'var(--bg-dark)',
                color: !props.isConnectingGithubRepo ? 'var(--on-accent)' : 'var(--text-secondary)',
                borderColor: !props.isConnectingGithubRepo ? 'var(--accent-primary)' : 'var(--border-color)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Github size={14} />
              {props.isConnectingGithubRepo
                ? t('generated.components.layout.sidebar.githubauthcontent.connecting_a77827d1')
                : t('generated.components.layout.sidebar.reposidebarcontent.create_connect_github_repo_68e77480')}
            </button>
            {!props.isAuthenticated && (
              <div className="repo-state-text" style={{ fontSize: '0.78rem' }}>
                {t('generated.components.layout.sidebar.reposidebarcontent.note_please_sign_in_first_in_the_github_tab_a84a54c9')}
              </div>
            )}
          </RepoCardContent>
        </RepoCard>
      )}

      {!props.isAuthenticated && (
        <RepoCard>
          <RepoCardHeader title="GitHub Actions" />
          <RepoCardContent className="repo-form-stack">
            <RepoCardStatus
              variant="neutral"
              title={t('generated.components.layout.sidebar.reposidebarcontent.github_sign_in_required_dabe2882')}
              detail={t('generated.components.layout.sidebar.reposidebarcontent.please_sign_in_to_github_first_for_pull_requests_release_cd7a7c88')}
            />
            <button className="staging-tool-btn" onClick={() => props.setActiveTab('github')}>
              {t('generated.components.layout.sidebar.reposidebarcontent.go_to_github_tab_f834a24c')}
            </button>
          </RepoCardContent>
        </RepoCard>
      )}

      {props.isAuthenticated && <RepoGithubActionsContent {...props} />}
    </div>
  );
};
