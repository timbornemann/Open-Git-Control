import { useI18n } from '@/i18n';
import { useWorkflowStore } from '@/contexts/AppStateContext';
import { BranchChangeOutcome } from '@/components/branch-change/BranchChangeOutcome';
import { requestParkedChanges } from '@/components/branch-change/branchChangeDialogState';
import type { PlannerStartWorkResult } from '@/types/plannerWork';
import { useState } from 'react';

export function PlannerWorkRecoveryReview({
  partial,
  repo,
  accepted,
  busy,
  onAccept,
  onClose,
}: {
  partial: PlannerStartWorkResult;
  repo: string;
  accepted: boolean;
  busy: boolean;
  onAccept(value: boolean): void;
  onClose(): void;
}) {
  const { tr } = useI18n();
  const [error, setError] = useState('');
  const openConflicts = useWorkflowStore((state) => state.onOpenConflictResolverForPath);
  return (
    <>
      <p>
        {tr(
          'Der Branch wurde ausgecheckt. Prüfe den Arbeitsstand, bevor die Aufgabe zugeordnet wird.',
          'The branch was checked out. Review the working state before assigning the task.',
        )}
      </p>
      {partial.branchChange && (
        <BranchChangeOutcome
          result={partial.branchChange}
          onRestore={() => {
            const id = partial.branchChange?.session?.id;
            if (id)
              void requestParkedChanges(repo, id)
                .then((result) => {
                  if (result?.restored) onAccept(true);
                })
                .catch((error: unknown) => setError(String(error)));
          }}
          onConflicts={() => {
            const file = partial.branchChange?.conflicts[0];
            if (file) {
              onClose();
              openConflicts?.(file);
            }
          }}
        />
      )}
      {error && <p role="alert">{error}</p>}
      {partial.requiresChangesReview && (
        <label className="planner-work-checkbox">
          <input type="checkbox" checked={accepted} disabled={busy} onChange={(event) => onAccept(event.target.checked)} />
          {tr('Ich habe die gesicherten Änderungen wiederhergestellt oder bewusst geparkt.', 'I restored the saved changes or intentionally kept them parked.')}
        </label>
      )}
    </>
  );
}
