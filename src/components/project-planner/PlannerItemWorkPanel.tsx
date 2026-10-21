import { useI18n } from '@/i18n';
import type { PlannerItem } from '@/types/projectPlanner';
import { PlannerWorkPanel } from './PlannerWorkPanel';

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
        <PlannerWorkPanel repoPath={repoPath} item={item} onNavigate={onNavigate} />
      ) : (
        <button type="button" onClick={onMaterialize}>
          {tr('Repository für die Bearbeitung anlegen …', 'Create a repository to start work …')}
        </button>
      )}
    </>
  );
}
