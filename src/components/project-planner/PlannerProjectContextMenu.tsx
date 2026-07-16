import React from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { PlannerProject } from '@/types/projectPlanner';

export type PlannerProjectContextMenuState = {
  x: number;
  y: number;
  project: PlannerProject;
};

type PlannerProjectContextMenuProps = {
  contextMenu: PlannerProjectContextMenuState | null;
  busy: boolean;
  onClose: () => void;
  onCreateItem: (projectId: string) => void;
  onEdit: (projectId: string) => void;
  onDelete: (projectId: string) => void;
};

const MENU_WIDTH = 232;
const MENU_MARGIN = 8;

export const PlannerProjectContextMenu: React.FC<PlannerProjectContextMenuProps> = ({ contextMenu, busy, onClose, onCreateItem, onEdit, onDelete }) => {
  const { tr } = useI18n();
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = React.useState({ left: 0, top: 0 });

  React.useLayoutEffect(() => {
    if (!contextMenu) return;
    const width = menuRef.current?.offsetWidth || MENU_WIDTH;
    const height = menuRef.current?.offsetHeight || 180;
    setPlacement({
      left: Math.max(MENU_MARGIN, Math.min(contextMenu.x, window.innerWidth - width - MENU_MARGIN)),
      top: Math.max(MENU_MARGIN, Math.min(contextMenu.y, window.innerHeight - height - MENU_MARGIN)),
    });
  }, [contextMenu]);

  React.useEffect(() => {
    if (!contextMenu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', onClose);
    };
  }, [contextMenu, onClose]);

  if (!contextMenu) return null;

  const { project } = contextMenu;
  const deleteLabel = project.kind === 'planned' ? tr('Projektidee loeschen', 'Delete project idea') : tr('Planungsdaten loeschen', 'Delete planning data');
  const runAction = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <div
      className="planner-project-context-backdrop"
      onMouseDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        className="planner-project-context-menu"
        role="menu"
        aria-label={tr('Projektaktionen', 'Project actions')}
        style={{ left: placement.left, top: placement.top }}
        onMouseDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="planner-project-context-header" title={project.name}>
          {project.name}
        </div>
        <button
          type="button"
          role="menuitem"
          className="planner-project-context-action"
          disabled={busy}
          onClick={() => runAction(() => onCreateItem(project.id))}
        >
          <Plus size={14} />
          {tr('Todo erstellen', 'Create todo')}
        </button>
        <button type="button" role="menuitem" className="planner-project-context-action" disabled={busy} onClick={() => runAction(() => onEdit(project.id))}>
          <Pencil size={14} />
          {tr('Projekt bearbeiten', 'Edit project')}
        </button>
        <div className="planner-project-context-separator" />
        <button
          type="button"
          role="menuitem"
          className="planner-project-context-action danger"
          disabled={busy}
          onClick={() => runAction(() => onDelete(project.id))}
        >
          <Trash2 size={14} />
          {deleteLabel}
        </button>
      </div>
    </div>
  );
};
