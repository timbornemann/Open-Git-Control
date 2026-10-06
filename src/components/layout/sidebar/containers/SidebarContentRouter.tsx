import React from 'react';
import { useUIStore } from '@/contexts/AppStateContext';
import { ProjectPlannerSidebarContent } from '@/components/project-planner/ProjectPlannerSidebarContent';
import { HostingSidebar } from '@/components/hosting/HostingSidebar';
import { LocalReposSidebarContainer } from './LocalReposSidebarContainer';
import { RepoSidebarContainer } from './RepoSidebarContainer';
import { SettingsSidebarNav } from './SettingsSidebarNav';

export const SidebarContentRouter: React.FC = React.memo(() => {
  const activeTab = useUIStore((state) => state.activeTab);

  return (
    <div className="pane-content" style={{ padding: activeTab === 'localRepos' || activeTab === 'github' || activeTab === 'hosting' ? 0 : '8px' }}>
      {activeTab === 'localRepos' && <LocalReposSidebarContainer />}
      {activeTab === 'repo' && <RepoSidebarContainer />}
      {activeTab === 'planner' && <ProjectPlannerSidebarContent />}
      {(activeTab === 'github' || activeTab === 'hosting') && <HostingSidebar />}
      {activeTab === 'settings' && <SettingsSidebarNav />}
    </div>
  );
});

SidebarContentRouter.displayName = 'SidebarContentRouter';
