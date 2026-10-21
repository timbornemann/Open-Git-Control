import { useI18n } from '@/i18n';
import type { PlannerItem } from '@/types/projectPlanner';
import { GitBranch, ArrowUpRight } from 'lucide-react';
import { activePlannerBranch } from '@/shared/plannerWork';
import { requestPlannerWork } from './plannerWorkDialogState';

export function PlannerItemWorkPanel({
  item,
  original,
  repoPath,
  onReload,
  onNavigate,
  onMaterialize,
}: {
  item: PlannerItem;
  original: PlannerItem;
  repoPath: string | null;
  onReload(): void;
  onNavigate(): void;
  onMaterialize(): void;
}) {
  const { tr } = useI18n();
  const branch = activePlannerBranch(item);
  return (
    <>
      {item.updatedAt !== original.updatedAt && (
        <p role="status">
          {tr('Die gespeicherte Aufgabe wurde aktualisiert. Dein Entwurf bleibt erhalten.', 'The saved task was updated. Your draft is preserved.')}{' '}
          <button type="button" onClick={onReload}>
            {tr('Entwurf verwerfen und neu laden', 'Discard draft and reload')}
          </button>
        </p>
      )}
      {repoPath ? (
        <button type="button" className="planner-btn planner-btn-secondary planner-work-entry" onClick={() => requestPlannerWork(repoPath, item, onNavigate)}>
          <GitBranch size={15} />
          {branch ? tr('Aufgaben-Workflow öffnen', 'Open task workflow') : tr('Bearbeitung starten …', 'Start work …')}
          <ArrowUpRight size={14} />
        </button>
      ) : (
        <button type="button" onClick={onMaterialize}>
          {tr('Repository für die Bearbeitung anlegen …', 'Create a repository to start work …')}
        </button>
      )}
    </>
  );
}
