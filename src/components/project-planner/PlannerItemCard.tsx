import { Tag } from 'lucide-react';
import type { PlannerItem } from '@/types/projectPlanner';
import { usePlannerLabels } from './PlannerDialogs';

export function PlannerItemCard({ item, onEdit, onContextMenu }: { item: PlannerItem; onEdit(): void; onContextMenu(event: React.MouseEvent): void }) {
  const labels = usePlannerLabels();
  return (
    <article className={`planner-card planner-priority-${item.priority}`} onContextMenu={onContextMenu} onClick={onEdit}>
      <div className="planner-card-header">
        <span className={`planner-priority-badge ${item.priority}`}>{labels.priority[item.priority]}</span>
      </div>
      <h3>{item.title}</h3>
      {item.description && <p>{item.description}</p>}
      {item.tags.length > 0 && (
        <div className="planner-card-tags">
          {item.tags.map((tag) => (
            <span key={tag}>
              <Tag size={10} />
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
