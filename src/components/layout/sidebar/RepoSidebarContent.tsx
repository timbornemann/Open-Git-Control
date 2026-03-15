import React from 'react';
import { Github } from 'lucide-react';
import { AppSidebarProps } from './AppSidebar.types';
import { BranchPanel } from '../../sidebar/BranchPanel';
import { TagPanel } from '../../sidebar/TagPanel';
import { RemotePanel } from '../../sidebar/RemotePanel';
import { SubmodulePanel } from '../../sidebar/SubmodulePanel';
import { RepoGithubActionsContent } from './RepoGithubActionsContent';
import { useI18n } from '../../../i18n';

type RepoSidebarContentProps = Pick<
  AppSidebarProps,
  | 'activeRepo'
  | 'setActiveTab'
  | 'branches'
  | 'isCreatingBranch'
  | 'newBranchName'
  | 'newBranchInputRef'
  | 'onSetCreatingBranch'
  | 'onSetNewBranchName'
  | 'onCreateBranch'
  | 'onCheckoutBranch'
  | 'onSetBranchContextMenu'
  | 'isBranchPanelCollapsed'
  | 'onToggleBranchPanelCollapsed'
  | 'tags'
  | 'onCreateTag'
  | 'onPushTags'
  | 'onDeleteTag'
  | 'isTagPanelCollapsed'
  | 'onToggleTagPanelCollapsed'
  | 'remotes'
  | 'remoteSync'
  | 'remoteStatus'
  | 'remoteOnlyBranchesCount'
  | 'remoteOnlyBranches'
  | 'onAddRemote'
  | 'onRemoveRemote'
  | 'onRefreshRemote'
  | 'onSetUpstreamForCurrentBranch'
  | 'onCheckoutRemoteBranch'
  | 'isRemotePanelCollapsed'
  | 'onToggleRemotePanelCollapsed'
  | 'submodules'
  | 'onSubmoduleInitUpdate'
  | 'onSubmoduleSync'
  | 'onOpenSubmodule'
  | 'isSubmodulePanelCollapsed'
  | 'onToggleSubmodulePanelCollapsed'
  | 'hasRemoteOrigin'
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
  | 'githubRepoSearch'
  | 'setGithubRepoSearch'
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
>;

export const RepoSidebarContent: React.FC<RepoSidebarContentProps> = (props) => {
  const { tr } = useI18n();

  if (!props.activeRepo) {
    return (
      <div className="repo-card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          {tr('Kein aktives Repository. Bitte waehle zuerst ein lokales Repository.', 'No active repository. Please select a local repository first.')}
        </div>
        <button className="staging-tool-btn" onClick={() => props.setActiveTab('localRepos')}>
          {tr('Zu Lokale Repositories', 'Go to Local repositories')}
        </button>
      </div>
    );
  }

  return (
    <div className="repo-cockpit">
      <BranchPanel
        branches={props.branches}
        isCreatingBranch={props.isCreatingBranch}
        newBranchName={props.newBranchName}
        newBranchInputRef={props.newBranchInputRef}
        onSetCreatingBranch={props.onSetCreatingBranch}
        onSetNewBranchName={props.onSetNewBranchName}
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
        collapsed={props.isTagPanelCollapsed}
        onToggleCollapsed={props.onToggleTagPanelCollapsed}
      />

      <RemotePanel
        remotes={props.remotes}
        remoteSync={props.remoteSync}
        remoteStatus={props.remoteStatus}
        remoteOnlyBranchesCount={props.remoteOnlyBranchesCount}
        remoteOnlyBranches={props.remoteOnlyBranches}
        onAddRemote={props.onAddRemote}
        onRemoveRemote={props.onRemoveRemote}
        onRefreshRemote={props.onRefreshRemote}
        onSetUpstreamForCurrentBranch={props.onSetUpstreamForCurrentBranch}
        onCheckoutRemoteBranch={props.onCheckoutRemoteBranch}
        collapsed={props.isRemotePanelCollapsed}
        onToggleCollapsed={props.onToggleRemotePanelCollapsed}
      />

      <SubmodulePanel
        submodules={props.submodules}
        onInitUpdate={props.onSubmoduleInitUpdate}
        onSync={props.onSubmoduleSync}
        onOpenSubmodule={props.onOpenSubmodule}
        collapsed={props.isSubmodulePanelCollapsed}
        onToggleCollapsed={props.onToggleSubmodulePanelCollapsed}
      />

      {props.hasRemoteOrigin === false && (
          <div className="repo-card" style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              {tr('Noch nicht mit GitHub verbunden.', 'Not connected to GitHub yet.')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input
                type="text"
                placeholder={tr('Repository-Name auf GitHub', 'Repository name on GitHub')}
                value={props.newRepoName}
                onChange={e => props.setNewRepoName(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
              />
              <textarea
                placeholder={tr('Beschreibung (optional)', 'Description (optional)')}
                value={props.newRepoDescription}
                onChange={e => props.setNewRepoDescription(e.target.value)}
                rows={2}
                style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.8rem', resize: 'vertical' }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={props.newRepoPrivate} onChange={e => props.setNewRepoPrivate(e.target.checked)} />
                {tr('Privat', 'Private')}
              </label>
            </div>
            {props.connectError && <div style={{ fontSize: '0.8rem', color: 'var(--status-danger)' }}>{props.connectError}</div>}
            <button
              onClick={props.onCreateGithubRepoForCurrent}
              disabled={props.isConnectingGithubRepo}
              style={{ padding: '6px 10px', backgroundColor: !props.isConnectingGithubRepo ? 'var(--accent-primary)' : 'var(--bg-dark)', color: !props.isConnectingGithubRepo ? 'var(--on-accent)' : 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: !props.isConnectingGithubRepo ? 'pointer' : 'not-allowed', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Github size={14} />
              {props.isConnectingGithubRepo ? tr('Verbinde...', 'Connecting...') : tr('GitHub-Repo erstellen & verbinden', 'Create & connect GitHub repo')}
            </button>
            {!props.isAuthenticated && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {tr('Hinweis: Bitte zuerst im GitHub-Tab anmelden.', 'Note: Please sign in first in the GitHub tab.')}
              </div>
            )}
          </div>
      )}

      {!props.isAuthenticated && (
        <div className="repo-card" style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {tr('Fuer Pull Requests, Releases und Workflows bitte erst bei GitHub anmelden.', 'Please sign in to GitHub first for pull requests, releases, and workflows.')}
          </div>
          <button className="staging-tool-btn" onClick={() => props.setActiveTab('github')}>
            {tr('Zum GitHub-Tab', 'Go to GitHub tab')}
          </button>
        </div>
      )}

      {props.isAuthenticated && (
        <RepoGithubActionsContent {...props} />
      )}
    </div>
  );
};
