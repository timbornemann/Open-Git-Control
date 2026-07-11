export const SIDEBAR_WIDTH_STORAGE_KEY = 'open-git-control.sidebar-width';
export const SIDEBAR_MANUAL_COLLAPSED_STORAGE_KEY = 'open-git-control.sidebar-manually-collapsed';
export const CONTENT_PANE_RATIO_STORAGE_KEY = 'open-git-control.content-pane-ratio';
export const INSPECTOR_PANE_WIDTH_STORAGE_KEY = 'open-git-control.inspector-pane-width';
export const INSPECTOR_MANUAL_COLLAPSED_STORAGE_KEY = 'open-git-control.inspector-manually-collapsed';

export const APPLICATION_LAYOUT_RESET_EVENT = 'open-git-control:layout-reset';
export const APPLICATION_OPEN_STAGING_COMMIT_EVENT = 'open-git-control:open-staging-commit';

const LAYOUT_STORAGE_KEYS = [
  SIDEBAR_WIDTH_STORAGE_KEY,
  SIDEBAR_MANUAL_COLLAPSED_STORAGE_KEY,
  CONTENT_PANE_RATIO_STORAGE_KEY,
  INSPECTOR_PANE_WIDTH_STORAGE_KEY,
  INSPECTOR_MANUAL_COLLAPSED_STORAGE_KEY,
] as const;

export const resetStoredLayoutPreferences = (): void => {
  for (const key of LAYOUT_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }

  window.dispatchEvent(new window.Event(APPLICATION_LAYOUT_RESET_EVENT));
};

export const openStagingCommitArea = (): void => {
  window.dispatchEvent(new window.Event(APPLICATION_OPEN_STAGING_COMMIT_EVENT));
};
