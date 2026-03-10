import React from 'react';
import { Settings, FolderGit2, Github } from 'lucide-react';
import { AppSidebarProps } from './AppSidebar.types';

type SidebarActivityBarProps = Pick<AppSidebarProps, 'activeTab' | 'setActiveTab'>;

export const SidebarActivityBar: React.FC<SidebarActivityBarProps> = ({
  activeTab,
  setActiveTab,
}) => (
  <div className="activity-bar">
    <button
      className={`icon-btn ${activeTab === 'repos' ? 'active' : ''}`}
      onClick={() => setActiveTab('repos')}
      title="Repositories"
    >
      <FolderGit2 size={22} />
    </button>
    <button
      className={`icon-btn ${activeTab === 'github' ? 'active' : ''}`}
      onClick={() => setActiveTab('github')}
      title="GitHub"
    >
      <Github size={22} />
    </button>
    <div style={{ flex: 1 }} />
    <button
      className={`icon-btn ${activeTab === 'settings' ? 'active' : ''}`}
      onClick={() => setActiveTab('settings')}
      title="Settings"
    >
      <Settings size={22} />
    </button>
  </div>
);
