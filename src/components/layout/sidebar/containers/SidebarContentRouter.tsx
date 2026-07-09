import React from 'react';
import { useUIStore } from '@/contexts/AppStateContext';
import { ProjectPlannerSidebarContent } from '@/components/project-planner/ProjectPlannerSidebarContent';
import { GithubSidebarContainer } from './GithubSidebarContainer';
import { LocalReposSidebarContainer } from './LocalReposSidebarContainer';
import { RepoSidebarContainer } from './RepoSidebarContainer';
import { SettingsSidebarNav } from './SettingsSidebarNav';

export const SidebarContentRouter: React.FC = React.memo(() => {
  const activeTab = useUIStore((state) => state.activeTab);

  return (
    <div className="pane-content" style={{ padding: '8px' }}>
      {activeTab === 'localRepos' && <LocalReposSidebarContainer />}
      {activeTab === 'repo' && <RepoSidebarContainer />}
      {activeTab === 'planner' && <ProjectPlannerSidebarContent />}
      {activeTab === 'github' && <GithubSidebarContainer />}
      {activeTab === 'settings' && <SettingsSidebarNav />}
    </div>
  );
});

SidebarContentRouter.displayName = 'SidebarContentRouter';
