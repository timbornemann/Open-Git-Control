import { useI18n } from '@/i18n';
import { activePlannerBranch } from '@/shared/plannerWork';
import type { PlannerItem } from '@/types/projectPlanner';
import type { PlannerWorkDetails } from '@/types/plannerWork';

export function PlannerWorkCompletion({ item, details, busy, onResume }: { item: PlannerItem; details?: PlannerWorkDetails; busy: boolean; onResume(): void }) {
  const { tr } = useI18n();
  const branch = activePlannerBranch(item);
  if (!branch || branch.completedBy) return null;
  const reasons = {
    'new-work': tr(
      'Der PR ist zusammengeführt. Der Aufgabenbranch enthält weitere, noch nicht geprüfte Änderungen.',
      'The PR is merged. The task branch contains additional changes that have not been reviewed.',
    ),
    'incomplete-history': tr(
      'Der PR ist zusammengeführt. Die unvollständige lokale Historie verhindert den sicheren Abschluss.',
      'The PR is merged. Incomplete local history prevents verified completion.',
    ),
    ambiguous: tr(
      'Mehrere zusammengeführte PRs sind verknüpft. Prüfe die Zuordnung vor dem Abschluss.',
      'Multiple merged PRs are linked. Review the assignment before completing the task.',
    ),
    'already-processed': tr(
      'Dieser PR-Merge wurde bereits für eine Bearbeitung verwendet und ändert den Aufgabenstatus nicht erneut.',
      'This PR merge has already been processed for a workflow and will not change the task status again.',
    ),
  };
  const reason = details?.completion && details.completion in reasons ? reasons[details.completion as keyof typeof reasons] : undefined;
  return (
    <>
      {branch.automationPaused && (
        <div className="planner-work-notice" role="status">
          <p>
            {details?.completion === 'ready'
              ? tr(
                  'PR-Merge bestätigt. Für den Abschluss muss die pausierte Statusautomatik fortgesetzt werden.',
                  'PR merge confirmed. Resume paused status automation to complete the task.',
                )
              : tr(
                  'Statusautomatik pausiert. Die Aufgabe wird nicht automatisch abgeschlossen.',
                  'Status automation is paused. The task will not complete automatically.',
                )}
          </p>
          <button type="button" className="planner-btn planner-btn-primary" disabled={busy || !details?.revision} onClick={onResume}>
            {details?.completion === 'ready'
              ? tr('Automatik fortsetzen und Abschluss prüfen', 'Resume automation and check completion')
              : tr('Automatik fortsetzen', 'Resume automation')}
          </button>
        </div>
      )}
      {reason && (
        <p className="planner-work-notice" role="status">
          {reason}
        </p>
      )}
    </>
  );
}
