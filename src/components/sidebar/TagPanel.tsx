import React, { useMemo, useState } from 'react';
import { ArrowUpCircle, Plus, Search, Tag, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import { RepoCard, RepoCardContent, RepoCardHeader, RepoCardToolbar } from './RepoCard';

type Props = {
  tags: string[];
  onCreateTag: () => void;
  onPushTags: () => void;
  onDeleteTag: (name: string) => void;
  onSelectTag: (name: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export const TagPanel: React.FC<Props> = ({ tags, onCreateTag, onPushTags, onDeleteTag, onSelectTag, collapsed, onToggleCollapsed }) => {
  const { tr } = useI18n();
  const [query, setQuery] = useState('');

  const filteredTags = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tags.filter(tag => !normalized || tag.toLowerCase().includes(normalized));
  }, [query, tags]);

  return (
    <RepoCard>
      <RepoCardHeader
        title={tr('Tags', 'Tags')}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        toggleTitle={collapsed ? tr('Tags anzeigen', 'Show tags') : tr('Tags einklappen', 'Collapse tags')}
        actions={(
          <>
            <button className="icon-btn" style={{ padding: '2px' }} onClick={onCreateTag} title={tr('Tag erstellen', 'Create tag')}><Plus size={13} /></button>
            <button className="icon-btn" style={{ padding: '2px' }} onClick={onPushTags} title={tr('Tags pushen', 'Push tags')}><ArrowUpCircle size={13} /></button>
          </>
        )}
      />

      {!collapsed && (
        <>
          <RepoCardToolbar>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                className="repo-filter-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tr('Tags filtern...', 'Filter tags...')}
                style={{ paddingLeft: '26px' }}
              />
            </div>
          </RepoCardToolbar>

          <RepoCardContent className="repo-card-scroll">
            {filteredTags.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {filteredTags.map(tag => (
                  <div
                    key={tag}
                    className="repo-list-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectTag(tag)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectTag(tag);
                      }
                    }}
                    style={{ border: '1px solid transparent', cursor: 'pointer' }}
                    title={tr('Zum Commit dieses Tags springen', 'Jump to this tag commit')}
                  >
                    <Tag size={13} style={{ opacity: 0.7 }} />
                    <span style={{ fontSize: '0.8rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag}</span>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteTag(tag);
                      }}
                      className="icon-btn repo-close-btn"
                      style={{ padding: '2px', opacity: 0 }}
                      title={tr('Tag loeschen', 'Delete tag')}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="repo-state-text">
                {query.trim() ? tr('Keine Tags fuer diesen Filter.', 'No tags for this filter.') : tr('Keine Tags vorhanden.', 'No tags available.')}
              </div>
            )}
          </RepoCardContent>
        </>
      )}
    </RepoCard>
  );
};
