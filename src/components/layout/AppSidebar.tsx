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
  const settingsTabs = [
    { id: 'general' as const, label: tr('Allgemein', 'General') },
    { id: 'integrations' as const, label: tr('Integrationen', 'Integrations') },
    { id: 'security' as const, label: tr('Sicherheit', 'Security') },
    { id: 'system' as const, label: tr('System', 'System') },
  ];

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
            <div className="settings-sidebar-nav">
              {settingsTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`settings-sidebar-nav-btn ${props.settingsTab === tab.id ? 'active' : ''}`}
                  onClick={() => props.onSelectSettingsTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
