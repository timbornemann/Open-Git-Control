import { useI18n } from '@/i18n';
import { activePlannerBranch, plannerWorkReferenceKey } from '@/shared/plannerWork';
import type { PlannerItem } from '@/types/projectPlanner';
import type { PlannerWorkDetails } from '@/types/plannerWork';

export function PlannerWorkPhaseLabel({ item, details }: { item: PlannerItem; details?: PlannerWorkDetails }) {
  const { tr } = useI18n();
  const branch = activePlannerBranch(item);
  if (!branch) return <>{tr('Bereit zum Start', 'Ready to start')}</>;
  if (branch.completedBy) return <>{tr('Durch PR-Merge abgeschlossen', 'Completed by a PR merge')}</>;
  const references = item.references?.pullRequests.filter((entry) => entry.workflowId === branch.id) || [];
  if (!references.length) return <>{tr('In Bearbeitung', 'Work in progress')}</>;
  const requests = references.map((ref) => details?.requests.find((entry) => plannerWorkReferenceKey(entry) === plannerWorkReferenceKey(ref)));
  if (requests.some((entry) => entry?.state === 'open')) return <>{tr('PR offen · bereit zur Prüfung', 'PR open · ready for review')}</>;
  if (requests.some((entry) => entry?.state === 'merged'))
    return (
      <>
        {branch.automationPaused
          ? tr('PR zusammengeführt · Automatik pausiert', 'PR merged · automation paused')
          : tr('PR zusammengeführt · Abschluss prüfen', 'PR merged · check completion')}
      </>
    );
  if (requests.every((entry) => entry?.state === 'closed')) return <>{tr('PR geschlossen · nicht zusammengeführt', 'PR closed · not merged')}</>;
  return <>{tr('PR verknüpft · Prüfstand unbekannt', 'PR linked · check state unknown')}</>;
}
