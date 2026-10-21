import { useI18n } from '@/i18n';
import type { PlannerWorkDetails } from '@/types/plannerWork';

export function PlannerWorkHistory({ details, onOpen }: { details?: PlannerWorkDetails; onOpen(sha: string): void }) {
  const { tr } = useI18n();
  return (
    <>
      <h4>{tr('Commitverlauf', 'Commit history')}</h4>
      {details?.historyIncomplete && (
        <p>{tr('Unvollständige Historie: Ein automatischer Abschluss ist gesperrt.', 'Incomplete history: automatic completion is blocked.')}</p>
      )}
      <ol className="planner-work-history">
        {details?.commits.map((commit) => (
          <li key={commit.sha}>
            <button type="button" disabled={commit.state === 'unavailable'} onClick={() => onOpen(commit.sha)}>
              <code>{commit.sha.slice(0, 10)}</code> {commit.subject}
            </button>
            {commit.state !== 'current' && <small>{commit.state === 'replaced' ? tr('ersetzt', 'replaced') : tr('nicht verfügbar', 'unavailable')}</small>}
          </li>
        ))}
      </ol>
      {details?.truncated && <p>{tr('Der angezeigte Verlauf ist begrenzt.', 'The displayed history is limited.')}</p>}
    </>
  );
}
