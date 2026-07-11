import React, { useMemo, useState } from 'react';
import type { GitHubCreateReleaseParamsDto, GitHubReleaseContextDto, GitHubReleaseDto } from '@/types/githubDtos';
import { useI18n } from '@/i18n';
import type { ReleaseNotesOptions } from '@/types/releaseNotes';
import { validateGithubReleaseInput } from '@/utils/githubReleaseValidation';
import type { ReleaseVersionBump } from '@/utils/releaseTagSuggestion';
import { detectReleaseVersionBump, suggestNextReleaseTag } from '@/utils/releaseTagSuggestion';
import { ReleaseCreatorAlerts } from './ReleaseCreatorAlerts';
import { ReleaseCreatorHeader } from './ReleaseCreatorHeader';
import { ReleaseHistoryPanel } from './ReleaseHistoryPanel';
import { ReleaseNotesWorkbench } from './ReleaseNotesWorkbench';
import { ReleaseVersionStep } from './ReleaseVersionStep';
import '@/styles/release-creator.css';

type Props = {
  ownerRepo: { owner: string; repo: string } | null;
  releaseForm: GitHubCreateReleaseParamsDto;
  setReleaseForm: (updater: (prev: GitHubCreateReleaseParamsDto) => GitHubCreateReleaseParamsDto) => void;
  releaseSubmitting: boolean;
  releaseError: string | null;
  releaseSuccess: GitHubReleaseDto | null;
  onCreateRelease: () => Promise<void>;
  pendingAssets: string[];
  onAddPendingAssets: () => Promise<void>;
  onRemovePendingAsset: (filePath: string) => void;
  contextLoading: boolean;
  contextError: string | null;
  context: GitHubReleaseContextDto | null;
  onRefreshContext: () => Promise<void>;
  onGenerateNotes: (versionBump: ReleaseVersionBump) => Promise<void>;
  notesGenerating: boolean;
  notesLanguage: 'de' | 'en';
  setNotesLanguage: (value: 'de' | 'en') => void;
  notesOptions: ReleaseNotesOptions;
  setNotesOptions: (updater: (prev: ReleaseNotesOptions) => ReleaseNotesOptions) => void;
};

export const ReleaseCreator: React.FC<Props> = ({
  ownerRepo,
  releaseForm,
  setReleaseForm,
  releaseSubmitting,
  releaseError,
  releaseSuccess,
  onCreateRelease,
  pendingAssets,
  onAddPendingAssets,
  onRemovePendingAsset,
  contextLoading,
  contextError,
  context,
  onRefreshContext,
  onGenerateNotes,
  notesGenerating,
  notesLanguage,
  setNotesLanguage,
  notesOptions,
  setNotesOptions,
}) => {
  const { t } = useI18n();
  const [versionBump, setVersionBump] = useState<ReleaseVersionBump>('patch');

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
      validateGithubReleaseInput({
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
  const repositoryLabel = ownerRepo ? `${ownerRepo.owner}/${ownerRepo.repo}` : t('generated.components.releasecreator.no_github_repository_mapping_65df7317');
  const contextMatchesTarget = Boolean(context) && (!trimmedTarget || context?.commitsTarget === trimmedTarget);

  const canGenerateNotes =
    Boolean(ownerRepo) && !releaseSubmitting && !notesGenerating && !contextLoading && contextMatchesTarget && Boolean(trimmedTagName) && commitsCount > 0;
  const canCreateRelease =
    Boolean(ownerRepo) && !releaseSubmitting && !notesGenerating && !contextLoading && contextMatchesTarget && !tagAlreadyExists && validation.valid;

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
    if (!ownerRepo) {
      return t('generated.components.releasecreator.please_connect_a_repository_to_github_first_35d47eae');
    }
    if (tagAlreadyExists) {
      return t('generated.components.releasecreator.this_tag_already_exists_please_use_a_new_tag_a371149d');
    }
    if (!validation.valid && validationMessage) {
      return validationMessage;
    }
    return t('generated.components.releasecreator.the_release_will_be_created_on_github_with_the_current_i_3608f5d0');
  }, [ownerRepo, t, tagAlreadyExists, validation.valid, validationMessage]);

  return (
    <div className="release-creator release-creator--clean">
      <div className="release-layout-clean">
        <main className="release-main-clean">
          <ReleaseCreatorHeader
            repositoryLabel={repositoryLabel}
            lastReleaseTag={context?.lastReleaseTag}
            targetForContext={targetForContext}
            commitsCount={commitsCount}
          />

          <ReleaseCreatorAlerts
            hasOwnerRepo={Boolean(ownerRepo)}
            contextError={contextError}
            fallbackUsed={Boolean(context?.fallbackUsed)}
            releaseError={releaseError}
            releaseSuccess={releaseSuccess}
          />

          <section className="release-form-shell">
            <ReleaseVersionStep
              releaseForm={releaseForm}
              setReleaseForm={setReleaseForm}
              hasOwnerRepo={Boolean(ownerRepo)}
              releaseSubmitting={releaseSubmitting || notesGenerating}
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
              hasOwnerRepo={Boolean(ownerRepo)}
              releaseSubmitting={releaseSubmitting}
              notesGenerating={notesGenerating}
              notesLanguage={notesLanguage}
              setNotesLanguage={setNotesLanguage}
              notesOptions={notesOptions}
              setNotesOptions={setNotesOptions}
              canGenerateNotes={canGenerateNotes}
              effectiveVersionBump={effectiveVersionBump}
              onGenerateNotes={onGenerateNotes}
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
          ownerRepo={ownerRepo}
          releaseSubmitting={releaseSubmitting || notesGenerating}
          onRefreshContext={onRefreshContext}
        />
      </div>
    </div>
  );
};
