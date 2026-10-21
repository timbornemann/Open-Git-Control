import { useI18n } from '@/i18n';
import type { BranchChangeResult } from '@/shared/ipc/branchChange';
import { branchChangeText } from './branchChangeText';

export function BranchChangeOutcome({ result, onRestore, onConflicts }: { result: BranchChangeResult; onRestore(): void; onConflicts(): void }) {
  const { tr } = useI18n();
  const status = result.restored
    ? tr('Änderungen und Staging-Zustand wiederhergestellt.', 'Changes and staged state restored.')
    : result.switched && !result.error
      ? tr('Branch gewechselt. Die Änderungen sind geparkt.', 'Branch switched. Changes are parked.')
      : tr('Der Vorgang benötigt deine Prüfung. Die Sicherung bleibt erhalten.', 'Review is needed. The backup is retained.');
  return (
    <>
      <p role="status">{status}</p>
      {result.session && (
        <p>
          {tr('Stash:', 'Stash:')} {result.session.name} <code>{result.session.stashOid?.slice(0, 12)}</code>
        </p>
      )}
      {result.error && <p role="status">{branchChangeText(result.error, tr)}</p>}
      {(result.session?.currentBranch || result.session?.currentHead) && (
        <p>
          {tr('Aktuell ausgecheckt:', 'Currently checked out:')} <code>{result.session.currentBranch || result.session.currentHead}</code>
        </p>
      )}
      {result.conflicts.length > 0 && (
        <button type="button" onClick={onConflicts}>
          {tr('Konflikte lösen', 'Resolve conflicts')}
        </button>
      )}
      {result.session && (
        <button type="button" onClick={onRestore}>
          {tr('Wiederherstellung prüfen', 'Review restoration')}
        </button>
      )}
    </>
  );
}
