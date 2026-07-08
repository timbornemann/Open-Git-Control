import React from 'react';
import {
  useRepositoryContext,
  useUIContext,
  useWorkflowContext,
} from '../../../../contexts/AppStateContext';
import { SidebarHeader } from '../SidebarHeader';

export const SidebarHeaderContainer: React.FC = React.memo(() => {
  const ui = useUIContext();
  const repository = useRepositoryContext();
  const workflow = useWorkflowContext();

  return (
    <SidebarHeader
      activeTab={ui.activeTab}
      activeRepo={repository.activeRepo}
      onOpenFolder={repository.onOpenFolder}
      onCloneByUrl={repository.onCloneByUrl}
      onRefreshRemoteQuick={repository.onRefreshRemoteQuick}
      remoteSync={repository.remoteSync}
      isGitActionRunning={workflow.isGitActionRunning}
    />
  );
});

SidebarHeaderContainer.displayName = 'SidebarHeaderContainer';
