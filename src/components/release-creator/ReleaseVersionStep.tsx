import { AlertCircle, Check, Tag, XCircle } from 'lucide-react';
import type { GitHubCreateReleaseParamsDto } from '@/types/githubDtos';
import { useI18n } from '@/i18n';
import type { ReleaseVersionBump } from '@/utils/releaseTagSuggestion';

type ReleaseVersionStepProps = {
  releaseForm: GitHubCreateReleaseParamsDto;
  setReleaseForm: (updater: (prev: GitHubCreateReleaseParamsDto) => GitHubCreateReleaseParamsDto) => void;
  hasOwnerRepo: boolean;
  releaseSubmitting: boolean;
  versionBump: ReleaseVersionBump;
  suggestedTag: string;
  tagAlreadyExists: boolean;
  validationMessage: string | null;
  onApplySuggestedTag: (nextTag: string) => void;
  onSelectVersionBump: (nextBump: ReleaseVersionBump) => void;
};

const VERSION_BUMPS: ReleaseVersionBump[] = ['major', 'minor', 'patch'];

export const ReleaseVersionStep = ({
  releaseForm,
  setReleaseForm,
  hasOwnerRepo,
  releaseSubmitting,
  versionBump,
  suggestedTag,
  tagAlreadyExists,
  validationMessage,
  onApplySuggestedTag,
  onSelectVersionBump,
}: ReleaseVersionStepProps) => {
  const { t } = useI18n();
  const isDisabled = !hasOwnerRepo || releaseSubmitting;

  return (
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
          {VERSION_BUMPS.map((bump) => (
            <button
              key={bump}
              type="button"
              className={`release-version-bump-btn ${versionBump === bump ? 'release-version-bump-btn--active' : ''}`}
              aria-pressed={versionBump === bump}
              onClick={() => onSelectVersionBump(bump)}
              disabled={isDisabled}
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
            disabled={isDisabled}
            placeholder={t('generated.components.releasecreator.e_g_v1_2_0_65ddb49a')}
          />
        </label>
        <button
          className="release-tag-btn"
          onClick={() => onApplySuggestedTag(suggestedTag)}
          disabled={isDisabled}
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
            disabled={isDisabled}
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
            disabled={isDisabled}
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
  );
};
