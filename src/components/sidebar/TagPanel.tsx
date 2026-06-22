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
            <button className="icon-btn sidebar-row-action-icon" onClick={onCreateTag} title={tr('Tag erstellen', 'Create tag')}><Plus size={13} /></button>
            <button className="icon-btn sidebar-row-action-icon" onClick={onPushTags} title={tr('Tags pushen', 'Push tags')}><ArrowUpCircle size={13} /></button>
          </>
        )}
      />

      {!collapsed && (
        <>
          <RepoCardToolbar>
            <div className="sidebar-search-wrap tag-search-wrap">
              <Search size={12} className="sidebar-search-icon" />
              <input
                className="repo-filter-input sidebar-filter-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tr('Tags filtern...', 'Filter tags...')}
              />
            </div>
          </RepoCardToolbar>

          <RepoCardContent className="repo-card-scroll">
            {filteredTags.length > 0 ? (
              <div className="tag-grid">
                {filteredTags.map(tag => (
                  <div
                    key={tag}
                    className="tag-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectTag(tag)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectTag(tag);
                      }
                    }}
                    title={tr('Zum Commit dieses Tags springen', 'Jump to this tag commit')}
                  >
                    <Tag size={12} className="tag-card-icon" />
                    <span className="tag-card-name">{tag}</span>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteTag(tag);
                      }}
                      className="icon-btn repo-close-btn tag-card-delete"
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
