import React from 'react';
import { useRepositoryContext, useUIContext } from '@/contexts/AppStateContext';
import { BranchPanel } from '@/components/sidebar/BranchPanel';
import { TagPanel } from '@/components/sidebar/TagPanel';
import { SubmodulePanel } from '@/components/sidebar/SubmodulePanel';
import { RepositoryLicensePanel } from '@/components/sidebar/RepositoryLicensePanel';
import { HostingSidebar } from '@/components/hosting/HostingSidebar';
import { gitClient } from '@/services/gitClient';
import { useI18n } from '@/i18n';
import { requestRemoteTransfer } from '@/components/hosting/remoteTransferDialogState';

export const RepoSidebarContainer: React.FC = React.memo(() => {
  const ui = useUIContext();
  const repository = useRepositoryContext();
  const { tr } = useI18n();
  if (!repository.activeRepo) return <button onClick={() => ui.setActiveTab('localRepos')}>{tr('Lokales Repository öffnen', 'Open local repository')}</button>;
  return (
    <div className="repo-cockpit">
      <div className="repo-cockpit-header">
        <strong>{repository.activeRepo.split(/[\\/]/).pop()}</strong>
        <small className="repo-cockpit-path">{repository.activeRepo}</small>
        <button className="staging-tool-btn" onClick={() => void gitClient.openRepositoryPath({ action: 'open', repoPath: repository.activeRepo! })}>
          {tr('Projektordner öffnen', 'Open project folder')}
        </button>
      </div>
      <HostingSidebar local />
      <RepositoryLicensePanel repoPath={repository.activeRepo} />
      <BranchPanel
        branches={repository.branches}
        isCreatingBranch={repository.isCreatingBranch}
        onSetCreatingBranch={repository.onSetCreatingBranch}
        onCreateBranch={repository.onCreateBranch}
        onCheckoutBranch={repository.onCheckoutBranch}
        onSetBranchContextMenu={repository.onSetBranchContextMenu}
        collapsed={ui.isBranchPanelCollapsed}
        onToggleCollapsed={ui.onToggleBranchPanelCollapsed}
      />
      <TagPanel
        tags={repository.tags}
        tagConflicts={repository.tagConflicts}
        onCreateTag={repository.onCreateTag}
        onPushTags={() => requestRemoteTransfer({ repoPath: repository.activeRepo!, mode: 'push', tagNames: repository.tags, selectTags: true })}
        onDeleteTag={repository.onDeleteTag}
        onSelectTag={repository.onSelectTag}
        collapsed={ui.isTagPanelCollapsed}
        onToggleCollapsed={ui.onToggleTagPanelCollapsed}
      />
      <SubmodulePanel
        submodules={repository.submodules}
        onInitUpdate={repository.onSubmoduleInitUpdate}
        onSync={repository.onSubmoduleSync}
        onOpenSubmodule={repository.onOpenSubmodule}
        collapsed={ui.isSubmodulePanelCollapsed}
        onToggleCollapsed={ui.onToggleSubmodulePanelCollapsed}
      />
    </div>
  );
});
RepoSidebarContainer.displayName = 'RepoSidebarContainer';
