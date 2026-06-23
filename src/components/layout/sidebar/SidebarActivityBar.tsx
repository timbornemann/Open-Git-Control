import React from 'react';
import { Download, Settings, FolderOpen, FolderGit2, Github, ListTodo, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { UpdaterStatusDto } from '../../../global';
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
  const [updaterStatus, setUpdaterStatus] = React.useState<UpdaterStatusDto | null>(null);
  const [isInstallingUpdate, setIsInstallingUpdate] = React.useState(false);
  const [installError, setInstallError] = React.useState<string | null>(null);
  const activateTab = (tab: AppSidebarProps['activeTab']) => {
    if (tab === activeTab) {
      onToggleSidebar();
      return;
    }
    setActiveTab(tab);
    if (isSidebarCollapsed) onToggleSidebar();
  };
  const updateReady = updaterStatus?.state === 'downloaded';

  React.useEffect(() => {
    if (!window.electronAPI) return;
    let active = true;

    void window.electronAPI.getUpdaterStatus()
      .then((status) => {
        if (active) setUpdaterStatus(status);
      })
      .catch(() => {
        if (active) setUpdaterStatus(null);
      });

    const unsubscribe = window.electronAPI.onUpdaterEvent((status) => {
      if (!active) return;
      setUpdaterStatus(status);
      if (status.state !== 'downloaded') setInstallError(null);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const installReadyUpdate = async () => {
    if (!window.electronAPI || isInstallingUpdate) return;

    setIsInstallingUpdate(true);
    setInstallError(null);
    try {
      const result = await window.electronAPI.installAppUpdate();
      if (!result.success) {
        setInstallError(result.error || tr('Update konnte nicht installiert werden.', 'Could not install update.'));
      }
    } catch (error: unknown) {
      setInstallError(error instanceof Error ? error.message : tr('Update konnte nicht installiert werden.', 'Could not install update.'));
    } finally {
      setIsInstallingUpdate(false);
    }
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
      {updateReady && (
        <button
          className="icon-btn activity-update-btn"
          onClick={installReadyUpdate}
          disabled={isInstallingUpdate}
          title={installError || tr('Heruntergeladenes Update installieren', 'Install downloaded update')}
          aria-label={installError || tr('Heruntergeladenes Update installieren', 'Install downloaded update')}
        >
          <Download size={20} />
        </button>
      )}
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
