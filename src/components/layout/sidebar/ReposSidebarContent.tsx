import React from 'react';
import { Github } from 'lucide-react';
import { RepoList } from '../../sidebar/RepoList';
import { BranchPanel } from '../../sidebar/BranchPanel';
import { TagPanel } from '../../sidebar/TagPanel';
import { RemotePanel } from '../../sidebar/RemotePanel';
import { AppSidebarProps } from './AppSidebar.types';
import { useI18n } from '../../../i18n';

type ReposSidebarContentProps = Pick<
  AppSidebarProps,
  | 'openRepos'
  | 'repoMeta'
  | 'activeRepo'
  | 'onOpenFolder'
  | 'onSwitchRepo'
  | 'onCloseRepo'
  | 'onToggleRepoPin'
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
>;

export const ReposSidebarContent: React.FC<ReposSidebarContentProps> = ({
  openRepos,
  repoMeta,
  activeRepo,
  onOpenFolder,
  onSwitchRepo,
  onCloseRepo,
  onToggleRepoPin,
  branches,
  isCreatingBranch,
  newBranchName,
  newBranchInputRef,
  onSetCreatingBranch,
  onSetNewBranchName,
  onCreateBranch,
  onCheckoutBranch,
  onSetBranchContextMenu,
  isBranchPanelCollapsed,
  onToggleBranchPanelCollapsed,
  tags,
  onCreateTag,
  onPushTags,
  onDeleteTag,
  remotes,
  remoteSync,
  remoteStatus,
  remoteOnlyBranchesCount,
  remoteOnlyBranches,
  onAddRemote,
  onRemoveRemote,
  onRefreshRemote,
  onSetUpstreamForCurrentBranch,
  onCheckoutRemoteBranch,
  isRemotePanelCollapsed,
  onToggleRemotePanelCollapsed,
  hasRemoteOrigin,
  isConnectingGithubRepo,
  connectError,
  newRepoName,
  setNewRepoName,
  newRepoDescription,
  setNewRepoDescription,
  newRepoPrivate,
  setNewRepoPrivate,
  onCreateGithubRepoForCurrent,
  isAuthenticated,
}) => {
  const { tr } = useI18n();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <RepoList
        openRepos={openRepos}
        repoMeta={repoMeta}
        activeRepo={activeRepo}
        onSwitchRepo={onSwitchRepo}
        onCloseRepo={onCloseRepo}
        onOpenFolder={onOpenFolder}
        onTogglePin={onToggleRepoPin}
      />

      {activeRepo && (
        <BranchPanel
          branches={branches}
          isCreatingBranch={isCreatingBranch}
          newBranchName={newBranchName}
          newBranchInputRef={newBranchInputRef}
          onSetCreatingBranch={onSetCreatingBranch}
          onSetNewBranchName={onSetNewBranchName}
          onCreateBranch={onCreateBranch}
          onCheckoutBranch={onCheckoutBranch}
          onSetBranchContextMenu={onSetBranchContextMenu}
          collapsed={isBranchPanelCollapsed}
          onToggleCollapsed={onToggleBranchPanelCollapsed}
        />
      )}

      {activeRepo && (
        <TagPanel
          tags={tags}
          onCreateTag={onCreateTag}
          onPushTags={onPushTags}
          onDeleteTag={onDeleteTag}
        />
      )}

      {activeRepo && (
        <RemotePanel
          remotes={remotes}
          remoteSync={remoteSync}
          remoteStatus={remoteStatus}
          remoteOnlyBranchesCount={remoteOnlyBranchesCount}
          remoteOnlyBranches={remoteOnlyBranches}
          onAddRemote={onAddRemote}
          onRemoveRemote={onRemoveRemote}
          onRefreshRemote={onRefreshRemote}
          onSetUpstreamForCurrentBranch={onSetUpstreamForCurrentBranch}
          onCheckoutRemoteBranch={onCheckoutRemoteBranch}
          collapsed={isRemotePanelCollapsed}
          onToggleCollapsed={onToggleRemotePanelCollapsed}
        />
      )}

      {activeRepo && hasRemoteOrigin === false && (
        <>
          <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '8px 0' }} />
          <div
            style={{
              padding: '10px',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              {tr('Noch nicht mit GitHub verbunden.', 'Not connected to GitHub yet.')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input
                type="text"
                placeholder={tr('Repository-Name auf GitHub', 'Repository name on GitHub')}
                value={newRepoName}
                onChange={e => setNewRepoName(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-dark)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                }}
              />
              <textarea
                placeholder={tr('Beschreibung (optional)', 'Description (optional)')}
                value={newRepoDescription}
                onChange={e => setNewRepoDescription(e.target.value)}
                rows={2}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-dark)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  resize: 'vertical',
                }}
              />
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={newRepoPrivate}
                  onChange={e => setNewRepoPrivate(e.target.checked)}
                />
                {tr('Privat', 'Private')}
              </label>
            </div>
            {connectError && (
              <div style={{ fontSize: '0.8rem', color: '#f85149' }}>
                {connectError}
              </div>
            )}
            <button
              onClick={onCreateGithubRepoForCurrent}
              disabled={isConnectingGithubRepo}
              style={{
                padding: '6px 10px',
                backgroundColor: !isConnectingGithubRepo ? 'var(--accent-primary)' : 'var(--bg-dark)',
                color: !isConnectingGithubRepo ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '4px',
                cursor: !isConnectingGithubRepo ? 'pointer' : 'not-allowed',
                fontSize: '0.8rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Github size={14} />
              {isConnectingGithubRepo ? tr('Verbinde...', 'Connecting...') : tr('GitHub-Repo erstellen & verbinden', 'Create & connect GitHub repo')}
            </button>
            {!isAuthenticated && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {tr('Hinweis: Bitte zuerst im GitHub-Tab anmelden.', 'Note: Please sign in first in the GitHub tab.')}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
