import { useI18n } from '@/i18n';
import type { GitPushBatchDto, RemotePreferences } from '@/types/remoteTransfers';
import type { SecretScanResultDto } from '@/types/gitDtos';
import { GitFailureMessage } from '@/components/ui/GitFailureMessage';
import { pushFailureDetails } from './transferFailureContext';

export function PushTransferResults({
  batch,
  busy,
  canRetry,
  reviewRetry,
  scan,
  preferences,
}: {
  batch: GitPushBatchDto;
  busy: boolean;
  canRetry: boolean;
  reviewRetry: () => void;
  scan?: SecretScanResultDto | null;
  preferences?: RemotePreferences;
}) {
  const { tr } = useI18n();
  return (
    <div className="hosting-card">
      <strong>
        {tr('Push-Ergebnis', 'Push result')}: {batch.state}
      </strong>
      {scan?.pushScope?.fallbackReasons.length ? (
        <details>
          <summary>{tr('Prüfdetails', 'Check details')}</summary>
          {scan.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </details>
      ) : null}
      {batch.targets.map((target) => {
        const failed = ['failed', 'rejected', 'unknown'].includes(target.status);
        const binding = preferences?.bindings?.find((item) => item.remoteName === target.remoteName && item.url === target.url);
        return (
          <div key={target.id}>
            <p>
              {target.remoteName}: {target.status}
            </p>
            <small>{target.url}</small>
            {failed ? (
              <GitFailureMessage
                message={pushFailureDetails(target)}
                context={{
                  repoPath: batch.repoPath,
                  remote: target.remoteName,
                  url: target.url,
                  connectionId: binding?.credentialMode === 'system' ? null : (binding?.repository?.connectionId ?? null),
                }}
              />
            ) : (
              <small>{target.message}</small>
            )}
            {!failed &&
              target.refResults?.map((ref) => (
                <small key={ref.destinationRef}>
                  {ref.destinationRef}: {ref.status} · {ref.message}
                </small>
              ))}
          </div>
        );
      })}
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
