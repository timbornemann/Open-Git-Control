export { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
export type { RunGitCommandOptions } from '@/app/state/contracts';

export const GUARDED_COMMANDS = new Set(['checkout', 'merge', 'reset']);

export const isForcePushCommand = (args: string[]): boolean => {
  const command = String(args[0] || '')
    .trim()
    .toLowerCase();
  if (command !== 'push') return false;
  return args.some((arg) => {
    const normalized = String(arg || '')
      .trim()
      .toLowerCase();
    return normalized === '-f' || normalized === '--force' || normalized === '--force-with-lease' || normalized.startsWith('--force-with-lease=');
  });
};

export const SIDEBAR_COLLAPSE_STORAGE_KEY = 'open-git-control:sidebar-collapse-by-repo:v1';
export const LEGACY_SIDEBAR_COLLAPSE_STORAGE_KEY = 'git-organizer:sidebar-collapse-by-repo:v1';
export const SIDEBAR_GENERAL_COLLAPSE_STORAGE_KEY = 'open-git-control:sidebar-general-collapse:v1';
export const LEGACY_SIDEBAR_GENERAL_COLLAPSE_STORAGE_KEY = 'git-organizer:sidebar-general-collapse:v1';

export type SidebarCollapseState = {
  branchPanelCollapsed: boolean;
  tagPanelCollapsed: boolean;
  remotePanelCollapsed: boolean;
  submodulePanelCollapsed: boolean;
};

export type SidebarCollapseByRepo = Record<string, SidebarCollapseState>;

export type SidebarGeneralCollapseState = {
  repoPanelCollapsed: boolean;
};

export const DEFAULT_SIDEBAR_COLLAPSE_STATE: SidebarCollapseState = {
  branchPanelCollapsed: false,
  tagPanelCollapsed: false,
  remotePanelCollapsed: false,
  submodulePanelCollapsed: false,
};

export const DEFAULT_SIDEBAR_GENERAL_COLLAPSE_STATE: SidebarGeneralCollapseState = {
  repoPanelCollapsed: false,
};
