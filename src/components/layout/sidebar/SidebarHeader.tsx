import React from 'react';
import { DownloadCloud, PanelLeftClose, Plus, RefreshCw } from 'lucide-react';
import { AppSidebarProps } from './AppSidebar.types';
import { useI18n } from '../../../i18n';

type SidebarHeaderProps = Pick<
  AppSidebarProps,
  'activeTab' | 'activeRepo' | 'onOpenFolder' | 'onCloneByUrl' | 'onRefreshRemoteQuick' | 'remoteSync' | 'isGitActionRunning'
> & {
  onCollapse: () => void;
};

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  activeTab,
  activeRepo,
  onOpenFolder,
  onCloneByUrl,
  onRefreshRemoteQuick,
  remoteSync,
  isGitActionRunning,
  onCollapse,
}) => {
  const { tr } = useI18n();

  return (
    <div
      className="sidebar-header"
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
    >
      <span>
        {activeTab === 'localRepos'
          ? tr('Lokale Repositories', 'Local repositories')
          : activeTab === 'repo'
            ? tr('Aktuelles Repository', 'Current repository')
            : activeTab === 'planner'
              ? tr('Projektplanung', 'Project planning')
            : activeTab === 'github'
              ? 'GitHub'
              : tr('Einstellungen', 'Settings')}
      </span>
      <div className="sidebar-header-actions">
        {activeTab === 'localRepos' && (
          <>
            <button
              className="icon-btn"
              style={{ padding: '4px' }}
              onClick={onOpenFolder}
              title={tr('Repository hinzufügen', 'Add repository')}
            >
              <Plus size={16} />
            </button>
            <button
              className="icon-btn"
              style={{ padding: '4px' }}
              onClick={onCloneByUrl}
              title={tr('Repository per URL klonen', 'Clone repository from URL')}
            >
              <DownloadCloud size={16} />
            </button>
          </>
        )}
        {activeTab === 'repo' && activeRepo && (
          <button
            className="icon-btn"
            style={{ padding: '4px' }}
            onClick={onRefreshRemoteQuick}
            title={tr('Remote aktualisieren', 'Refresh remote')}
            disabled={remoteSync.isFetching || isGitActionRunning}
          >
            <RefreshCw size={14} />
          </button>
        )}
        <button
          className="icon-btn"
          style={{ padding: '4px' }}
          onClick={onCollapse}
          title={tr('Sidebar schließen', 'Close sidebar')}
          aria-label={tr('Sidebar schließen', 'Close sidebar')}
        >
          <PanelLeftClose size={16} />
        </button>
      </div>
    </div>
  );
};
