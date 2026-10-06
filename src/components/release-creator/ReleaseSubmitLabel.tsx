import type { ReleaseSubmissionPhase } from '@/types/releaseNotes';
import { useI18n } from '@/i18n';

export function ReleaseSubmitLabel({ submitting, phase, label }: { submitting: boolean; phase?: ReleaseSubmissionPhase; label?: string }) {
  const { tr } = useI18n();
  if (!submitting) return <>{label || tr('Release erstellen', 'Create release')}</>;
  const labels: Record<ReleaseSubmissionPhase, string> = {
    idle: tr('Release wird erstellt …', 'Creating release …'),
    checking: tr('Release-Ziel wird geprüft …', 'Checking release target …'),
    'awaiting-decision': tr('Entscheidung ausstehend …', 'Awaiting decision …'),
    pushing: tr('Commits werden gepusht …', 'Pushing commits …'),
    creating: tr('Release wird erstellt …', 'Creating release …'),
    uploading: tr('Dateien werden hochgeladen …', 'Uploading files …'),
  };
  return <span role="status">{labels[phase || 'creating']}</span>;
}
