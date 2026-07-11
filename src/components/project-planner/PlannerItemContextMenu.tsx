import React from 'react';
import { ChevronRight, Copy, Flag, ListTodo, Sparkles, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { PlannerItem, PlannerPriority, PlannerStatus } from '@/types/projectPlanner';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, usePlannerLabels } from './PlannerDialogs';

export type PlannerItemContextMenuState = {
  x: number;
  y: number;
  item: PlannerItem;
};

type PlannerItemContextMenuProps = {
  contextMenu: PlannerItemContextMenuState | null;
  busy: boolean;
  canGenerateCommitMessage: boolean;
  isAiCommitGenerating: boolean;
  onClose: () => void;
  onCopyAgentPrompt: (item: PlannerItem) => void;
  onGenerateCommitMessage: (item: PlannerItem) => void;
  onChangePriority: (itemId: string, priority: PlannerPriority) => void;
  onChangeStatus: (itemId: string, status: PlannerStatus) => void;
  onDelete: (itemId: string) => void;
};

type Submenu = 'priority' | 'status' | null;

const MENU_WIDTH = 232;
const SUBMENU_WIDTH = 184;
const MENU_MARGIN = 8;

export const PlannerItemContextMenu: React.FC<PlannerItemContextMenuProps> = ({
  contextMenu,
  busy,
  canGenerateCommitMessage,
  isAiCommitGenerating,
  onClose,
  onCopyAgentPrompt,
  onGenerateCommitMessage,
  onChangePriority,
  onChangeStatus,
  onDelete,
}) => {
  const { tr } = useI18n();
  const labels = usePlannerLabels();
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = React.useState<Submenu>(null);
  const [placement, setPlacement] = React.useState({ left: 0, top: 0, opensLeft: false });

  React.useLayoutEffect(() => {
    if (!contextMenu) return;
    const width = menuRef.current?.offsetWidth || MENU_WIDTH;
    const height = menuRef.current?.offsetHeight || 300;
    const left = Math.max(MENU_MARGIN, Math.min(contextMenu.x, window.innerWidth - width - MENU_MARGIN));
    const top = Math.max(MENU_MARGIN, Math.min(contextMenu.y, window.innerHeight - height - MENU_MARGIN));
    setPlacement({ left, top, opensLeft: left + width + SUBMENU_WIDTH > window.innerWidth - MENU_MARGIN });
    setSubmenu(null);
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

  const { item } = contextMenu;
  const runAction = (action: () => void) => {
    onClose();
    action();
  };

  const renderSubmenu = (kind: Exclude<Submenu, null>) => {
    const isPriority = kind === 'priority';
    const options = isPriority ? PRIORITY_OPTIONS : STATUS_OPTIONS;
    return (
      <div
        className={`planner-item-context-submenu ${placement.opensLeft ? 'opens-left' : ''}`}
        role="menu"
        aria-label={isPriority ? tr('Prioritaet waehlen', 'Choose priority') : tr('Status waehlen', 'Choose status')}
      >
        {options.map((option) => {
          const active = isPriority ? item.priority === option : item.status === option;
          const label = isPriority ? labels.priority[option as PlannerPriority] : labels.status[option as PlannerStatus];
          return (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              className={`planner-item-context-option ${active ? 'active' : ''}`}
              disabled={busy}
              onClick={() =>
                runAction(() => {
                  if (isPriority) onChangePriority(item.id, option as PlannerPriority);
                  else onChangeStatus(item.id, option as PlannerStatus);
                })
              }
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  };

  const renderSubmenuTrigger = (kind: Exclude<Submenu, null>, label: string, icon: React.ReactNode) => {
    const open = submenu === kind;
    return (
      <div className="planner-item-context-submenu-trigger" onMouseEnter={() => setSubmenu(kind)} onFocus={() => setSubmenu(kind)}>
        <button
          type="button"
          role="menuitem"
          className="planner-item-context-action"
          disabled={busy}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setSubmenu((current) => (current === kind ? null : kind))}
        >
          {icon}
          <span>{label}</span>
          <ChevronRight className="planner-item-context-chevron" size={15} />
        </button>
        {open && renderSubmenu(kind)}
      </div>
    );
  };

  return (
    <div
      className="planner-item-context-backdrop"
      onMouseDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        className="planner-item-context-menu"
        role="menu"
        aria-label={tr('Todo-Aktionen', 'Todo actions')}
        style={{ left: placement.left, top: placement.top }}
        onMouseDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="planner-item-context-header" title={item.title}>
          {item.title}
        </div>
        <button type="button" role="menuitem" className="planner-item-context-action" onClick={() => runAction(() => onCopyAgentPrompt(item))}>
          <Copy size={14} />
          {tr('Agent-Prompt kopieren', 'Copy agent prompt')}
        </button>
        {canGenerateCommitMessage && (
          <button
            type="button"
            role="menuitem"
            className="planner-item-context-action"
            disabled={isAiCommitGenerating}
            onClick={() => runAction(() => onGenerateCommitMessage(item))}
          >
            <Sparkles size={14} />
            {tr('KI-Commit-Nachricht erstellen', 'Create AI commit message')}
          </button>
        )}
        <div className="planner-item-context-separator" />
        {renderSubmenuTrigger('priority', tr('Prioritaet aendern', 'Change priority'), <Flag size={14} />)}
        {renderSubmenuTrigger('status', tr('Status aendern', 'Change status'), <ListTodo size={14} />)}
        <div className="planner-item-context-separator" />
        <button type="button" role="menuitem" className="planner-item-context-action danger" disabled={busy} onClick={() => runAction(() => onDelete(item.id))}>
          <Trash2 size={14} />
          {tr('Todo loeschen', 'Delete todo')}
        </button>
      </div>
    </div>
  );
};
