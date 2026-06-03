import React from 'react';
import { AppSidebarProps } from './AppSidebar.types';
import { RepoList } from '../../sidebar/RepoList';

type LocalReposSidebarContentProps = Pick<
  AppSidebarProps,
  | 'openRepos'
  | 'repoMeta'
  | 'repoSortBy'
  | 'activeRepo'
  | 'onOpenFolder'
  | 'onCloneByUrl'
  | 'onSwitchRepo'
  | 'onCloseRepo'
  | 'onSetRepoSortBy'
  | 'onToggleRepoPin'
  | 'isRepoPanelCollapsed'
  | 'onToggleRepoPanelCollapsed'
  | 'setActiveTab'
>;

export const LocalReposSidebarContent: React.FC<LocalReposSidebarContentProps> = ({
  openRepos,
  repoMeta,
  repoSortBy,
  activeRepo,
  onOpenFolder,
  onCloneByUrl,
  onSwitchRepo,
  onCloseRepo,
  onSetRepoSortBy,
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
    onCloneByUrl={onCloneByUrl}
    onTogglePin={onToggleRepoPin}
    sortBy={repoSortBy}
    onSortChange={onSetRepoSortBy}
    collapsed={isRepoPanelCollapsed}
    onToggleCollapsed={onToggleRepoPanelCollapsed}
  />
);

