import { Check } from 'lucide-react';
import { useI18n } from '@/i18n';
import { activePlannerBranch } from '@/shared/plannerWork';
import type { PlannerItem } from '@/types/projectPlanner';

export function PlannerWorkProgress({ item, phase: explicitPhase }: { item: PlannerItem; phase?: number }) {
  const { tr } = useI18n();
  const branch = activePlannerBranch(item);
  const linked = item.references?.pullRequests.some((reference) => reference.workflowId === branch?.id);
  const phase = explicitPhase ?? (branch?.completedBy ? 3 : !branch ? 0 : linked ? 2 : 1);
  const steps = [tr('Start', 'Start'), tr('Bearbeiten', 'Work'), tr('PR prüfen', 'Review PR'), tr('Erledigt', 'Done')];
  return (
    <ol className="planner-work-progress" aria-label={tr('Workflow-Phasen', 'Workflow phases')}>
      {steps.map((step, index) => (
        <li key={step} aria-current={index === phase ? 'step' : undefined} className={index < phase ? 'complete' : ''}>
          <span aria-hidden="true">{index < phase ? <Check size={13} /> : index + 1}</span>
          {step}
        </li>
      ))}
    </ol>
  );
}
