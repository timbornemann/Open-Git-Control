import { AlertTriangle, Check } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui';
import type { RecoveryIssue } from './recoveryCenterUtils';

export function RecoveryNotice({
  issue,
  message,
  onRetry,
  busy,
}: {
  issue?: RecoveryIssue | null;
  message?: string | null;
  onRetry?: () => void;
  busy?: boolean;
}) {
  const { tr } = useI18n();
  if (!issue && !message) return null;
  return (
    <div className={`recovery-center__notice${issue ? '' : ' recovery-center__notice--success'}`} role={issue ? 'alert' : 'status'}>
      {issue ? <AlertTriangle size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
      <div>
        <p>{issue?.message ?? message}</p>
        {issue?.details && (
          <details>
            <summary>{tr('Technische Details', 'Technical details')}</summary>
            <pre>{issue.details}</pre>
          </details>
        )}
      </div>
      {onRetry && (
        <Button size="xs" onClick={onRetry} disabled={busy}>
          {tr('Erneut laden', 'Retry')}
        </Button>
      )}
    </div>
  );
}
