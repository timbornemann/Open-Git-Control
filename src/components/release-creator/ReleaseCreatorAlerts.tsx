import { AlertCircle, CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import type { GitHubReleaseDto } from '@/types/githubDtos';
import { useI18n } from '@/i18n';

type ReleaseCreatorAlertsProps = {
  hasOwnerRepo: boolean;
  contextError: string | null;
  fallbackUsed: boolean;
  releaseError: string | null;
  releaseSuccess: GitHubReleaseDto | null;
};

export const ReleaseCreatorAlerts = ({ hasOwnerRepo, contextError, fallbackUsed, releaseError, releaseSuccess }: ReleaseCreatorAlertsProps) => {
  const { t } = useI18n();

  return (
    <>
      {!hasOwnerRepo && (
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
      {fallbackUsed && (
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
    </>
  );
};
