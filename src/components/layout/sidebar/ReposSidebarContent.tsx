import React from 'react';
import { Github } from 'lucide-react';
import { RepoList } from '../../sidebar/RepoList';
import { BranchPanel } from '../../sidebar/BranchPanel';
import { TagPanel } from '../../sidebar/TagPanel';
import { RemotePanel } from '../../sidebar/RemotePanel';
import { AppSidebarProps } from './AppSidebar.types';

type ReposSidebarContentProps = Pick<
  AppSidebarProps,
  | 'openRepos'
  | 'activeRepo'
  | 'onOpenFolder'
  | 'onSwitchRepo'
  | 'onCloseRepo'
  | 'branches'
  | 'isCreatingBranch'
  | 'newBranchName'
  | 'newBranchInputRef'
  | 'onSetCreatingBranch'
  | 'onSetNewBranchName'
  | 'onCreateBranch'
  | 'onCheckoutBranch'
  | 'onSetBranchContextMenu'
  | 'tags'
  | 'onCreateTag'
  | 'onPushTags'
  | 'onDeleteTag'
  | 'remotes'
  | 'remoteSync'
  | 'remoteStatus'
  | 'remoteOnlyBranchesCount'
  | 'onAddRemote'
  | 'onRemoveRemote'
  | 'onRefreshRemote'
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
  activeRepo,
  onOpenFolder,
  onSwitchRepo,
  onCloseRepo,
  branches,
  isCreatingBranch,
  newBranchName,
  newBranchInputRef,
  onSetCreatingBranch,
  onSetNewBranchName,
  onCreateBranch,
  onCheckoutBranch,
  onSetBranchContextMenu,
  tags,
  onCreateTag,
  onPushTags,
  onDeleteTag,
  remotes,
  remoteSync,
  remoteStatus,
  remoteOnlyBranchesCount,
  onAddRemote,
  onRemoveRemote,
  onRefreshRemote,
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
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
    <RepoList
      openRepos={openRepos}
      activeRepo={activeRepo}
      onSwitchRepo={onSwitchRepo}
      onCloseRepo={onCloseRepo}
      onOpenFolder={onOpenFolder}
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
        onAddRemote={onAddRemote}
        onRemoveRemote={onRemoveRemote}
        onRefreshRemote={onRefreshRemote}
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
            Noch nicht mit GitHub verbunden.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <input
              type="text"
              placeholder="Repository-Name auf GitHub"
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
              placeholder="Beschreibung (optional)"
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
              Privat
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
            {isConnectingGithubRepo ? 'Verbinde...' : 'GitHub-Repo erstellen & verbinden'}
          </button>
          {!isAuthenticated && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Hinweis: Bitte zuerst im GitHub-Tab einen Token hinterlegen.
            </div>
          )}
        </div>
      </>
    )}
  </div>
);

