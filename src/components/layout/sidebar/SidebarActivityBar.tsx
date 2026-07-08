import React from 'react';
import { Download, Settings, FolderOpen, FolderGit2, Github, ListTodo, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { UpdaterStatusDto } from '../../../global';
import { AppSidebarProps } from './AppSidebar.types';
import { useI18n } from '../../../i18n';
import { appClient } from '../../../services/appClient';

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
  const { t } = useI18n();
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
    if (!appClient.isAvailable()) return;
    let active = true;

    void appClient.getUpdaterStatus()
      .then((status) => {
        if (active) setUpdaterStatus(status);
      })
      .catch(() => {
        if (active) setUpdaterStatus(null);
      });

    const unsubscribe = appClient.onUpdaterEvent((status) => {
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
    if (!appClient.isAvailable() || isInstallingUpdate) return;

    setIsInstallingUpdate(true);
    setInstallError(null);
    try {
      const result = await appClient.installAppUpdate();
      if (!result.success) {
        setInstallError(result.error || t('updates.installFailed'));
      }
    } catch (error: unknown) {
      setInstallError(error instanceof Error ? error.message : t('updates.installFailed'));
    } finally {
      setIsInstallingUpdate(false);
    }
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
      <button
        className={`icon-btn ${activeTab === 'repo' ? 'active' : ''}`}
        onClick={() => activateTab('repo')}
        title={t('sidebar.currentRepository')}
      >
        <FolderGit2 size={22} />
      </button>
      <button
        className={`icon-btn ${activeTab === 'localRepos' ? 'active' : ''}`}
        onClick={() => activateTab('localRepos')}
        title={t('sidebar.localRepos')}
      >
        <FolderOpen size={22} />
      </button>
      <button
        className={`icon-btn ${activeTab === 'planner' ? 'active' : ''}`}
        onClick={() => activateTab('planner')}
        title={t('sidebar.planner')}
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
          title={installError || t('sidebar.installDownloadedUpdate')}
          aria-label={installError || t('sidebar.installDownloadedUpdate')}
        >
          <Download size={20} />
        </button>
      )}
      <button
        className={`icon-btn ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => activateTab('settings')}
        title={t('sidebar.settings')}
      >
        <Settings size={22} />
      </button>
    </div>
  );
};
