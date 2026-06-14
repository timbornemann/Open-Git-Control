import React from 'react';
import { Settings, FolderOpen, FolderGit2, Github, ListTodo, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { AppSidebarProps } from './AppSidebar.types';
import { useI18n } from '../../../i18n';

type SidebarActivityBarProps = Pick<AppSidebarProps, 'activeTab' | 'setActiveTab'> & {
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
};

export const SidebarActivityBar: React.FC<SidebarActivityBarProps> = ({
  activeTab,
  setActiveTab,
  isSidebarCollapsed,
  onToggleSidebar,
}) => {
  const { tr } = useI18n();
  const activateTab = (tab: AppSidebarProps['activeTab']) => {
    if (tab === activeTab) {
      onToggleSidebar();
      return;
    }
    setActiveTab(tab);
    if (isSidebarCollapsed) onToggleSidebar();
  };

  return (
    <div className="activity-bar">
      <button
        className="icon-btn activity-bar-panel-toggle"
        onClick={onToggleSidebar}
        title={isSidebarCollapsed ? tr('Sidebar öffnen', 'Open sidebar') : tr('Sidebar schließen', 'Close sidebar')}
        aria-label={isSidebarCollapsed ? tr('Sidebar öffnen', 'Open sidebar') : tr('Sidebar schließen', 'Close sidebar')}
      >
        {isSidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
      </button>
      <button
        className={`icon-btn ${activeTab === 'repo' ? 'active' : ''}`}
        onClick={() => activateTab('repo')}
        title={tr('Aktuelles Repository', 'Current repository')}
      >
        <FolderGit2 size={22} />
      </button>
      <button
        className={`icon-btn ${activeTab === 'localRepos' ? 'active' : ''}`}
        onClick={() => activateTab('localRepos')}
        title={tr('Lokale Repositories', 'Local repositories')}
      >
        <FolderOpen size={22} />
      </button>
      <button
        className={`icon-btn ${activeTab === 'planner' ? 'active' : ''}`}
        onClick={() => activateTab('planner')}
        title={tr('Projektplanung', 'Project planning')}
      >
        <ListTodo size={22} />
      </button>
      <button
        className={`icon-btn ${activeTab === 'github' ? 'active' : ''}`}
        onClick={() => activateTab('github')}
        title="GitHub"
      >
        <Github size={22} />
      </button>
      <div style={{ flex: 1 }} />
      <button
        className={`icon-btn ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => activateTab('settings')}
        title={tr('Einstellungen', 'Settings')}
      >
        <Settings size={22} />
      </button>
    </div>
  );
};
