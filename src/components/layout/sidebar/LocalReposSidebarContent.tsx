import React from 'react';
import { AppSidebarProps } from './AppSidebar.types';
import { RepoList } from '../../sidebar/RepoList';

type LocalReposSidebarContentProps = Pick<
  AppSidebarProps,
  | 'openRepos'
  | 'repoMeta'
  | 'activeRepo'
  | 'onOpenFolder'
  | 'onSwitchRepo'
  | 'onCloseRepo'
  | 'onToggleRepoPin'
  | 'isRepoPanelCollapsed'
  | 'onToggleRepoPanelCollapsed'
  | 'setActiveTab'
>;

export const LocalReposSidebarContent: React.FC<LocalReposSidebarContentProps> = ({
  openRepos,
  repoMeta,
  activeRepo,
  onOpenFolder,
  onSwitchRepo,
  onCloseRepo,
  onToggleRepoPin,
  isRepoPanelCollapsed,
  onToggleRepoPanelCollapsed,
  setActiveTab,
}) => (
  <RepoList
    openRepos={openRepos}
    repoMeta={repoMeta}
    activeRepo={activeRepo}
    onSwitchRepo={(repoPath) => {
      onSwitchRepo(repoPath);
      setActiveTab('repo');
    }}
    onCloseRepo={onCloseRepo}
    onOpenFolder={onOpenFolder}
    onTogglePin={onToggleRepoPin}
    collapsed={isRepoPanelCollapsed}
    onToggleCollapsed={onToggleRepoPanelCollapsed}
  />
);

