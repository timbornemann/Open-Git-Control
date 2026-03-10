import React from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { AppSidebarProps } from './AppSidebar.types';

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
}) => (
  <div
    className="sidebar-header"
    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
  >
    <span>{activeTab === 'repos' ? 'Repositories' : 'GitHub'}</span>
    {activeTab === 'repos' && (
      <div style={{ display: 'flex', gap: '2px' }}>
        <button
          className="icon-btn"
          style={{ padding: '4px' }}
          onClick={onOpenFolder}
          title="Repository hinzufügen"
        >
          <Plus size={16} />
        </button>
        {activeRepo && (
          <button
            className="icon-btn"
            style={{ padding: '4px' }}
            onClick={onRefreshRemoteQuick}
            title="Remote aktualisieren"
            disabled={remoteSync.isFetching || isGitActionRunning}
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>
    )}
  </div>
);

