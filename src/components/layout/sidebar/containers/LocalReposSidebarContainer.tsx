import React from 'react';
import { useRepositoryContext, useUIContext } from '@/contexts/AppStateContext';
import { LocalReposSidebarContent } from '@/components/layout/sidebar/LocalReposSidebarContent';

export const LocalReposSidebarContainer: React.FC = React.memo(() => {
  const ui = useUIContext();
  const repository = useRepositoryContext();

  return (
    <LocalReposSidebarContent
      openRepos={repository.openRepos}
      repoMeta={repository.repoMeta}
      repoSortBy={repository.repoSortBy}
      activeRepo={repository.activeRepo}
      onOpenFolder={repository.onOpenFolder}
      onCloneByUrl={repository.onCloneByUrl}
      onSwitchRepo={repository.onSwitchRepo}
      onCloseRepo={repository.onCloseRepo}
      onSetRepoSortBy={repository.onSetRepoSortBy}
      onToggleRepoPin={repository.onToggleRepoPin}
      isRepoPanelCollapsed={ui.isRepoPanelCollapsed}
      onToggleRepoPanelCollapsed={ui.onToggleRepoPanelCollapsed}
      setActiveTab={ui.setActiveTab}
    />
  );
});

LocalReposSidebarContainer.displayName = 'LocalReposSidebarContainer';
