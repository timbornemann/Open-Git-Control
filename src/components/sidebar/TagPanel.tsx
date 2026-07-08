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
  const { t } = useI18n();
  const [query, setQuery] = useState('');

  const filteredTags = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tags.filter(tag => !normalized || tag.toLowerCase().includes(normalized));
  }, [query, tags]);

  return (
    <RepoCard>
      <RepoCardHeader
        title={t('generated.components.project_planner.plannerdialogs.tags_d3c9e52d')}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        toggleTitle={collapsed ? t('generated.components.sidebar.tagpanel.show_tags_be3fb392') : t('generated.components.sidebar.tagpanel.collapse_tags_fc0681fa')}
        actions={(
          <>
            <button className="icon-btn sidebar-row-action-icon" onClick={onCreateTag} title={t('generated.components.sidebar.tagpanel.create_tag_9d35faa7')}><Plus size={13} /></button>
            <button className="icon-btn sidebar-row-action-icon" onClick={onPushTags} title={t('generated.components.sidebar.tagpanel.push_tags_13e7b4c8')}><ArrowUpCircle size={13} /></button>
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
                placeholder={t('generated.components.sidebar.tagpanel.filter_tags_037bbb8f')}
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
                    title={t('generated.components.sidebar.tagpanel.jump_to_this_tag_commit_a17f9ab2')}
                  >
                    <Tag size={12} className="tag-card-icon" />
                    <span className="tag-card-name">{tag}</span>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteTag(tag);
                      }}
                      className="icon-btn repo-close-btn tag-card-delete"
                      title={t('generated.components.sidebar.tagpanel.delete_tag_0014c6f5')}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="repo-state-text">
                {query.trim() ? t('generated.components.sidebar.tagpanel.no_tags_for_this_filter_033ccd17') : t('generated.components.sidebar.tagpanel.no_tags_available_7758d8e7')}
              </div>
            )}
          </RepoCardContent>
        </>
      )}
    </RepoCard>
  );
};
