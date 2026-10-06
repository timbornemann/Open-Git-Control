/** Provider-independent commit information used to generate release notes. */
export interface ReleaseCommitDto {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  htmlUrl?: string | null;
}

/** Editable publication data, independent of the hosting account and provider. */
export interface ReleaseDraft {
  tagName: string;
  releaseName: string;
  targetCommitish: string;
  fromRef?: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
}

export interface ReleaseContext {
  existingTags: string[];
  lastReleaseTag: string | null;
  repositoryHtmlUrl: string;
  commitsSinceLastRelease: ReleaseCommitDto[];
  commitsTarget: string;
  targetOid: string;
  fallbackUsed: boolean;
  warning?: string;
}

export type ReleaseSubmissionPhase = 'idle' | 'checking' | 'awaiting-decision' | 'pushing' | 'creating' | 'uploading';

export type ReleaseNotesGenerationParamsDto = {
  tagName: string;
  releaseName: string;
  lastReleaseTag?: string | null;
  commits: ReleaseCommitDto[];
  repositoryHtmlUrl?: string | null;
  language: 'de' | 'en';
  versionBump: 'major' | 'minor' | 'patch';
  hints?: string[];
};

export type ReleaseNotesGenerationResultDto = { markdown: string; source: 'ai' | 'fallback'; warning?: string };

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
