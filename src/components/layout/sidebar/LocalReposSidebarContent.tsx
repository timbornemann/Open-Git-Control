import React from 'react';
import type { AppSidebarProps } from './AppSidebar.types';
import { RepoList } from '@/components/sidebar/RepoList';

type LocalReposSidebarContentProps = Pick<
  AppSidebarProps,
  | 'openRepos'
  | 'isRestoringRepos'
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
  isRestoringRepos,
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
    isRestoringRepos={isRestoringRepos}
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
