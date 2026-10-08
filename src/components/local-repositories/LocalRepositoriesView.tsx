import React, { useCallback, useMemo, useState } from 'react';
import { Download, FolderGit2, FolderPlus, Loader2, MoreHorizontal, Pin, Search } from 'lucide-react';
import type { RepoSortByDto } from '@/types/appDtos';
import { useRepositoryContext, useUIContext } from '@/contexts/AppStateContext';
import { useCachedRepoOrigins } from '@/hooks/useRepoOrigins';
import { useAppToast } from '@/hooks/useAppToast';
import { useI18n } from '@/i18n';
import { LocalRepositoryContextMenu, type LocalRepositoryMenuState } from './LocalRepositoryContextMenu';
import { repoName, selectLocalRepositories } from './localRepositorySelectors';
import { RepositoryIcon } from '@/components/repository-icon/RepositoryIcon';

export const LocalRepositoriesView: React.FC = () => {
  const repository = useRepositoryContext();
  const ui = useUIContext();
  const { t, tr, locale } = useI18n();
  const showToast = useAppToast();
  const [search, setSearch] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [menu, setMenu] = useState<LocalRepositoryMenuState | null>(null);
  const [switchingPath, setSwitchingPath] = useState<string | null>(null);
  const origins = useCachedRepoOrigins(repository.openRepos);
  const visible = useMemo(
    () => selectLocalRepositories(repository.openRepos, repository.repoMeta, search, pinnedOnly),
    [repository.openRepos, repository.repoMeta, search, pinnedOnly],
  );
  const closeMenu = useCallback(() => setMenu(null), []);
  const menuPath = menu && repository.openRepos.includes(menu.path) ? menu.path : null;
  const sortOptions: Array<{ value: RepoSortByDto; label: string }> = [
    { value: 'lastOpenedDesc', label: t('generated.components.sidebar.repolist.last_opened_6ece1ffe') },
    { value: 'nameAsc', label: t('generated.components.sidebar.repolist.name_a_z_fcdceb45') },
    { value: 'nameDesc', label: t('generated.components.sidebar.repolist.name_z_a_f90e4631') },
    { value: 'createdAtDesc', label: t('generated.components.sidebar.repolist.created_new_old_3f1c4e45') },
    { value: 'createdAtAsc', label: t('generated.components.sidebar.repolist.created_old_new_2f916185') },
  ];

  const openRepoTab = async (path: string, config?: 'run' | 'remote' | 'allowlist' | 'publish') => {
    if (switchingPath) return;
    setSwitchingPath(path);
    try {
      const activated = await repository.onSwitchRepo(path);
      if (activated) {
        ui.setActiveTab('repo');
        if (config === 'run') ui.onOpenRunConfig();
        else if (config === 'remote') ui.onOpenRemoteConfig();
        else if (config === 'allowlist') ui.onOpenSecretScanAllowlist();
        else if (config === 'publish') ui.onOpenRepositoryPublication?.();
        else {
          ui.onCloseRunConfig();
          ui.onCloseRemoteConfig();
          ui.onCloseSecretScanAllowlist?.();
        }
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : tr('Repository konnte nicht geöffnet werden.', 'Could not open the repository.'), true);
    } finally {
      setSwitchingPath(null);
    }
  };

  return (
    <main className="local-repositories-view">
      <header className="local-repositories-view__hero">
        <div>
          <span className="local-repositories-view__eyebrow">LOCAL WORKSPACE</span>
          <h1>{t('sidebar.localRepos')}</h1>
          <p>{tr('Deine gespeicherten Arbeitsverzeichnisse an einem Ort.', 'Your saved working directories in one place.')}</p>
        </div>
        <div className="local-repositories-view__hero-actions">
          <button type="button" onClick={repository.onOpenFolder}>
            <FolderPlus size={16} /> {tr('Hinzufügen', 'Add repository')}
          </button>
          <button type="button" onClick={repository.onCloneByUrl}>
            <Download size={16} /> {tr('Klonen', 'Clone')}
          </button>
        </div>
      </header>
      <div className="local-repositories-view__toolbar">
        <label className="local-repositories-view__search">
          <Search size={16} />
          <input
            type="search"
            aria-label={tr('Lokale Repositories durchsuchen', 'Search local repositories')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr('Name oder Pfad suchen …', 'Search name or path …')}
          />
        </label>
        <button type="button" className={pinnedOnly ? 'is-selected' : ''} aria-pressed={pinnedOnly} onClick={() => setPinnedOnly((value) => !value)}>
          <Pin size={14} /> {tr('Angeheftet', 'Pinned')}
        </button>
        <select
          aria-label={t('generated.components.sidebar.repolist.repository_sort_order_4a096d7e')}
          value={repository.repoSortBy}
          onChange={(event) => repository.onSetRepoSortBy(event.target.value as RepoSortByDto)}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="local-repositories-view__results" role="status">
        <span>
          {visible.length} {tr('von', 'of')} {repository.openRepos.length} {tr('Repositories', 'repositories')}
        </span>
        {repository.isRestoringRepos && (
          <span className="local-repositories-view__restoring">
            <Loader2 size={13} className="spin" /> {tr('Gespeicherte Einträge werden geprüft …', 'Checking saved entries …')}
          </span>
        )}
      </div>
      <div className="local-repositories-view__scroll" role="region" aria-label={tr('Lokale Repository-Liste', 'Local repository list')} tabIndex={0}>
        {visible.length > 0 ? (
          <div className="local-repositories-view__list">
            {visible.map((path) => {
              const isActive = path === repository.activeRepo;
              const pinned = Boolean(repository.repoMeta[path]?.pinned);
              const lastOpened = repository.repoMeta[path]?.lastOpened;
              const origin = origins[path];
              const name = repoName(path);
              return (
                <article
                  key={path}
                  className={`local-repositories-view__row${isActive ? ' is-active' : ''}`}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({ x: event.clientX, y: event.clientY, path });
                  }}
                >
                  <span className="local-repositories-view__signet" aria-hidden="true">
                    <RepositoryIcon repoPath={path} name={name} size={30} />
                  </span>
                  <button type="button" className="local-repositories-view__row-main" onClick={() => void openRepoTab(path)} disabled={switchingPath !== null}>
                    <span className="local-repositories-view__row-title">
                      <strong>{name}</strong>
                      {isActive && <small>{tr('AKTIV', 'ACTIVE')}</small>}
                    </span>
                    <span className="local-repositories-view__path" title={path}>
                      {path}
                    </span>
                    {origin && (
                      <span className="local-repositories-view__origin" title={origin}>
                        {tr('Ursprung', 'Origin')}: {origin}
                      </span>
                    )}
                  </button>
                  <span className="local-repositories-view__last-opened">
                    <small>{tr('ZULETZT GEÖFFNET', 'LAST OPENED')}</small>
                    {lastOpened && Number.isFinite(lastOpened)
                      ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastOpened))
                      : '—'}
                  </span>
                  <button
                    type="button"
                    className={`local-repositories-view__row-action${pinned ? ' is-pinned' : ''}`}
                    aria-label={pinned ? tr(`${name}: Pin entfernen`, `${name}: remove pin`) : tr(`${name}: anheften`, `${name}: pin`)}
                    aria-pressed={pinned}
                    onClick={() => repository.onToggleRepoPin(path)}
                  >
                    <Pin size={16} fill={pinned ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    type="button"
                    className="local-repositories-view__row-action"
                    aria-label={tr(`Aktionen für ${name}`, `Actions for ${name}`)}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setMenu({ x: rect.right, y: rect.bottom, path });
                    }}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </article>
              );
            })}
          </div>
        ) : repository.isRestoringRepos && repository.openRepos.length === 0 ? (
          <div className="local-repositories-view__placeholder" aria-label={tr('Repositories werden wiederhergestellt', 'Restoring repositories')}>
            <span />
            <span />
            <span />
          </div>
        ) : (
          <div className="local-repositories-view__empty">
            <FolderGit2 size={28} />
            <strong>
              {repository.openRepos.length === 0
                ? tr('Noch keine Repositories gespeichert.', 'No repositories saved yet.')
                : tr('Keine passenden Repositories.', 'No matching repositories.')}
            </strong>
            {repository.openRepos.length === 0 && (
              <button type="button" onClick={repository.onOpenFolder}>
                {tr('Repository hinzufügen', 'Add repository')}
              </button>
            )}
          </div>
        )}
      </div>
      {menu && menuPath && (
        <LocalRepositoryContextMenu
          menu={menu}
          origin={origins[menuPath]}
          pinned={Boolean(repository.repoMeta[menuPath]?.pinned)}
          onClose={closeMenu}
          onOpenRepoTab={(path) => void openRepoTab(path)}
          onOpenRunConfig={(path) => void openRepoTab(path, 'run')}
          onOpenSecretScanAllowlist={(path) => void openRepoTab(path, 'allowlist')}
          onOpenRemoteConfig={(path) => void openRepoTab(path, 'remote')}
          onPublishRepository={(path) => void openRepoTab(path, 'publish')}
          onTogglePin={repository.onToggleRepoPin}
          onRemove={repository.onCloseRepo}
        />
      )}
    </main>
  );
};
