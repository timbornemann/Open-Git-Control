import { AlertCircle } from 'lucide-react';
import { useI18n } from '@/i18n';

type ReleaseCreatorAlertsProps = {
  hasOwnerRepo: boolean;
  fallbackUsed: boolean;
};

export const ReleaseCreatorAlerts = ({ hasOwnerRepo, fallbackUsed }: ReleaseCreatorAlertsProps) => {
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
      {fallbackUsed && (
        <div className="release-alert release-alert--warning">
          <AlertCircle size={16} />
          <div>{t('generated.components.releasecreator.latest_release_tag_was_not_found_locally_showing_recent_b17316f0')}</div>
        </div>
      )}
    </>
  );
};
