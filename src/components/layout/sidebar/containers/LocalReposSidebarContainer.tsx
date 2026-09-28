import React from 'react';
import { useRepositoryContext, useUIContext } from '@/contexts/AppStateContext';
import { LocalReposSidebarContent } from '@/components/layout/sidebar/LocalReposSidebarContent';

export const LocalReposSidebarContainer: React.FC = React.memo(() => {
  const ui = useUIContext();
  const repository = useRepositoryContext();

  return (
    <LocalReposSidebarContent
      count={repository.openRepos.length}
      isRestoringRepos={repository.isRestoringRepos}
      activeRepo={repository.activeRepo}
      onOpenFolder={repository.onOpenFolder}
      onCloneByUrl={repository.onCloneByUrl}
      onOpenRepoTab={() => ui.setActiveTab('repo')}
    />
  );
});

LocalReposSidebarContainer.displayName = 'LocalReposSidebarContainer';
