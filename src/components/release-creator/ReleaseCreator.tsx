import React, { useMemo } from 'react';
import type { ReleaseDraft, ReleaseContext, ReleaseSubmissionPhase, ReleaseNotesOptions } from '@/types/releaseNotes';
import { useI18n } from '@/i18n';
import { validateReleaseInput } from '@/utils/releaseValidation';
import type { HostingCapabilities } from '@/types/hostingDtos';
import type { ReleaseVersionBump } from '@/utils/releaseTagSuggestion';
import { detectReleaseVersionBump, suggestNextReleaseTag } from '@/utils/releaseTagSuggestion';
import { ReleaseCreatorHeader } from './ReleaseCreatorHeader';
import { ReleaseHistoryPanel } from './ReleaseHistoryPanel';
import { ReleaseNotesWorkbench } from './ReleaseNotesWorkbench';
import { ReleaseVersionStep } from './ReleaseVersionStep';
import '@/styles/release-creator.css';

type Props = {
  repositoryLabel: string | null;
  hasLocalRepository?: boolean;
  capabilities: HostingCapabilities | null;
  versionBump: ReleaseVersionBump;
  setVersionBump: (value: ReleaseVersionBump) => void;
  releaseForm: ReleaseDraft;
  setReleaseForm: (updater: (prev: ReleaseDraft) => ReleaseDraft) => void;
  releaseSubmitting: boolean;
  releasePhase?: ReleaseSubmissionPhase;
  onCreateRelease: () => Promise<void>;
  pendingAssets: string[];
  onAddPendingAssets: () => Promise<void>;
  onRemovePendingAsset: (filePath: string) => void;
  contextLoading: boolean;
  context: ReleaseContext | null;
  onRefreshContext: () => Promise<void>;
  onGenerateNotes: (versionBump: ReleaseVersionBump) => Promise<void>;
  onGenerateOfflineNotes: (versionBump: ReleaseVersionBump) => Promise<void>;
  notesGenerating: boolean;
  notesGenerationMode?: 'ai' | 'offline' | null;
  notesLanguage: 'de' | 'en';
  setNotesLanguage: (value: 'de' | 'en') => void;
  notesOptions: ReleaseNotesOptions;
  setNotesOptions: (updater: (prev: ReleaseNotesOptions) => ReleaseNotesOptions) => void;
  published?: boolean;
  uploadedAssets?: string[];
};

const availability = (props: {
  hasRepository: boolean;
  hasCapabilities: boolean;
  published: boolean;
  submitting: boolean;
  generating: boolean;
  loading: boolean;
  matchesTarget: boolean;
  hasTag: boolean;
  commits: number;
  tagExists: boolean;
  valid: boolean;
}) => {
  const ready = props.hasRepository && !props.published && !props.submitting && !props.generating && !props.loading && props.matchesTarget;
  return { canGenerateNotes: ready && props.hasTag && props.commits > 0, canCreateRelease: ready && props.hasCapabilities && !props.tagExists && props.valid };
};

export const ReleaseCreator: React.FC<Props> = ({
  repositoryLabel,
  hasLocalRepository = Boolean(repositoryLabel),
  capabilities,
  versionBump,
  setVersionBump,
  releaseForm,
  setReleaseForm,
  releaseSubmitting,
  releasePhase,
  onCreateRelease,
  pendingAssets,
  onAddPendingAssets,
  onRemovePendingAsset,
  contextLoading,
  context,
  onRefreshContext,
  onGenerateNotes,
  onGenerateOfflineNotes,
  notesGenerating,
  notesGenerationMode,
  notesLanguage,
  setNotesLanguage,
  notesOptions,
  setNotesOptions,
  published = false,
  uploadedAssets,
}) => {
  const { t, tr } = useI18n();

  const normalizedTag = (releaseForm.tagName || '').trim().toLowerCase();
  const trimmedTagName = (releaseForm.tagName || '').trim();
  const trimmedTarget = (releaseForm.targetCommitish || '').trim();

  const existingTagSet = useMemo(() => new Set((context?.existingTags || []).map((tag) => tag.toLowerCase())), [context?.existingTags]);
  const tagAlreadyExists = Boolean(normalizedTag && existingTagSet.has(normalizedTag));
  const suggestedTag = useMemo(() => suggestNextReleaseTag(context?.existingTags || [], versionBump), [context?.existingTags, versionBump]);
  const effectiveVersionBump = useMemo(
    () => detectReleaseVersionBump(context?.lastReleaseTag, trimmedTagName) || versionBump,
    [context?.lastReleaseTag, trimmedTagName, versionBump],
  );

  const validation = useMemo(
    () =>
      validateReleaseInput({
        tagName: releaseForm.tagName || '',
        releaseName: releaseForm.releaseName || '',
      }),
    [releaseForm.releaseName, releaseForm.tagName],
  );

  const validationMessage = useMemo(() => {
    if (validation.errors.tagName === 'release.validation.tagRequired') {
      return t('generated.components.releasecreator.tag_name_must_not_be_empty_370b7b0d');
    }
    if (validation.errors.tagName === 'release.validation.tagInvalid') {
      return t('generated.components.releasecreator.tag_name_contains_invalid_characters_or_whitespace_ca817c36');
    }
    if (validation.errors.releaseName === 'release.validation.nameRequired') {
      return t('generated.components.layout.sidebar.githubconnectedcontent.release_name_must_not_be_empty_453809c9');
    }
    if (validation.errors.releaseName === 'release.validation.nameTooShort') {
      return t('generated.components.releasecreator.release_name_is_too_short_min_3_chars_c39377d1');
    }
    return null;
  }, [t, validation.errors.releaseName, validation.errors.tagName]);

  const commits = context?.commitsSinceLastRelease || [];
  const commitsCount = commits.length;
  const bodyLineCount = (releaseForm.body || '').split(/\r?\n/g).length;
  const bodyCharCount = (releaseForm.body || '').length;
  const targetForContext = trimmedTarget || context?.commitsTarget || t('generated.components.releasecreator.unknown_e814b0a7');
  const contextMatchesTarget = Boolean(context) && (!trimmedTarget || context?.commitsTarget === trimmedTarget);

  const { canGenerateNotes, canCreateRelease } = availability({
    hasRepository: Boolean(repositoryLabel),
    hasCapabilities: Boolean(capabilities),
    published,
    submitting: releaseSubmitting,
    generating: notesGenerating,
    loading: contextLoading,
    matchesTarget: contextMatchesTarget,
    hasTag: Boolean(trimmedTagName),
    commits: commitsCount,
    tagExists: tagAlreadyExists,
    valid: validation.valid,
  });

  const applySuggestedTag = (nextTag: string) => {
    setReleaseForm((prev) => {
      const currentTag = (prev.tagName || '').trim();
      const currentReleaseName = (prev.releaseName || '').trim();
      const shouldUpdateReleaseName = !currentReleaseName || currentReleaseName === `Release ${currentTag}`;

      return {
        ...prev,
        tagName: nextTag,
        releaseName: shouldUpdateReleaseName ? `Release ${nextTag}` : prev.releaseName,
      };
    });
  };

  const selectVersionBump = (nextBump: ReleaseVersionBump) => {
    setVersionBump(nextBump);
    applySuggestedTag(suggestNextReleaseTag(context?.existingTags || [], nextBump));
  };

  const createHint = useMemo(() => {
    if (!repositoryLabel) {
      return tr('Wähle ein Hosting-Ziel für dieses Repository.', 'Choose a hosting target for this repository.');
    }
    if (tagAlreadyExists) {
      return t('generated.components.releasecreator.this_tag_already_exists_please_use_a_new_tag_a371149d');
    }
    if (!validation.valid && validationMessage) {
      return validationMessage;
    }
    return tr('Die Veröffentlichung verwendet ausschließlich das ausgewählte Hosting-Ziel.', 'Publication uses only the selected hosting target.');
  }, [repositoryLabel, tr, t, tagAlreadyExists, validation.valid, validationMessage]);

  return (
    <div className="release-creator release-creator--clean">
      <div className="release-layout-clean">
        <main className="release-main-clean">
          <ReleaseCreatorHeader lastReleaseTag={context?.lastReleaseTag} targetForContext={targetForContext} commitsCount={commitsCount} />

          <section className="release-form-shell">
            <ReleaseVersionStep
              releaseForm={releaseForm}
              setReleaseForm={setReleaseForm}
              hasRepository={hasLocalRepository}
              releaseSubmitting={releaseSubmitting || notesGenerating || published}
              versionBump={versionBump}
              suggestedTag={suggestedTag}
              tagAlreadyExists={tagAlreadyExists}
              validationMessage={validationMessage}
              onApplySuggestedTag={applySuggestedTag}
              onSelectVersionBump={selectVersionBump}
            />

            <ReleaseNotesWorkbench
              releaseForm={releaseForm}
              setReleaseForm={setReleaseForm}
              hasRepository={hasLocalRepository}
              capabilities={capabilities}
              published={published}
              uploadedAssets={uploadedAssets}
              releaseSubmitting={releaseSubmitting}
              releasePhase={releasePhase}
              notesGenerating={notesGenerating}
              notesGenerationMode={notesGenerationMode}
              notesLanguage={notesLanguage}
              setNotesLanguage={setNotesLanguage}
              notesOptions={notesOptions}
              setNotesOptions={setNotesOptions}
              canGenerateNotes={canGenerateNotes}
              effectiveVersionBump={effectiveVersionBump}
              onGenerateNotes={onGenerateNotes}
              canGenerateOfflineNotes={hasLocalRepository && !published && !releaseSubmitting && !notesGenerating && Boolean(trimmedTagName)}
              onGenerateOfflineNotes={onGenerateOfflineNotes}
              canCreateRelease={canCreateRelease}
              createHint={createHint}
              onCreateRelease={onCreateRelease}
              bodyLineCount={bodyLineCount}
              bodyCharCount={bodyCharCount}
              pendingAssets={pendingAssets}
              onAddPendingAssets={onAddPendingAssets}
              onRemovePendingAsset={onRemovePendingAsset}
            />
          </section>
        </main>

        <ReleaseHistoryPanel
          commits={commits}
          commitsCount={commitsCount}
          contextLoading={contextLoading}
          hasRepository={Boolean(repositoryLabel)}
          releaseSubmitting={releaseSubmitting || notesGenerating}
          onRefreshContext={onRefreshContext}
        />
      </div>
    </div>
  );
};
