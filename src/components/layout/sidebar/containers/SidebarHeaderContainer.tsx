import React from 'react';
import { useGitStore, useUIStore, useWorkflowStore } from '@/contexts/AppStateContext';
import { SidebarHeader } from '@/components/layout/sidebar/SidebarHeader';

export const SidebarHeaderContainer: React.FC = React.memo(() => {
  const activeTab = useUIStore((state) => state.activeTab);
  const activeRepo = useGitStore((state) => state.activeRepo);
  const onOpenFolder = useGitStore((state) => state.onOpenFolder);
  const onCloneByUrl = useGitStore((state) => state.onCloneByUrl);
  const onRefreshRemoteQuick = useGitStore((state) => state.onRefreshRemoteQuick);
  const remoteSync = useGitStore((state) => state.remoteSync);
  const isGitActionRunning = useWorkflowStore((state) => state.isGitActionRunning);

  return (
    <SidebarHeader
      activeTab={activeTab}
      activeRepo={activeRepo}
      onOpenFolder={onOpenFolder}
      onCloneByUrl={onCloneByUrl}
      onRefreshRemoteQuick={onRefreshRemoteQuick}
      remoteSync={remoteSync}
      isGitActionRunning={isGitActionRunning}
    />
  );
});

SidebarHeaderContainer.displayName = 'SidebarHeaderContainer';
