import { useI18n } from '@/i18n';
import type { BranchChangeResult } from '@/shared/ipc/branchChange';
import { branchChangeText } from './branchChangeText';
import { AlertTriangle, Archive, CheckCircle2, RotateCcw, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import './branch-change.css';

export function BranchChangeOutcome({ result, onRestore, onConflicts }: { result: BranchChangeResult; onRestore(): void; onConflicts(): void }) {
  const { tr } = useI18n();
  const needsReview = Boolean(result.error || result.conflicts.length || (!result.restored && !result.switched));
  const Icon = needsReview ? AlertTriangle : CheckCircle2;
  const status = result.conflicts.length
    ? tr(
        'Konflikte beim Wiederherstellen. Löse die betroffenen Dateien; die Sicherung bleibt erhalten.',
        'Restoration has conflicts. Resolve the affected files; the backup is retained.',
      )
    : result.restored
      ? tr('Änderungen und Staging-Zustand wiederhergestellt.', 'Changes and staged state restored.')
      : result.switched && !result.error
        ? tr('Branch gewechselt. Die Änderungen sind geparkt.', 'Branch switched. Changes are parked.')
        : tr('Der Vorgang benötigt deine Prüfung. Die Sicherung bleibt erhalten.', 'Review is needed. The backup is retained.');
  return (
    <div className="branch-change-outcome">
      <p
        className={`branch-change-outcome-summary${needsReview ? ' branch-change-outcome-summary--warning' : ''}`}
        role="status"
        data-tutorial="branch-change-result"
        data-branch-change-restored={result.restored}
        data-branch-change-switched={result.switched}
      >
        <Icon size={20} aria-hidden="true" />
        {status}
      </p>
      {result.session && (
        <p className="branch-change-saved-hint">
          <Archive size={15} aria-hidden="true" />
          {tr('Stash:', 'Stash:')} {result.session.name} <code>{result.session.stashOid?.slice(0, 12)}</code>
        </p>
      )}
      {result.error && (
        <p className="branch-change-block" role="status">
          {branchChangeText(result.error, tr)}
        </p>
      )}
      {(result.session?.currentBranch || result.session?.currentHead) && (
        <p>
          {tr('Aktuell ausgecheckt:', 'Currently checked out:')} <code>{result.session.currentBranch || result.session.currentHead}</code>
        </p>
      )}
      {result.conflicts.length > 0 && (
        <>
          <ul className="branch-change-conflict-files">
            {result.conflicts.map((file) => (
              <li key={file}>
                <code>{file}</code>
              </li>
            ))}
          </ul>
          <Button variant="primary" icon={<Wrench size={14} aria-hidden="true" />} onClick={onConflicts}>
            {tr('Konflikte lösen', 'Resolve conflicts')}
          </Button>
        </>
      )}
      {result.session && (
        <Button icon={<RotateCcw size={14} aria-hidden="true" />} onClick={onRestore}>
          {tr('Wiederherstellung prüfen', 'Review restoration')}
        </Button>
      )}
    </div>
  );
}
