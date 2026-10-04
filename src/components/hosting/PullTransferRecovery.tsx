import { useI18n } from '@/i18n';
import type { RemoteTransferOperations } from '@/types/remoteTransfers';

type Input = RemoteTransferOperations['pull']['input'];
export function PullTransferRecovery({
  failedPull,
  busy,
  retry,
  openWorkspace,
}: {
  failedPull: Input;
  busy: boolean;
  retry: (input: Input) => void;
  openWorkspace: () => void;
}) {
  const { tr } = useI18n();
  return (
    <div className="hosting-card">
      <strong>
        {tr('Pull wurde unterbrochen', 'Pull was interrupted')}: {failedPull.remote}/{failedPull.branch}
      </strong>
      <p>
        {tr(
          'Lokale Änderungen und Konflikte im Arbeitsbereich prüfen. Die Wiederholung verwendet dieselbe Quelle und denselben Pull-Modus.',
          'Inspect local changes and conflicts in the workspace. Retry uses the same source and pull strategy.',
        )}
      </p>
      <button disabled={busy} onClick={() => retry(failedPull)}>
        {tr('Diese Pull-Quelle erneut versuchen', 'Retry this pull source')}
      </button>
      <button onClick={openWorkspace}>{tr('Arbeitsbereich öffnen', 'Open workspace')}</button>
    </div>
  );
}
