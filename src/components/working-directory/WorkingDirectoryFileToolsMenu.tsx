import React from 'react';
import { ArrowLeft, Check, ChevronRight, Eye, Sparkles, type LucideIcon } from 'lucide-react';

export type WorkingDirectoryToolItem = {
  id: string;
  label: string;
  description?: string;
  active?: boolean;
  action: () => void | Promise<void>;
};

export type WorkingDirectoryToolGroup = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  items: WorkingDirectoryToolItem[];
};

type Props = {
  groups: WorkingDirectoryToolGroup[];
  activeGroup: string | null;
  ariaLabel: string;
  backLabel: string;
  onGroupChange: (group: string | null) => void;
};

export const WorkingDirectoryFileToolsMenu: React.FC<Props> = ({ groups, activeGroup, ariaLabel, backLabel, onGroupChange }) => {
  const selectedGroup = groups.find((group) => group.id === activeGroup) || null;
  return (
    <div className="working-file-tools__menu" role="menu" aria-label={ariaLabel}>
      {selectedGroup ? (
        <>
          <button type="button" className="working-file-tools__back" onClick={() => onGroupChange(null)}>
            <ArrowLeft size={14} />
            <span>
              <strong>{selectedGroup.label}</strong>
              <small>{backLabel}</small>
            </span>
          </button>
          {selectedGroup.items.map((item) => (
            <button key={item.id} type="button" role="menuitem" onClick={() => void item.action()}>
              {item.active ? <Check size={14} /> : item.id === 'whitespace' ? <Eye size={14} /> : <Sparkles size={14} />}
              <span>
                <strong>{item.label}</strong>
                {item.description && <small>{item.description}</small>}
              </span>
            </button>
          ))}
        </>
      ) : (
        groups.map((group) => {
          const Icon = group.icon;
          return (
            <button key={group.id} type="button" role="menuitem" aria-haspopup="menu" onClick={() => onGroupChange(group.id)}>
              <Icon size={14} />
              <span>
                <strong>{group.label}</strong>
                <small>{group.description}</small>
              </span>
              <ChevronRight className="working-file-tools__chevron" size={13} />
            </button>
          );
        })
      )}
    </div>
  );
};
