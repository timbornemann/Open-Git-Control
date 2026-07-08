import React from 'react';
import { Github } from 'lucide-react';
import { RepoList } from '@/components/sidebar/RepoList';
import { BranchPanel } from '@/components/sidebar/BranchPanel';
import { TagPanel } from '@/components/sidebar/TagPanel';
import { RemotePanel } from '@/components/sidebar/RemotePanel';
import { SubmodulePanel } from '@/components/sidebar/SubmodulePanel';
import type { AppSidebarProps } from './AppSidebar.types';
import { useI18n } from '@/i18n';

type ReposSidebarContentProps = Pick<
  AppSidebarProps,
  | 'openRepos'
  | 'repoMeta'
  | 'repoSortBy'
  | 'activeRepo'
  | 'onOpenFolder'
  | 'onCloneByUrl'
  | 'onSwitchRepo'
  | 'onCloseRepo'
  | 'onSetRepoSortBy'
  | 'onToggleRepoPin'
  | 'isRepoPanelCollapsed'
  | 'onToggleRepoPanelCollapsed'
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
>;

export const ReposSidebarContent: React.FC<ReposSidebarContentProps> = ({
  openRepos,
  repoMeta,
  repoSortBy,
  activeRepo,
  onOpenFolder,
  onCloneByUrl,
  onSwitchRepo,
  onCloseRepo,
  onSetRepoSortBy,
  onToggleRepoPin,
  isRepoPanelCollapsed,
  onToggleRepoPanelCollapsed,
  branches,
  isCreatingBranch,
  onSetCreatingBranch,
  onCreateBranch,
  onCheckoutBranch,
  onSetBranchContextMenu,
  isBranchPanelCollapsed,
  onToggleBranchPanelCollapsed,
  tags,
  onCreateTag,
  onPushTags,
  onDeleteTag,
  onSelectTag,
  isTagPanelCollapsed,
  onToggleTagPanelCollapsed,
  remotes,
  remoteSync,
  remoteStatus,
  onAddRemote,
  onRemoveRemote,
  onRenameRemote,
  onSetRemoteUrl,
  onRefreshRemote,
  onSetUpstreamForCurrentBranch,
  isRemotePanelCollapsed,
  onToggleRemotePanelCollapsed,
  submodules,
  onSubmoduleInitUpdate,
  onSubmoduleSync,
  onOpenSubmodule,
  isSubmodulePanelCollapsed,
  onToggleSubmodulePanelCollapsed,
  hasRemoteOrigin,
  forceGithubRepoCreationPrompt,
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
  const { t } = useI18n();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <RepoList
        openRepos={openRepos}
        repoMeta={repoMeta}
        activeRepo={activeRepo}
        onSwitchRepo={onSwitchRepo}
        onCloseRepo={onCloseRepo}
        onOpenFolder={onOpenFolder}
        onCloneByUrl={onCloneByUrl}
        onTogglePin={onToggleRepoPin}
        sortBy={repoSortBy}
        onSortChange={onSetRepoSortBy}
        collapsed={isRepoPanelCollapsed}
        onToggleCollapsed={onToggleRepoPanelCollapsed}
      />

      {activeRepo && (
        <RemotePanel
          remotes={remotes}
          remoteSync={remoteSync}
          remoteStatus={remoteStatus}
          onAddRemote={onAddRemote}
          onRemoveRemote={onRemoveRemote}
          onRenameRemote={onRenameRemote}
          onSetRemoteUrl={onSetRemoteUrl}
          onRefreshRemote={onRefreshRemote}
          onSetUpstreamForCurrentBranch={onSetUpstreamForCurrentBranch}
          collapsed={isRemotePanelCollapsed}
          onToggleCollapsed={onToggleRemotePanelCollapsed}
        />
      )}

      {activeRepo && (
        <BranchPanel
          branches={branches}
          isCreatingBranch={isCreatingBranch}
          onSetCreatingBranch={onSetCreatingBranch}
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
          onSelectTag={onSelectTag}
          collapsed={isTagPanelCollapsed}
          onToggleCollapsed={onToggleTagPanelCollapsed}
        />
      )}

      {activeRepo && (
        <SubmodulePanel
          submodules={submodules}
          onInitUpdate={onSubmoduleInitUpdate}
          onSync={onSubmoduleSync}
          onOpenSubmodule={onOpenSubmodule}
          collapsed={isSubmodulePanelCollapsed}
          onToggleCollapsed={onToggleSubmodulePanelCollapsed}
        />
      )}

      {activeRepo && (hasRemoteOrigin === false || forceGithubRepoCreationPrompt) && (
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
              {hasRemoteOrigin === false
                ? t('generated.components.layout.sidebar.reposidebarcontent.not_connected_to_github_yet_9a7afeaa')
                : t('generated.components.layout.sidebar.reposidebarcontent.remote_is_no_longer_valid_6ffdf83b')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input
                type="text"
                placeholder={t('generated.components.layout.sidebar.reposidebarcontent.repository_name_on_github_9ca29e86')}
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
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
                placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.description_optional_30003d39')}
                value={newRepoDescription}
                onChange={(e) => setNewRepoDescription(e.target.value)}
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
                <input type="checkbox" checked={newRepoPrivate} onChange={(e) => setNewRepoPrivate(e.target.checked)} />
                {t('generated.components.layout.sidebar.reposidebarcontent.private_d6902471')}
              </label>
            </div>
            {connectError && <div style={{ fontSize: '0.8rem', color: 'var(--status-danger)' }}>{connectError}</div>}
            <button
              onClick={onCreateGithubRepoForCurrent}
              disabled={isConnectingGithubRepo}
              style={{
                padding: '6px 10px',
                backgroundColor: !isConnectingGithubRepo ? 'var(--accent-primary)' : 'var(--bg-dark)',
                color: !isConnectingGithubRepo ? 'var(--on-accent)' : 'var(--text-secondary)',
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
              {isConnectingGithubRepo
                ? t('generated.components.layout.sidebar.githubauthcontent.connecting_a77827d1')
                : t('generated.components.layout.sidebar.reposidebarcontent.create_connect_github_repo_68e77480')}
            </button>
            {!isAuthenticated && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {t('generated.components.layout.sidebar.reposidebarcontent.note_please_sign_in_first_in_the_github_tab_a84a54c9')}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
