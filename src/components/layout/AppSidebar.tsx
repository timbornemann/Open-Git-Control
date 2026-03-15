import React from 'react';
import { AppSidebarProps } from './sidebar/AppSidebar.types';
import { SidebarActivityBar } from './sidebar/SidebarActivityBar';
import { SidebarHeader } from './sidebar/SidebarHeader';
import { ReposSidebarContent } from './sidebar/ReposSidebarContent';
import { GithubAuthContent } from './sidebar/GithubAuthContent';
import { GithubConnectedContent } from './sidebar/GithubConnectedContent';
import { useI18n } from '../../i18n';

export const AppSidebar: React.FC<AppSidebarProps> = (props) => {
  const { tr } = useI18n();

  return (
    <>
      <SidebarActivityBar activeTab={props.activeTab} setActiveTab={props.setActiveTab} />

      <div className="sidebar">
        <SidebarHeader
          activeTab={props.activeTab}
          activeRepo={props.activeRepo}
          onOpenFolder={props.onOpenFolder}
          onRefreshRemoteQuick={props.onRefreshRemoteQuick}
          remoteSync={props.remoteSync}
          isGitActionRunning={props.isGitActionRunning}
        />

        <div className="pane-content" style={{ padding: '8px' }}>
          {props.activeTab === 'repos' && <ReposSidebarContent {...props} />}
          {props.activeTab === 'github' && !props.isAuthenticated && <GithubAuthContent {...props} />}
          {props.activeTab === 'github' && props.isAuthenticated && <GithubConnectedContent {...props} />}
          {props.activeTab === 'settings' && (
            <div style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-panel)', color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.4 }}>
              {tr('Die Einstellungen werden jetzt im Hauptfenster angezeigt.', 'Settings are now shown in the main area.')}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
