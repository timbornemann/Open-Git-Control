import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import type { BranchCleanupInspection } from '@/shared/ipc/branchCleanup';
import { BranchCleanupCandidates } from './BranchCleanupCandidates';

type Props = {
  inspection: BranchCleanupInspection;
  selected: Set<string>;
  disabled: boolean;
  onToggle: (id: string) => void;
  onSelectMerged: (kind: 'local' | 'server') => void;
};
export function BranchCleanupGroups({ inspection, selected, disabled, onToggle, onSelectMerged }: Props) {
  const { tr } = useI18n();
  const kept = inspection.candidates.filter((candidate) => candidate.blocks.length);
  const manual = inspection.candidates.filter((candidate) => candidate.kind === 'local' && candidate.classification === 'other' && !candidate.blocks.length);
  const choices = { targets: inspection.targets, selected, disabled, onToggle };
  return (
    <>
      {(['local', 'server'] as const).map((kind) => {
        const candidates = inspection.candidates.filter(
          (candidate) => candidate.kind === kind && candidate.classification !== 'other' && !candidate.blocks.length,
        );
        return (
          <section key={kind} className="branch-cleanup-group">
            <div className="branch-cleanup-group-header">
              <h3>
                {kind === 'local' ? tr('Lokale Vorschläge', 'Local suggestions') : tr('Server-Vorschläge', 'Server suggestions')} ({candidates.length})
              </h3>
              {candidates.some((candidate) => candidate.classification === 'merged') && (
                <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onSelectMerged(kind)}>
                  {tr('Zusammengeführte auswählen', 'Select merged')}
                </Button>
              )}
            </div>
            {!candidates.length ? (
              <p>{tr('Keine löschbaren Vorschläge.', 'No deletable suggestions.')}</p>
            ) : (
              <BranchCleanupCandidates {...choices} candidates={candidates} />
            )}
          </section>
        );
      })}
      {manual.length > 0 && (
        <section className="branch-cleanup-group">
          <div className="branch-cleanup-group-header">
            <h3>
              {tr('Weitere lokale Branches – manuell prüfen', 'Other local branches – manual review')} ({manual.length})
            </h3>
          </div>
          <p>
            {tr(
              'Diese Branches sind keine automatischen Vorschläge. Du kannst sie einzeln auswählen; vor dem Löschen ist eine Zusatzbestätigung erforderlich.',
              'These branches are not automatic suggestions. You can select them individually; deletion requires additional confirmation.',
            )}
          </p>
          <BranchCleanupCandidates {...choices} candidates={manual} />
        </section>
      )}
      {kept.length > 0 && (
        <details className="branch-cleanup-kept">
          <summary>
            <Shield size={15} />
            {tr('Beibehalten / gesperrt', 'Keep / blocked')} ({kept.length})
          </summary>
          <BranchCleanupCandidates {...choices} candidates={kept} disabled />
        </details>
      )}
    </>
  );
}
