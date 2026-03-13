import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderGit2, Pin, PinOff, Search, X } from 'lucide-react';
import { useI18n } from '../../i18n';

type Props = {
  openRepos: string[];
  repoMeta: Record<string, { lastOpened: number; pinned: boolean }>;
  activeRepo: string | null;
  onSwitchRepo: (repoPath: string) => void;
  onCloseRepo: (repoPath: string) => void;
  onOpenFolder: () => void;
  onTogglePin: (repoPath: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export const RepoList: React.FC<Props> = ({
  openRepos,
  repoMeta,
  activeRepo,
  onSwitchRepo,
  onCloseRepo,
  onOpenFolder,
  onTogglePin,
  collapsed,
  onToggleCollapsed,
}) => {
  const [query, setQuery] = useState('');
  const { tr, locale } = useI18n();

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
          title={collapsed ? tr('Repos anzeigen', 'Show repos') : tr('Repos einklappen', 'Collapse repos')}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
            {tr('Repos', 'Repos')}
          </span>
        </button>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', paddingRight: '4px' }}>
          {openRepos.length}
        </span>
      </div>

      {!collapsed && (
        <>
          {openRepos.length > 0 && (
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr('Repository suchen...', 'Search repository...')}
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 8px 7px 28px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
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
                  <FolderGit2 size={14} style={{ opacity: isActive ? 1 : 0.6, flexShrink: 0, color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)' }} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: isActive ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {name}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                      {new Date(lastOpened).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}
                      {' '}
                      {new Date(lastOpened).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePin(repoPath);
                    }}
                    className="icon-btn"
                    style={{ padding: '2px', opacity: isPinned ? 1 : 0.7, color: isPinned ? 'var(--status-warning)' : 'var(--text-secondary)' }}
                    title={isPinned ? tr('Favorit entfernen', 'Remove favorite') : tr('Als Favorit markieren', 'Mark as favorite')}
                  >
                    {isPinned ? <Pin size={12} /> : <PinOff size={12} />}
                  </button>

                  <button onClick={(e) => { e.stopPropagation(); onCloseRepo(repoPath); }} className="icon-btn repo-close-btn" style={{ padding: '2px', opacity: 0 }} title={tr('Entfernen', 'Remove')}>
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
                {tr('Kein Repository ge\u00f6ffnet.', 'No repository opened.')}
                <button onClick={onOpenFolder} style={{ marginTop: '12px', display: 'block', width: '100%', padding: '8px 12px', backgroundColor: 'var(--accent-primary)', color: 'var(--on-accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                  {tr('Repository \u00f6ffnen', 'Open repository')}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
