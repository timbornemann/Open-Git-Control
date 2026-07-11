import React from 'react';
import type { GitHubCreateReleaseParamsDto, GitHubReleaseDto } from '@/types/githubDtos';
import { useI18n } from '@/i18n';
import { Button, Panel, TextField, Toolbar } from '@/components/ui';
import { validateGithubReleaseInput } from '@/utils/githubReleaseValidation';

type ReleaseMiniFormProps = {
  ownerRepo: { owner: string; repo: string } | null;
  releaseForm: GitHubCreateReleaseParamsDto;
  setReleaseForm: (updater: (prev: GitHubCreateReleaseParamsDto) => GitHubCreateReleaseParamsDto) => void;
  releaseSubmitting: boolean;
  releaseNotesGenerating: boolean;
  releaseError: string | null;
  releaseSuccess: GitHubReleaseDto | null;
  onCreateRelease: () => Promise<void>;
  onOpenUrl: (url: string) => void;
};

export const ReleaseMiniForm: React.FC<ReleaseMiniFormProps> = ({
  ownerRepo,
  releaseForm,
  setReleaseForm,
  releaseSubmitting,
  releaseNotesGenerating,
  releaseError,
  releaseSuccess,
  onCreateRelease,
  onOpenUrl,
}) => {
  const { t } = useI18n();
  const releaseValidation = validateGithubReleaseInput({
    tagName: releaseForm.tagName || '',
    releaseName: releaseForm.releaseName || '',
  });
  const formDisabled = !ownerRepo || releaseSubmitting || releaseNotesGenerating;
  const releaseSubmitDisabled = formDisabled || !releaseValidation.valid;

  return (
    <Panel className="release-mini-form" disabled={!ownerRepo}>
      <div className="release-mini-form__title">{t('generated.components.layout.sidebar.githubconnectedcontent.create_release_f0fffb84')}</div>
      <TextField
        type="text"
        placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.tag_name_required_f52acebf')}
        value={releaseForm.tagName || ''}
        onChange={(e) => setReleaseForm((prev) => ({ ...prev, tagName: e.target.value }))}
        disabled={formDisabled}
      />
      <TextField
        type="text"
        placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.release_name_required_cbead0c8')}
        value={releaseForm.releaseName || ''}
        onChange={(e) => setReleaseForm((prev) => ({ ...prev, releaseName: e.target.value }))}
        disabled={formDisabled}
      />
      <TextField
        type="text"
        placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.target_branch_or_commit_optional_3500df18')}
        value={releaseForm.targetCommitish || ''}
        onChange={(e) => setReleaseForm((prev) => ({ ...prev, targetCommitish: e.target.value }))}
        disabled={formDisabled}
      />
      <TextField
        as="textarea"
        placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.release_notes_optional_4d1c1433')}
        value={releaseForm.body || ''}
        onChange={(e) => setReleaseForm((prev) => ({ ...prev, body: e.target.value }))}
        rows={3}
        disabled={formDisabled}
      />
      <div className="release-mini-form__checks">
        <label className="release-mini-form__check">
          <input
            type="checkbox"
            checked={Boolean(releaseForm.draft)}
            onChange={(e) => setReleaseForm((prev) => ({ ...prev, draft: e.target.checked }))}
            disabled={formDisabled}
          />
          {t('generated.components.layout.sidebar.githubconnectedcontent.draft_03fcb5d9')}
        </label>
        <label className="release-mini-form__check">
          <input
            type="checkbox"
            checked={Boolean(releaseForm.prerelease)}
            onChange={(e) => setReleaseForm((prev) => ({ ...prev, prerelease: e.target.checked }))}
            disabled={formDisabled}
          />
          {t('generated.components.layout.sidebar.githubconnectedcontent.pre_release_4bb763f1')}
        </label>
      </div>

      {!releaseValidation.valid && (
        <div className="release-mini-form__message release-mini-form__message--warning">
          {!releaseForm.tagName.trim()
            ? t('generated.components.layout.sidebar.githubconnectedcontent.tag_cannot_be_empty_70283101')
            : releaseValidation.errors.tagName
              ? t('generated.components.layout.sidebar.githubconnectedcontent.tag_contains_invalid_chars_whitespace_4fdbc358')
              : releaseValidation.errors.releaseName === 'release.validation.nameRequired'
                ? t('generated.components.layout.sidebar.githubconnectedcontent.release_name_must_not_be_empty_453809c9')
                : t('generated.components.layout.sidebar.githubconnectedcontent.release_name_must_be_at_least_3_characters_d621812f')}
        </div>
      )}

      {releaseError && (
        <div className="release-mini-form__message release-mini-form__message--danger">
          {releaseError}
          {(releaseError.toLowerCase().includes('tag') || releaseError.toLowerCase().includes('already')) && (
            <div className="release-mini-form__message-detail">
              {t('generated.components.layout.sidebar.githubconnectedcontent.action_choose_a_different_tag_57f2abcc')}
            </div>
          )}
        </div>
      )}

      {releaseSuccess && (
        <div className="release-mini-form__message release-mini-form__message--success">
          {t('generated.components.layout.sidebar.githubconnectedcontent.release_created_successfully_3bde93c8')}{' '}
          <a
            href={releaseSuccess.htmlUrl}
            onClick={(e) => {
              e.preventDefault();
              onOpenUrl(releaseSuccess.htmlUrl);
            }}
            className="release-mini-form__link"
          >
            {t('generated.components.layout.sidebar.githubconnectedcontent.open_release_76771d25')}
          </a>
        </div>
      )}

      <Toolbar align="end">
        <Button
          variant="primary"
          onClick={() => {
            void onCreateRelease();
          }}
          disabled={releaseSubmitDisabled}
        >
          {releaseSubmitting
            ? t('generated.components.layout.sidebar.githubconnectedcontent.creating_95b39ce8')
            : t('generated.components.layout.sidebar.githubconnectedcontent.create_release_f0fffb84')}
        </Button>
      </Toolbar>
    </Panel>
  );
};
