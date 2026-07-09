import type { GithubStateContract, RepositoryStateContract, SettingsStateContract, SidebarCoreState, WorkflowStateContract } from '@/app/state/contracts';

export type { AppTabId, BranchContextMenuState, GithubAuthHelpMethod, RemoteStatus, RepoMetaMap, SettingsTabId } from '@/app/state/contracts';

export type AppSidebarProps = SidebarCoreState & RepositoryStateContract & GithubStateContract & WorkflowStateContract & SettingsStateContract;
