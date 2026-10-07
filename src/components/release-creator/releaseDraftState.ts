import { create } from 'zustand';
import type { HostedRepositoryRef, HostingRelease } from '@/types/hostingDtos';
import { DEFAULT_RELEASE_NOTES_OPTIONS, type ReleaseContext, type ReleaseDraft, type ReleaseNotesOptions } from '@/types/releaseNotes';
import type { ReleaseVersionBump } from '@/utils/releaseTagSuggestion';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { suggestNextReleaseTag } from '@/utils/releaseTagSuggestion';

export interface ReleaseSession {
  form: ReleaseDraft;
  versionBump: ReleaseVersionBump;
  language: 'de' | 'en';
  options: ReleaseNotesOptions;
  assets: string[];
  uploaded: string[];
  created: HostingRelease | null;
  lastCreated?: HostingRelease | null;
  suggestionApplied: boolean;
}
export const releaseDraftKey = (repoPath: string, repository: HostedRepositoryRef | null, remoteName: string) =>
  JSON.stringify([normalizeRepoPathKey(repoPath), repository?.connectionId, repository?.repositoryId, repository?.fullPath, remoteName]);
export const newReleaseSession = (branch: string, language: 'de' | 'en'): ReleaseSession => ({
  form: { tagName: '', releaseName: '', targetCommitish: branch, body: '', draft: false, prerelease: false },
  versionBump: 'patch',
  language,
  options: { ...DEFAULT_RELEASE_NOTES_OPTIONS },
  assets: [],
  uploaded: [],
  created: null,
  lastCreated: null,
  suggestionApplied: false,
});
/** Keep useful note preferences; publication data belongs to the completed release. */
export const completedReleaseSession = (
  previous: ReleaseSession,
  branch: string,
  release: HostingRelease,
  context?: ReleaseContext | null | void,
): ReleaseSession => {
  const next = newReleaseSession(branch, previous.language);
  const tagName = suggestNextReleaseTag([...(context?.existingTags || []), release.tagName], next.versionBump);
  return {
    ...next,
    options: { ...previous.options },
    lastCreated: release,
    suggestionApplied: true,
    form: { ...next.form, tagName, releaseName: `Release ${tagName}` },
  };
};
export const useReleaseDraftState = create<{
  sessions: Record<string, ReleaseSession>;
  update: (key: string, updater: (current: ReleaseSession | undefined) => ReleaseSession) => void;
}>((set) => ({
  sessions: {},
  update: (key, updater) => set((state) => ({ sessions: { ...state.sessions, [key]: updater(state.sessions[key]) } })),
}));
