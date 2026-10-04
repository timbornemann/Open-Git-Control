import { useI18n } from '@/i18n';
import type { GitPushBatchDto } from '@/types/remoteTransfers';

export function PushTransferResults({
  batch,
  busy,
  canRetry,
  reviewRetry,
}: {
  batch: GitPushBatchDto;
  busy: boolean;
  canRetry: boolean;
  reviewRetry: () => void;
}) {
  const { tr } = useI18n();
  return (
    <div className="hosting-card">
      <strong>
        {tr('Push-Ergebnis', 'Push result')}: {batch.state}
      </strong>
      {batch.targets.map((target) => (
        <div key={target.id}>
          <p>
            {target.remoteName}: {target.status}
          </p>
          <small>{target.url}</small>
          <small>{target.message}</small>
          {target.refResults?.map((ref) => (
            <small key={ref.destinationRef}>
              {ref.destinationRef}: {ref.status} · {ref.message}
            </small>
          ))}
        </div>
      ))}
      {batch.targets.some((target) => target.grouped && !['success', 'up-to-date'].includes(target.status)) && (
        <p>
          {tr(
            'Für erfolglose Gruppen-Endpunkte getrennte Remotes einrichten oder einen neuen normalen Gruppen-Push prüfen. Gezielte Wiederholung und Force sind mit dieser Git-Version nicht verfügbar.',
            'Use separate remotes for unsuccessful grouped endpoints or review a new normal group push. Targeted retry and force are unavailable with this Git version.',
          )}
        </p>
      )}
      {batch.state !== 'success' && batch.targets.some((target) => !target.grouped && !['success', 'up-to-date'].includes(target.status)) && (
        <button disabled={busy || !canRetry} onClick={reviewRetry}>
          {tr('Nur fehlgeschlagene Ziele wiederholen', 'Retry unsuccessful targets only')}
        </button>
      )}
    </div>
  );
}
