import { create } from 'zustand';
import type { HostedRepositoryRef, HostingRelease } from '@/types/hostingDtos';
import { DEFAULT_RELEASE_NOTES_OPTIONS, type ReleaseDraft, type ReleaseNotesOptions } from '@/types/releaseNotes';
import type { ReleaseVersionBump } from '@/utils/releaseTagSuggestion';
import { normalizeRepoPathKey } from '@/utils/repoPath';

export interface ReleaseSession {
  form: ReleaseDraft;
  versionBump: ReleaseVersionBump;
  language: 'de' | 'en';
  options: ReleaseNotesOptions;
  assets: string[];
  uploaded: string[];
  created: HostingRelease | null;
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
  suggestionApplied: false,
});
export const useReleaseDraftState = create<{
  sessions: Record<string, ReleaseSession>;
  update: (key: string, updater: (current: ReleaseSession | undefined) => ReleaseSession) => void;
}>((set) => ({
  sessions: {},
  update: (key, updater) => set((state) => ({ sessions: { ...state.sessions, [key]: updater(state.sessions[key]) } })),
}));
