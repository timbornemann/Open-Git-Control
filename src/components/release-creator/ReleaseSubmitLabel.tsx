import type { ReleaseSubmissionPhase } from '@/types/githubDtos';
import { useI18n } from '@/i18n';

export function ReleaseSubmitLabel({ submitting, phase }: { submitting: boolean; phase?: ReleaseSubmissionPhase }) {
  const { tr } = useI18n();
  if (!submitting) return <>{tr('Release erstellen', 'Create release')}</>;
  const labels: Record<ReleaseSubmissionPhase, string> = {
    idle: tr('Release wird erstellt …', 'Creating release …'),
    checking: tr('Release-Ziel wird geprüft …', 'Checking release target …'),
    'awaiting-decision': tr('Entscheidung ausstehend …', 'Awaiting decision …'),
    pushing: tr('Commits werden gepusht …', 'Pushing commits …'),
    creating: tr('Release wird erstellt …', 'Creating release …'),
  };
  return <span role="status">{labels[phase || 'creating']}</span>;
}
