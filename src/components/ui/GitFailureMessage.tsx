import { useOptionalNotifications } from '@/contexts/NotificationContext';
import { useI18n } from '@/i18n';
import type { GitErrorContext } from '@/types/notifications';
import { explainGitNotification } from '@/utils/gitFailure';
import { Button } from './Button';
import { TechnicalDetails } from './TechnicalDetails';

/** The same explanation/remedies as notifications, for retained operation results. */
export function GitFailureMessage({ message, context, detailsOnly = false }: { message: string; context?: GitErrorContext; detailsOnly?: boolean }) {
  const { tr } = useI18n();
  const notifications = useOptionalNotifications();
  const input = { msg: message, isError: true, gitContext: context };
  const presentation = explainGitNotification(notifications?.prepare?.(input) ?? input, tr);
  if (detailsOnly) return <TechnicalDetails>{presentation.technicalDetails || presentation.msg}</TechnicalDetails>;
  return (
    <div className="git-failure-message">
      <p className="hosting-error" role="alert">
        {presentation.msg}
      </p>
      <TechnicalDetails>{presentation.technicalDetails}</TechnicalDetails>
      {presentation.actions?.length ? (
        <div className="hosting-actions">
          {presentation.actions.map((action) => (
            <Button key={action.label} onClick={action.onClick} disabled={action.disabled}>
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
