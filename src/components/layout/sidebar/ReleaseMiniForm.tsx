import React from 'react';
import type { GitHubCreateReleaseParamsDto, GitHubReleaseDto } from '@/global';
import { useI18n } from '@/i18n';
import { validateGithubReleaseInput } from '@/utils/githubReleaseValidation';

type ReleaseMiniFormProps = {
  ownerRepo: { owner: string; repo: string } | null;
  releaseForm: GitHubCreateReleaseParamsDto;
  setReleaseForm: (updater: (prev: GitHubCreateReleaseParamsDto) => GitHubCreateReleaseParamsDto) => void;
  releaseSubmitting: boolean;
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
  const releaseSubmitDisabled = !ownerRepo || releaseSubmitting || !releaseValidation.valid;

  return (
    <div
      style={{
        padding: '8px',
        borderRadius: '6px',
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        marginBottom: '6px',
        opacity: ownerRepo ? 1 : 0.6,
      }}
    >
      <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
        {t('generated.components.layout.sidebar.githubconnectedcontent.create_release_f0fffb84')}
      </div>
      <input
        type="text"
        placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.tag_name_required_f52acebf')}
        value={releaseForm.tagName || ''}
        onChange={(e) => setReleaseForm((prev) => ({ ...prev, tagName: e.target.value }))}
        disabled={!ownerRepo || releaseSubmitting}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '6px 8px',
          borderRadius: '4px',
          border: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-dark)',
          color: 'var(--text-primary)',
          fontSize: '0.82rem',
        }}
      />
      <input
        type="text"
        placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.release_name_required_cbead0c8')}
        value={releaseForm.releaseName || ''}
        onChange={(e) => setReleaseForm((prev) => ({ ...prev, releaseName: e.target.value }))}
        disabled={!ownerRepo || releaseSubmitting}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '6px 8px',
          borderRadius: '4px',
          border: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-dark)',
          color: 'var(--text-primary)',
          fontSize: '0.82rem',
        }}
      />
      <input
        type="text"
        placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.target_branch_or_commit_optional_3500df18')}
        value={releaseForm.targetCommitish || ''}
        onChange={(e) => setReleaseForm((prev) => ({ ...prev, targetCommitish: e.target.value }))}
        disabled={!ownerRepo || releaseSubmitting}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '6px 8px',
          borderRadius: '4px',
          border: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-dark)',
          color: 'var(--text-primary)',
          fontSize: '0.82rem',
        }}
      />
      <textarea
        placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.release_notes_optional_4d1c1433')}
        value={releaseForm.body || ''}
        onChange={(e) => setReleaseForm((prev) => ({ ...prev, body: e.target.value }))}
        rows={3}
        disabled={!ownerRepo || releaseSubmitting}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '6px 8px',
          borderRadius: '4px',
          border: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-dark)',
          color: 'var(--text-primary)',
          fontSize: '0.82rem',
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={Boolean(releaseForm.draft)}
            onChange={(e) => setReleaseForm((prev) => ({ ...prev, draft: e.target.checked }))}
            disabled={!ownerRepo || releaseSubmitting}
          />
          {t('generated.components.layout.sidebar.githubconnectedcontent.draft_03fcb5d9')}
        </label>
        <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={Boolean(releaseForm.prerelease)}
            onChange={(e) => setReleaseForm((prev) => ({ ...prev, prerelease: e.target.checked }))}
            disabled={!ownerRepo || releaseSubmitting}
          />
          {t('generated.components.layout.sidebar.githubconnectedcontent.pre_release_4bb763f1')}
        </label>
      </div>

      {!releaseValidation.valid && (
        <div style={{ fontSize: '0.74rem', color: 'var(--status-warning)' }}>
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
        <div style={{ fontSize: '0.74rem', color: 'var(--status-danger)', lineHeight: 1.35 }}>
          {releaseError}
          {(releaseError.toLowerCase().includes('tag') || releaseError.toLowerCase().includes('already')) && (
            <div style={{ marginTop: '4px', color: 'var(--text-secondary)' }}>
              {t('generated.components.layout.sidebar.githubconnectedcontent.action_choose_a_different_tag_57f2abcc')}
            </div>
          )}
        </div>
      )}

      {releaseSuccess && (
        <div style={{ fontSize: '0.74rem', color: 'var(--status-success)', lineHeight: 1.35 }}>
          {t('generated.components.layout.sidebar.githubconnectedcontent.release_created_successfully_3bde93c8')}{' '}
          <a
            href={releaseSuccess.htmlUrl}
            onClick={(e) => {
              e.preventDefault();
              onOpenUrl(releaseSuccess.htmlUrl);
            }}
            style={{ color: 'inherit', textDecoration: 'underline' }}
          >
            {t('generated.components.layout.sidebar.githubconnectedcontent.open_release_76771d25')}
          </a>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => {
            void onCreateRelease();
          }}
          disabled={releaseSubmitDisabled}
          style={{
            padding: '5px 10px',
            backgroundColor: releaseSubmitDisabled ? 'var(--bg-dark)' : 'var(--accent-primary)',
            color: releaseSubmitDisabled ? 'var(--text-secondary)' : 'var(--on-accent)',
            border: 'none',
            borderRadius: '4px',
            cursor: releaseSubmitDisabled ? 'not-allowed' : 'pointer',
            fontSize: '0.78rem',
            fontWeight: 600,
          }}
        >
          {releaseSubmitting
            ? t('generated.components.layout.sidebar.githubconnectedcontent.creating_95b39ce8')
            : t('generated.components.layout.sidebar.githubconnectedcontent.create_release_f0fffb84')}
        </button>
      </div>
    </div>
  );
};
