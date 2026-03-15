import React from 'react';
import { Settings, FolderOpen, FolderGit2, Github } from 'lucide-react';
import { AppSidebarProps } from './AppSidebar.types';
import { useI18n } from '../../../i18n';

type SidebarActivityBarProps = Pick<AppSidebarProps, 'activeTab' | 'setActiveTab'>;

export const SidebarActivityBar: React.FC<SidebarActivityBarProps> = ({
  activeTab,
  setActiveTab,
}) => {
  const { tr } = useI18n();

  return (
    <div className="activity-bar">
      <button
        className={`icon-btn ${activeTab === 'repo' ? 'active' : ''}`}
        onClick={() => setActiveTab('repo')}
        title={tr('Aktuelles Repository', 'Current repository')}
      >
        <FolderGit2 size={22} />
      </button>
      <button
        className={`icon-btn ${activeTab === 'localRepos' ? 'active' : ''}`}
        onClick={() => setActiveTab('localRepos')}
        title={tr('Lokale Repositories', 'Local repositories')}
      >
        <FolderOpen size={22} />
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
        title={tr('Einstellungen', 'Settings')}
      >
        <Settings size={22} />
      </button>
    </div>
  );
};
