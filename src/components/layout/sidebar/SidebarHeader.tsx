import React from 'react';
import { DownloadCloud, Plus, RefreshCw } from 'lucide-react';
import type { AppSidebarProps } from './AppSidebar.types';
import { useI18n } from '@/i18n';

type SidebarHeaderProps = Pick<
  AppSidebarProps,
  'activeTab' | 'activeRepo' | 'onOpenFolder' | 'onCloneByUrl' | 'onRefreshRemoteQuick' | 'remoteSync' | 'isGitActionRunning'
>;

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  activeTab,
  activeRepo,
  onOpenFolder,
  onCloneByUrl,
  onRefreshRemoteQuick,
  remoteSync,
  isGitActionRunning,
}) => {
  const { t } = useI18n();

  return (
    <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>
        {activeTab === 'localRepos'
          ? t('sidebar.localRepos')
          : activeTab === 'repo'
            ? t('sidebar.currentRepository')
            : activeTab === 'planner'
              ? t('sidebar.planner')
              : activeTab === 'github'
                ? 'GitHub'
                : t('sidebar.settings')}
      </span>
      <div className="sidebar-header-actions">
        {activeTab === 'localRepos' && (
          <>
            <button className="icon-btn" style={{ padding: '4px' }} onClick={onOpenFolder} title={t('sidebar.addRepository')}>
              <Plus size={16} />
            </button>
            <button className="icon-btn" style={{ padding: '4px' }} onClick={onCloneByUrl} title={t('sidebar.cloneRepository')}>
              <DownloadCloud size={16} />
            </button>
          </>
        )}
        {activeTab === 'repo' && activeRepo && (
          <button
            className="icon-btn"
            style={{ padding: '4px' }}
            onClick={onRefreshRemoteQuick}
            title={t('sidebar.refreshRemote')}
            disabled={remoteSync.isFetching || isGitActionRunning}
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
