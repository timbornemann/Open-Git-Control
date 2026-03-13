import React from 'react';
import { ArrowUpCircle, ChevronDown, ChevronRight, Plus, Tag, X } from 'lucide-react';
import { useI18n } from '../../i18n';

type Props = {
  tags: string[];
  onCreateTag: () => void;
  onPushTags: () => void;
  onDeleteTag: (name: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export const TagPanel: React.FC<Props> = ({ tags, onCreateTag, onPushTags, onDeleteTag, collapsed, onToggleCollapsed }) => {
  const { tr } = useI18n();

  return (
    <>
      <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '8px 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 6px' }}>
        <button
          className="icon-btn"
          onClick={onToggleCollapsed}
          style={{ padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '4px' }}
          title={collapsed ? tr('Tags anzeigen', 'Show tags') : tr('Tags einklappen', 'Collapse tags')}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
            {tr('Tags', 'Tags')}
          </span>
        </button>
        <div style={{ display: 'flex', gap: '2px' }}>
          <button className="icon-btn" style={{ padding: '2px' }} onClick={onCreateTag} title={tr('Tag erstellen', 'Create tag')}><Plus size={13} /></button>
          <button className="icon-btn" style={{ padding: '2px' }} onClick={onPushTags} title={tr('Tags pushen', 'Push tags')}><ArrowUpCircle size={13} /></button>
        </div>
      </div>

      {!collapsed && tags.map(tag => (
        <div key={tag} className="repo-list-item" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', borderRadius: '4px' }}>
          <Tag size={13} style={{ opacity: 0.7 }} />
          <span style={{ fontSize: '0.82rem', flex: 1 }}>{tag}</span>
          <button onClick={() => onDeleteTag(tag)} className="icon-btn repo-close-btn" style={{ padding: '2px', opacity: 0 }} title={tr('Tag l\u00f6schen', 'Delete tag')}><X size={11} /></button>
        </div>
      ))}
    </>
  );
};
