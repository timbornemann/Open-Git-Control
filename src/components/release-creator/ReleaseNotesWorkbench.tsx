import { AlertCircle, Check, Sparkles } from 'lucide-react';
import type { GitHubCreateReleaseParamsDto } from '@/types/githubDtos';
import { useI18n } from '@/i18n';
import type { ReleaseNotesOptions } from '@/types/releaseNotes';
import type { ReleaseVersionBump } from '@/utils/releaseTagSuggestion';
import { AiOptionToggle } from './AiOptionToggle';

type ReleaseNotesWorkbenchProps = {
  releaseForm: GitHubCreateReleaseParamsDto;
  setReleaseForm: (updater: (prev: GitHubCreateReleaseParamsDto) => GitHubCreateReleaseParamsDto) => void;
  hasOwnerRepo: boolean;
  releaseSubmitting: boolean;
  notesGenerating: boolean;
  notesLanguage: 'de' | 'en';
  setNotesLanguage: (value: 'de' | 'en') => void;
  notesOptions: ReleaseNotesOptions;
  setNotesOptions: (updater: (prev: ReleaseNotesOptions) => ReleaseNotesOptions) => void;
  canGenerateNotes: boolean;
  effectiveVersionBump: ReleaseVersionBump;
  onGenerateNotes: (versionBump: ReleaseVersionBump) => Promise<void>;
  canCreateRelease: boolean;
  createHint: string;
  onCreateRelease: () => Promise<void>;
  bodyLineCount: number;
  bodyCharCount: number;
};

export const ReleaseNotesWorkbench = ({
  releaseForm,
  setReleaseForm,
  hasOwnerRepo,
  releaseSubmitting,
  notesGenerating,
  notesLanguage,
  setNotesLanguage,
  notesOptions,
  setNotesOptions,
  canGenerateNotes,
  effectiveVersionBump,
  onGenerateNotes,
  canCreateRelease,
  createHint,
  onCreateRelease,
  bodyLineCount,
  bodyCharCount,
}: ReleaseNotesWorkbenchProps) => {
  const { t } = useI18n();
  const isEditorDisabled = !hasOwnerRepo || releaseSubmitting;

  return (
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
                  disabled={isEditorDisabled}
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
                  disabled={isEditorDisabled}
                />
                <span className="release-option-copy">
                  <strong>{t('generated.components.layout.sidebar.githubconnectedcontent.pre_release_4bb763f1')}</strong>
                  <small>{t('generated.components.releasecreator.marks_this_version_as_an_early_preview_beta_rc_02a7aae9')}</small>
                </span>
              </label>
            </div>

            <button className="release-primary-btn" onClick={() => void onCreateRelease()} disabled={!canCreateRelease}>
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
              disabled={isEditorDisabled}
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
  );
};
