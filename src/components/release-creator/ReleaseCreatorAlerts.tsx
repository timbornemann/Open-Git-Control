import { AlertCircle } from 'lucide-react';
import { useI18n } from '@/i18n';

type ReleaseCreatorAlertsProps = {
  hasRepository: boolean;
  fallbackUsed: boolean;
};

export const ReleaseCreatorAlerts = ({ hasRepository, fallbackUsed }: ReleaseCreatorAlertsProps) => {
  const { tr } = useI18n();

  return (
    <>
      {!hasRepository && (
        <div className="release-alert release-alert--warning">
          <AlertCircle size={16} />
          <div>
            <strong>{tr('Hosting-Zuordnung fehlt', 'Hosting target missing')}</strong>
            <p>
              {tr(
                'Verbinde ein Konto und ordne diesem Repository ein Veröffentlichungsziel zu.',
                'Connect an account and choose a publication target for this repository.',
              )}
            </p>
          </div>
        </div>
      )}
      {fallbackUsed && (
        <div className="release-alert release-alert--warning">
          <AlertCircle size={16} />
          <div>
            {tr(
              'Die Release-Basis oder vollständige Historie ist nicht verfügbar. Angezeigt werden die neuesten Commits.',
              'The release baseline or complete history is unavailable. Showing recent commits.',
            )}
          </div>
        </div>
      )}
    </>
  );
};
