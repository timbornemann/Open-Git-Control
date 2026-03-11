import React from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { AppSidebarProps } from './AppSidebar.types';
import { useI18n } from '../../../i18n';

type SidebarHeaderProps = Pick<
  AppSidebarProps,
  'activeTab' | 'activeRepo' | 'onOpenFolder' | 'onRefreshRemoteQuick' | 'remoteSync' | 'isGitActionRunning'
>;

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  activeTab,
  activeRepo,
  onOpenFolder,
  onRefreshRemoteQuick,
  remoteSync,
  isGitActionRunning,
}) => {
  const { tr } = useI18n();

  return (
    <div
      className="sidebar-header"
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
    >
      <span>{activeTab === 'repos' ? tr('Repositories', 'Repositories') : activeTab === 'github' ? 'GitHub' : tr('Einstellungen', 'Settings')}</span>
      {activeTab === 'repos' && (
        <div style={{ display: 'flex', gap: '2px' }}>
          <button
            className="icon-btn"
            style={{ padding: '4px' }}
            onClick={onOpenFolder}
            title={tr('Repository hinzufügen', 'Add repository')}
          >
            <Plus size={16} />
          </button>
          {activeRepo && (
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
        </div>
      )}
    </div>
  );
};
