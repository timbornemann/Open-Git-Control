import React from 'react';
import { Settings, FolderOpen, FolderGit2, Github, ListTodo, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { AppSidebarProps } from './AppSidebar.types';
import { useI18n } from '@/i18n';
import { UpdateNotification } from './UpdateNotification';

type SidebarActivityBarProps = Pick<AppSidebarProps, 'activeTab' | 'setActiveTab'> & {
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
};

export const SidebarActivityBar: React.FC<SidebarActivityBarProps> = ({ activeTab, setActiveTab, isSidebarCollapsed, onToggleSidebar }) => {
  const { t } = useI18n();
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
        title={isSidebarCollapsed ? t('sidebar.open') : t('sidebar.close')}
        aria-label={isSidebarCollapsed ? t('sidebar.open') : t('sidebar.close')}
      >
        {isSidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
      </button>
      <button className={`icon-btn ${activeTab === 'repo' ? 'active' : ''}`} onClick={() => activateTab('repo')} title={t('sidebar.currentRepository')}>
        <FolderGit2 size={22} />
      </button>
      <button className={`icon-btn ${activeTab === 'localRepos' ? 'active' : ''}`} onClick={() => activateTab('localRepos')} title={t('sidebar.localRepos')}>
        <FolderOpen size={22} />
      </button>
      <button className={`icon-btn ${activeTab === 'planner' ? 'active' : ''}`} onClick={() => activateTab('planner')} title={t('sidebar.planner')}>
        <ListTodo size={22} />
      </button>
      <button className={`icon-btn ${activeTab === 'github' ? 'active' : ''}`} onClick={() => activateTab('github')} title="GitHub">
        <Github size={22} />
      </button>
      <div style={{ flex: 1 }} />
      <UpdateNotification />
      <button className={`icon-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => activateTab('settings')} title={t('sidebar.settings')}>
        <Settings size={22} />
      </button>
    </div>
  );
};
