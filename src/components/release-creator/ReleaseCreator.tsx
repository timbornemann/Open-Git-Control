import React, { useMemo, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, ExternalLink, Sparkles, Tag, XCircle } from 'lucide-react';
import type { GitHubCreateReleaseParamsDto, GitHubReleaseContextDto, GitHubReleaseDto } from '@/global';
import { useI18n } from '@/i18n';
import type { ReleaseNotesOptions } from '@/types/releaseNotes';
import { validateGithubReleaseInput } from '@/utils/githubReleaseValidation';
import type { ReleaseVersionBump } from '@/utils/releaseTagSuggestion';
import { detectReleaseVersionBump, suggestNextReleaseTag } from '@/utils/releaseTagSuggestion';
import { AiOptionToggle } from './AiOptionToggle';
import { ReleaseHistoryPanel } from './ReleaseHistoryPanel';
import '@/styles/release-creator.css';

type Props = {
  ownerRepo: { owner: string; repo: string } | null;
  releaseForm: GitHubCreateReleaseParamsDto;
  setReleaseForm: (updater: (prev: GitHubCreateReleaseParamsDto) => GitHubCreateReleaseParamsDto) => void;
  releaseSubmitting: boolean;
  releaseError: string | null;
  releaseSuccess: GitHubReleaseDto | null;
  onCreateRelease: () => Promise<void>;
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

  const canGenerateNotes = Boolean(ownerRepo) && !releaseSubmitting && !notesGenerating && Boolean(trimmedTagName) && commitsCount > 0;
  const canCreateRelease = Boolean(ownerRepo) && !releaseSubmitting && !tagAlreadyExists && validation.valid;

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
          <header className="release-head-clean">
            <div>
              <p className="release-eyebrow">{t('generated.components.releasecreator.release_workflow_51d7eb43')}</p>
              <h1 className="release-title-clean">{t('generated.components.layout.sidebar.githubconnectedcontent.create_release_f0fffb84')}</h1>
              <p className="release-subtitle-clean">
                {t('generated.components.releasecreator.define_version_create_release_notes_and_publish_in_one_f_4f23c303')}
              </p>
            </div>
            <div className="release-repo-chip" title={repositoryLabel}>
              {repositoryLabel}
            </div>
          </header>

          <section className="release-info-bar">
            <div className="release-info-item">
              <span>{t('generated.components.releasecreator.last_release_2873fe8a')}</span>
              <strong>{context?.lastReleaseTag || t('generated.components.releasecreator.none_0641cbc2')}</strong>
            </div>
            <div className="release-info-item">
              <span>{t('generated.components.releasecreator.target_3d406596')}</span>
              <strong>{targetForContext}</strong>
            </div>
            <div className="release-info-item">
              <span>{t('generated.components.releasecreator.commits_since_5f00f45c')}</span>
              <strong>{commitsCount}</strong>
            </div>
          </section>

          {!ownerRepo && (
            <div className="release-alert release-alert--warning">
              <AlertCircle size={16} />
              <div>
                <strong>{t('generated.components.releasecreator.github_mapping_missing_9975f757')}</strong>
                <p>{t('generated.components.releasecreator.open_a_local_repository_connected_to_github_to_create_re_f178cf2f')}</p>
              </div>
            </div>
          )}
          {contextError && (
            <div className="release-alert release-alert--danger">
              <XCircle size={16} />
              <div>{contextError}</div>
            </div>
          )}
          {context?.fallbackUsed && (
            <div className="release-alert release-alert--warning">
              <AlertCircle size={16} />
              <div>{t('generated.components.releasecreator.latest_release_tag_was_not_found_locally_showing_recent_b17316f0')}</div>
            </div>
          )}
          {releaseError && (
            <div className="release-alert release-alert--danger">
              <XCircle size={16} />
              <div>{releaseError}</div>
            </div>
          )}
          {releaseSuccess && (
            <div className="release-alert release-alert--success">
              <CheckCircle2 size={16} />
              <div>
                {t('generated.components.layout.sidebar.githubconnectedcontent.release_created_successfully_3bde93c8')}{' '}
                <a href={releaseSuccess.htmlUrl} target="_blank" rel="noreferrer" className="release-alert-link">
                  {t('generated.components.releasecreator.open_release_d3a48bd7')} <ExternalLink size={12} />
                </a>
              </div>
            </div>
          )}

          <section className="release-form-shell">
            <section className="release-step-clean">
              <header className="release-step-title-row">
                <h2>{t('generated.components.releasecreator.1_version_and_target_99fd2b69')}</h2>
              </header>

              <div className="release-version-bump">
                <div className="release-version-bump-copy">
                  <span className="release-field-label">{t('generated.components.releasecreator.version_bump_3bda5018')}</span>
                  <small>{t('generated.components.releasecreator.controls_which_component_is_increased_and_how_ai_notes_c_d39c7dfa')}</small>
                </div>
                <div className="release-version-bump-options" role="group" aria-label={t('generated.components.releasecreator.select_version_bump_16edfafd')}>
                  {(['major', 'minor', 'patch'] as ReleaseVersionBump[]).map((bump) => (
                    <button
                      key={bump}
                      type="button"
                      className={`release-version-bump-btn ${versionBump === bump ? 'release-version-bump-btn--active' : ''}`}
                      aria-pressed={versionBump === bump}
                      onClick={() => selectVersionBump(bump)}
                      disabled={!ownerRepo || releaseSubmitting}
                    >
                      {bump === 'major' ? 'Major' : bump === 'minor' ? 'Minor' : 'Patch'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="release-field-grid">
                <label className="release-field">
                  <span className="release-field-label">{t('generated.components.layout.sidebar.githubconnectedcontent.tag_name_required_f52acebf')}</span>
                  <input
                    type="text"
                    className="release-input"
                    value={releaseForm.tagName || ''}
                    onChange={(event) => setReleaseForm((prev) => ({ ...prev, tagName: event.target.value }))}
                    disabled={!ownerRepo || releaseSubmitting}
                    placeholder={t('generated.components.releasecreator.e_g_v1_2_0_65ddb49a')}
                  />
                </label>
                <button
                  className="release-tag-btn"
                  onClick={() => applySuggestedTag(suggestedTag)}
                  disabled={!ownerRepo || releaseSubmitting}
                  title={t('generated.components.releasecreator.apply_suggested_tag_4bd41c42')}
                >
                  <Tag size={14} />
                  {suggestedTag}
                </button>
                <label className="release-field release-field--full">
                  <span className="release-field-label">{t('generated.components.layout.sidebar.githubconnectedcontent.release_name_required_cbead0c8')}</span>
                  <input
                    type="text"
                    className="release-input"
                    value={releaseForm.releaseName || ''}
                    onChange={(event) => setReleaseForm((prev) => ({ ...prev, releaseName: event.target.value }))}
                    disabled={!ownerRepo || releaseSubmitting}
                    placeholder={t('generated.components.releasecreator.e_g_release_v1_2_0_cb9d37f6')}
                  />
                </label>
                <label className="release-field release-field--full">
                  <span className="release-field-label">
                    {t('generated.components.layout.sidebar.githubconnectedcontent.target_branch_or_commit_optional_3500df18')}
                  </span>
                  <input
                    type="text"
                    className="release-input"
                    value={releaseForm.targetCommitish || ''}
                    onChange={(event) => setReleaseForm((prev) => ({ ...prev, targetCommitish: event.target.value }))}
                    disabled={!ownerRepo || releaseSubmitting}
                    placeholder={t('generated.components.releasecreator.e_g_main_or_sha_5fadcf84')}
                  />
                </label>
              </div>

              {tagAlreadyExists ? (
                <p className="release-inline release-inline--warning">
                  <XCircle size={13} />
                  {t('generated.components.releasecreator.this_tag_already_exists_236e950d')}
                </p>
              ) : validationMessage ? (
                <p className="release-inline release-inline--warning">
                  <AlertCircle size={13} />
                  {validationMessage}
                </p>
              ) : (
                <p className="release-inline release-inline--muted">
                  <Check size={13} />
                  {t('generated.components.releasecreator.version_and_name_are_ready_3570b3a6')}
                </p>
              )}
            </section>

            <section className="release-step-clean release-step-clean--notes-workbench">
              <header className="release-step-title-row">
                <h2>{t('generated.components.releasecreator.2_release_notes_and_publish_033f84f8')}</h2>
              </header>

              <div className="release-notes-workbench">
                <aside className="release-notes-side">
                  <div className="release-ai-panel">
                    <div className="release-ai-headline">
                      <div className="release-ai-headline-copy">
                        <strong>{t('generated.components.releasecreator.tune_ai_notes_cd829863')}</strong>
                        <span>{t('generated.components.releasecreator.adjust_behavior_and_generate_8d5ba99c')}</span>
                      </div>
                      <div className="release-language-wrap">
                        <label htmlFor="release-language">{t('generated.components.releasecreator.ai_language_7ebc7cfd')}</label>
                        <select
                          id="release-language"
                          className="release-select"
                          value={notesLanguage}
                          onChange={(event) => setNotesLanguage(event.target.value === 'de' ? 'de' : 'en')}
                          disabled={notesGenerating || releaseSubmitting}
                        >
                          <option value="en">{t('generated.components.releasecreator.english_61acbce0')}</option>
                          <option value="de">{t('generated.components.releasecreator.german_239646b7')}</option>
                        </select>
                      </div>
                    </div>

                    <div className="release-ai-options-list">
                      <AiOptionToggle
                        label={t('generated.components.releasecreator.exclude_merge_commits_e56e6d3a')}
                        description={t('generated.components.releasecreator.reduce_noise_in_ai_notes_cd0e4926')}
                        checked={notesOptions.omitMergeCommits}
                        onChange={(next) => setNotesOptions((prev) => ({ ...prev, omitMergeCommits: next }))}
                        disabled={notesGenerating || releaseSubmitting}
                      />
                      <AiOptionToggle
                        label={t('generated.components.releasecreator.group_into_sections_620bb32f')}
                        description={t('generated.components.releasecreator.e_g_added_changed_fixed_3d11f99e')}
                        checked={notesOptions.preferGroupedSections}
                        onChange={(next) => setNotesOptions((prev) => ({ ...prev, preferGroupedSections: next }))}
                        disabled={notesGenerating || releaseSubmitting}
                      />
                      <AiOptionToggle
                        label={t('generated.components.releasecreator.more_technical_details_b1a60fbc')}
                        description={t('generated.components.releasecreator.focus_on_technical_changes_ee92f5fb')}
                        checked={notesOptions.includeTechnicalDetails}
                        onChange={(next) => setNotesOptions((prev) => ({ ...prev, includeTechnicalDetails: next }))}
                        disabled={notesGenerating || releaseSubmitting}
                      />
                      <AiOptionToggle
                        label={t('generated.components.releasecreator.breaking_changes_section_ccb42c05')}
                        description={t('generated.components.releasecreator.always_handled_as_a_separate_section_5bb3fe16')}
                        checked={notesOptions.includeBreakingChangesSection}
                        onChange={(next) => setNotesOptions((prev) => ({ ...prev, includeBreakingChangesSection: next }))}
                        disabled={notesGenerating || releaseSubmitting}
                      />
                      <AiOptionToggle
                        label={t('generated.components.releasecreator.append_automatic_commit_list_53700f8a')}
                        description={t('generated.components.releasecreator.generated_locally_without_ai_0d3c1350')}
                        checked={notesOptions.appendAlgorithmicChangeList}
                        onChange={(next) => setNotesOptions((prev) => ({ ...prev, appendAlgorithmicChangeList: next }))}
                        disabled={notesGenerating || releaseSubmitting}
                      />
                      <AiOptionToggle
                        label={t('generated.components.releasecreator.show_commit_hashes_0ea4fe30')}
                        description={t('generated.components.releasecreator.only_for_the_automatic_commit_list_1677c88d')}
                        checked={notesOptions.includeHashesInAlgorithmicList}
                        onChange={(next) => setNotesOptions((prev) => ({ ...prev, includeHashesInAlgorithmicList: next }))}
                        disabled={notesGenerating || releaseSubmitting || !notesOptions.appendAlgorithmicChangeList}
                      />
                    </div>

                    <div className="release-ai-main-actions">
                      <button className="release-ai-generate-btn" onClick={() => void onGenerateNotes(effectiveVersionBump)} disabled={!canGenerateNotes}>
                        <Sparkles size={16} />
                        {notesGenerating
                          ? t('generated.components.releasecreator.ai_is_generating_release_notes_106c5b32')
                          : t('generated.components.releasecreator.generate_release_notes_with_ai_2905a726')}
                      </button>
                    </div>
                  </div>

                  <div className="release-publish-panel">
                    <header className="release-publish-head">
                      <h3>{t('generated.components.releasecreator.3_publish_6d56d575')}</h3>
                    </header>

                    <div className="release-options-grid release-options-grid--compact">
                      <label className="release-option-card">
                        <input
                          type="checkbox"
                          checked={Boolean(releaseForm.draft)}
                          onChange={(event) => setReleaseForm((prev) => ({ ...prev, draft: event.target.checked }))}
                          disabled={!ownerRepo || releaseSubmitting}
                        />
                        <span className="release-option-copy">
                          <strong>{t('generated.components.layout.sidebar.repogithubactionscontent.draft_4fc4eecc')}</strong>
                          <small>{t('generated.components.releasecreator.save_the_release_without_publishing_it_immediately_492ee21f')}</small>
                        </span>
                      </label>
                      <label className="release-option-card">
                        <input
                          type="checkbox"
                          checked={Boolean(releaseForm.prerelease)}
                          onChange={(event) => setReleaseForm((prev) => ({ ...prev, prerelease: event.target.checked }))}
                          disabled={!ownerRepo || releaseSubmitting}
                        />
                        <span className="release-option-copy">
                          <strong>{t('generated.components.layout.sidebar.githubconnectedcontent.pre_release_4bb763f1')}</strong>
                          <small>{t('generated.components.releasecreator.marks_this_version_as_an_early_preview_beta_rc_02a7aae9')}</small>
                        </span>
                      </label>
                    </div>

                    <button
                      className="release-primary-btn"
                      onClick={() => {
                        void onCreateRelease();
                      }}
                      disabled={!canCreateRelease}
                    >
                      <Check size={14} />
                      {releaseSubmitting
                        ? t('generated.components.releasecreator.creating_release_8650d060')
                        : t('generated.components.layout.sidebar.githubconnectedcontent.create_release_f0fffb84')}
                    </button>

                    <p className={`release-inline ${canCreateRelease ? 'release-inline--muted' : 'release-inline--warning'}`}>
                      {canCreateRelease ? <Check size={13} /> : <AlertCircle size={13} />}
                      {createHint}
                    </p>
                  </div>
                </aside>

                <div className="release-notes-editor-pane">
                  <label className="release-field release-field--full release-field--editor">
                    <span className="release-field-label">{t('generated.components.releasecreator.release_notes_markdown_3ec01efd')}</span>
                    <textarea
                      className="release-textarea release-textarea--editor"
                      value={releaseForm.body || ''}
                      onChange={(event) => setReleaseForm((prev) => ({ ...prev, body: event.target.value }))}
                      rows={20}
                      disabled={!ownerRepo || releaseSubmitting}
                      placeholder={t('generated.components.releasecreator.added_changed_fixed_4361f5e9')}
                    />
                  </label>

                  <div className="release-notes-meta">
                    <span>
                      {t('generated.components.releasecreator.lines_ec6b4722')}: {bodyLineCount}
                    </span>
                    <span>
                      {t('generated.components.releasecreator.characters_f141ff5c')}: {bodyCharCount}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </section>
        </main>

        <ReleaseHistoryPanel
          commits={commits}
          commitsCount={commitsCount}
          contextLoading={contextLoading}
          ownerRepo={ownerRepo}
          releaseSubmitting={releaseSubmitting}
          onRefreshContext={onRefreshContext}
        />
      </div>
    </div>
  );
};
