import { MAX_RELEASE_NOTES_INSTRUCTIONS_LENGTH } from '../releaseNotesInstructions';

export type RepositoryUiPreferences = Partial<{
  branchPanelCollapsed: boolean;
  tagPanelCollapsed: boolean;
  remotePanelCollapsed: boolean;
  submodulePanelCollapsed: boolean;
  releaseNotesInstructions: string;
}>;
const fields = new Set(['branchPanelCollapsed', 'tagPanelCollapsed', 'remotePanelCollapsed', 'submodulePanelCollapsed']);
export function isRepositoryUiPreferences(value: unknown): value is RepositoryUiPreferences {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(value).every(([key, entry]) =>
      key === 'releaseNotesInstructions'
        ? typeof entry === 'string' && entry.length <= MAX_RELEASE_NOTES_INSTRUCTIONS_LENGTH
        : fields.has(key) && typeof entry === 'boolean',
    ),
  );
}
