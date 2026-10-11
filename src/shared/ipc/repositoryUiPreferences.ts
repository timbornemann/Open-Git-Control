export type RepositoryUiPreferences = Partial<{
  branchPanelCollapsed: boolean;
  tagPanelCollapsed: boolean;
  remotePanelCollapsed: boolean;
  submodulePanelCollapsed: boolean;
}>;
const fields = new Set(['branchPanelCollapsed', 'tagPanelCollapsed', 'remotePanelCollapsed', 'submodulePanelCollapsed']);
export function isRepositoryUiPreferences(value: unknown): value is RepositoryUiPreferences {
  return Boolean(
    value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([key, entry]) => fields.has(key) && typeof entry === 'boolean'),
  );
}
