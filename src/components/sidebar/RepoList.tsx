import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderGit2, Pin, PinOff, Search, X } from 'lucide-react';
import type { RepoSortByDto } from '@/types/appDtos';
import { useI18n } from '@/i18n';

type Props = {
  openRepos: string[];
  repoMeta: Record<string, { lastOpened: number; pinned: boolean; createdAt: number }>;
  sortBy: RepoSortByDto;
  onSortChange: (sortBy: RepoSortByDto) => void;
  activeRepo: string | null;
  onSwitchRepo: (repoPath: string) => void;
  onCloseRepo: (repoPath: string) => void;
  onOpenFolder: () => void;
  onCloneByUrl: () => void;
  onTogglePin: (repoPath: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export const RepoList: React.FC<Props> = ({
  openRepos,
  repoMeta,
  sortBy,
  onSortChange,
  activeRepo,
  onSwitchRepo,
  onCloseRepo,
  onOpenFolder,
  onCloneByUrl,
  onTogglePin,
  collapsed,
  onToggleCollapsed,
}) => {
  const [query, setQuery] = useState('');
  const { t, tr, locale } = useI18n();
  const sortOptions: Array<{ value: RepoSortByDto; label: string }> = [
    { value: 'lastOpenedDesc', label: t('generated.components.sidebar.repolist.last_opened_6ece1ffe') },
    { value: 'nameAsc', label: t('generated.components.sidebar.repolist.name_a_z_fcdceb45') },
    { value: 'nameDesc', label: t('generated.components.sidebar.repolist.name_z_a_f90e4631') },
    { value: 'createdAtDesc', label: t('generated.components.sidebar.repolist.created_new_old_3f1c4e45') },
    { value: 'createdAtAsc', label: t('generated.components.sidebar.repolist.created_old_new_2f916185') },
  ];

  const filteredRepos = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return openRepos.filter((repoPath) => {
      if (!normalized) return true;
      const name = (repoPath.split(/[\\/]/).pop() || repoPath).toLowerCase();
      return name.includes(normalized) || repoPath.toLowerCase().includes(normalized);
    });
  }, [openRepos, query]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 2px' }}>
        <button
          className="icon-btn"
          onClick={onToggleCollapsed}
          style={{ padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '4px' }}
          title={
            collapsed ? t('generated.components.sidebar.repolist.show_repos_2ba8eb08') : t('generated.components.sidebar.repolist.collapse_repos_388ced69')
          }
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
            {t('generated.components.sidebar.repolist.repos_6d1e0da7')}
          </span>
        </button>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', paddingRight: '4px' }}>{openRepos.length}</span>
      </div>

      {!collapsed && (
        <>
          {openRepos.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '0 8px 4px' }}>
              <label
                htmlFor="repo-sort-select"
                style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}
              >
                {t('generated.components.sidebar.repolist.sort_408bf88f')}
              </label>
              <select
                id="repo-sort-select"
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value as RepoSortByDto)}
                style={{
                  flex: 1,
                  maxWidth: '190px',
                  padding: '5px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-panel)',
                  color: 'var(--text-primary)',
                  fontSize: '0.78rem',
                }}
                title={t('generated.components.sidebar.repolist.repository_sort_order_4a096d7e')}
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {openRepos.length > 0 && (
            <div className="sidebar-search-wrap">
              <Search size={14} className="sidebar-search-icon" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('generated.components.sidebar.repolist.search_repository_4f79edce')}
                className="sidebar-filter-input"
                style={{
                  padding: '7px 8px 7px 28px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-panel)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                }}
              />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {filteredRepos.map((repoPath) => {
              const name = repoPath.split(/[\\/]/).pop() || repoPath;
              const isActive = repoPath === activeRepo;
              const isPinned = repoMeta[repoPath]?.pinned || false;
              const lastOpened = repoMeta[repoPath]?.lastOpened || 0;

              return (
                <div
                  key={repoPath}
                  className="repo-list-item"
                  onClick={() => onSwitchRepo(repoPath)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 8px',
                    backgroundColor: isActive ? 'var(--bg-hover)' : 'transparent',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: isActive ? '1px solid var(--accent-primary)' : '1px solid transparent',
                  }}
                >
                  <FolderGit2
                    size={14}
                    style={{ opacity: isActive ? 1 : 0.6, flexShrink: 0, color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)' }}
                  />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span
                      style={{
                        fontSize: '0.85rem',
                        fontWeight: isActive ? 600 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      {name}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                      {new Date(lastOpened).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}{' '}
                      {new Date(lastOpened).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePin(repoPath);
                    }}
                    className="icon-btn sidebar-row-action-icon"
                    style={{ opacity: isPinned ? 1 : 0.7, color: isPinned ? 'var(--status-warning)' : 'var(--text-secondary)' }}
                    title={
                      isPinned
                        ? t('generated.components.sidebar.repolist.remove_favorite_baff5f08')
                        : t('generated.components.sidebar.repolist.mark_as_favorite_e3ba96ce')
                    }
                  >
                    {isPinned ? <Pin size={12} /> : <PinOff size={12} />}
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseRepo(repoPath);
                    }}
                    className="icon-btn repo-close-btn sidebar-row-action-icon"
                    style={{ opacity: 0 }}
                    title={t('generated.components.layout.sidebar.settingssidebarcontent.remove_d54fc957')}
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}

            {openRepos.length > 0 && filteredRepos.length === 0 && (
              <div style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                {tr(`Keine Treffer f\u00fcr "${query}".`, `No matches for "${query}".`)}
              </div>
            )}

            {openRepos.length === 0 && (
              <div style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <FolderGit2 size={36} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
                {t('generated.components.sidebar.repolist.no_repository_opened_97f33d44')}
                <button
                  onClick={onOpenFolder}
                  style={{
                    marginTop: '12px',
                    display: 'block',
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'var(--accent-primary)',
                    color: 'var(--on-accent)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                  }}
                >
                  {t('generated.components.sidebar.repolist.open_repository_82c17989')}
                </button>
                <button
                  onClick={onCloneByUrl}
                  style={{
                    marginTop: '8px',
                    display: 'block',
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-panel)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                  }}
                >
                  {t('generated.components.sidebar.repolist.clone_repository_from_url_b2415d88')}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
