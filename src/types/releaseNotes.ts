export type ReleaseNotesOptions = {
  omitMergeCommits: boolean;
  preferGroupedSections: boolean;
  includeTechnicalDetails: boolean;
  includeBreakingChangesSection: boolean;
  appendAlgorithmicChangeList: boolean;
  includeHashesInAlgorithmicList: boolean;
};

export const DEFAULT_RELEASE_NOTES_OPTIONS: ReleaseNotesOptions = {
  omitMergeCommits: true,
  preferGroupedSections: true,
  includeTechnicalDetails: true,
  includeBreakingChangesSection: true,
  appendAlgorithmicChangeList: true,
  includeHashesInAlgorithmicList: true,
};
