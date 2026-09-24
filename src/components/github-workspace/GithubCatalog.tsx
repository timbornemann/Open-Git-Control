import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Download, LockKeyhole, Plus, Search, Star, FolderGit2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { GitHubRepositoryDto } from '@/types/githubDtos';
import { githubClient } from '@/services/githubClient';
import { toRepoIdentity } from '@/components/layout/sidebar/useGithubRepoOriginMap';
import { selectGithubCatalogRepos } from './githubCatalogSelectors';

type Props = {
  repos: GitHubRepositoryDto[];
  localRepos: Map<string, string[]>;
  pinnedIds: Set<number>;
  online: boolean;
  loading: boolean;
  loadedCount: number;
  onOpen: (repo: GitHubRepositoryDto) => void;
  onTogglePin: (repo: GitHubRepositoryDto) => void;
  onClone: (repo: GitHubRepositoryDto) => void;
  onCreate: () => void;
};

export const GithubCatalog: React.FC<Props> = ({ repos, localRepos, pinnedIds, online, loading, loadedCount, onOpen, onTogglePin, onClone, onCreate }) => {
  const { tr, locale } = useI18n();
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState<'all' | 'local' | 'remote'>('all');
  const [visibility, setVisibility] = useState<'all' | 'public' | 'private'>('all');
  const [sort, setSort] = useState<'updated' | 'name'>('updated');
  const visible = useMemo(
    () => selectGithubCatalogRepos(repos, localRepos, pinnedIds, { search, location, visibility, sort, locale }),
    [repos, localRepos, pinnedIds, search, location, visibility, sort, locale],
  );

  return (
    <div className="github-workspace__inner">
      <div className="github-workspace__hero">
        <div>
          <span className="github-workspace__eyebrow">GITHUB WORKSPACE</span>
          <h1>{tr('Repositories', 'Repositories')}</h1>
          <p>{tr('Deine Repositories, Pull Requests und Actions an einem Ort.', 'Your repositories, pull requests and Actions in one place.')}</p>
        </div>
        {online && (
          <button className="github-workspace__primary" onClick={onCreate}>
            <Plus size={16} /> {tr('Neues Repo', 'New repository')}
          </button>
        )}
      </div>
      <div className="github-workspace__toolbar">
        <label className="github-workspace__search">
          <Search size={16} />
          <input
            aria-label={tr('Repositories durchsuchen', 'Search repositories')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr('Repos durchsuchen …', 'Search repositories …')}
          />
        </label>
        <select aria-label={tr('Lokaler Status', 'Local status')} value={location} onChange={(event) => setLocation(event.target.value as typeof location)}>
          <option value="all">{tr('Lokal & Remote', 'Local & remote')}</option>
          <option value="local">{tr('Lokal vorhanden', 'Available locally')}</option>
          <option value="remote">{tr('Nur Remote', 'Remote only')}</option>
        </select>
        <select aria-label={tr('Sichtbarkeit', 'Visibility')} value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}>
          <option value="all">{tr('Alle Sichtbarkeiten', 'All visibility')}</option>
          <option value="public">{tr('Öffentlich', 'Public')}</option>
          <option value="private">{tr('Privat', 'Private')}</option>
        </select>
        <select aria-label={tr('Sortierung', 'Sort order')} value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
          <option value="updated">{tr('Zuletzt aktualisiert', 'Recently updated')}</option>
          <option value="name">{tr('Name A–Z', 'Name A–Z')}</option>
        </select>
      </div>
      <div className="github-workspace__results" role="status">
        {visible.length} {tr('von', 'of')} {repos.length} {tr('Repositories', 'repositories')}
        {loading ? ` · ${tr('Lade', 'Loading')} ${loadedCount} …` : ''}
      </div>
      {visible.length === 0 ? (
        <div className="github-workspace__empty">
          {loading
            ? tr('Repositories werden geladen …', 'Loading repositories …')
            : tr('Keine passenden Repositories gefunden.', 'No matching repositories found.')}
        </div>
      ) : (
        <div className="github-workspace__grid">
          {visible.map((repo) => {
            const paths = localRepos.get(toRepoIdentity(repo.htmlUrl) || '') || [];
            return (
              <article className="github-repo-card" key={repo.id}>
                <div className="github-repo-card__top">
                  <span className="github-repo-card__signet" aria-hidden="true">
                    <FolderGit2 size={20} />
                  </span>
                  <button
                    className={`github-repo-card__pin${pinnedIds.has(repo.id) ? ' is-pinned' : ''}`}
                    disabled={!online}
                    onClick={() => onTogglePin(repo)}
                    aria-label={pinnedIds.has(repo.id) ? tr('Pin entfernen', 'Remove pin') : tr('Repo anheften', 'Pin repository')}
                    aria-pressed={pinnedIds.has(repo.id)}
                  >
                    <Star size={17} fill={pinnedIds.has(repo.id) ? 'currentColor' : 'none'} />
                  </button>
                </div>
                <button className="github-repo-card__main" onClick={() => onOpen(repo)}>
                  <span className="github-repo-card__owner">{repo.fullName.split('/')[0]}</span>
                  <strong>{repo.name}</strong>
                  <span className="github-repo-card__description">{repo.description || tr('Keine Beschreibung vorhanden.', 'No description available.')}</span>
                </button>
                <div className="github-repo-card__meta">
                  <span>
                    {repo.private ? <LockKeyhole size={13} /> : <span className="github-repo-card__public-dot" />}{' '}
                    {repo.private ? tr('Privat', 'Private') : tr('Öffentlich', 'Public')}
                  </span>
                  <span>
                    <FolderGit2 size={13} /> {paths.length ? `${paths.length} ${tr('lokal', 'local')}` : tr('Nur Remote', 'Remote only')}
                  </span>
                </div>
                <div className="github-repo-card__footer">
                  <span>{repo.updatedAt ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(repo.updatedAt)) : '—'}</span>
                  <div>
                    {online && !paths.length && (
                      <button aria-label={tr(`${repo.name} klonen`, `Clone ${repo.name}`)} title={tr('Klonen', 'Clone')} onClick={() => onClone(repo)}>
                        <Download size={15} />
                      </button>
                    )}
                    <button
                      aria-label={tr(`${repo.name} auf GitHub öffnen`, `Open ${repo.name} on GitHub`)}
                      title={tr('Auf GitHub öffnen', 'Open on GitHub')}
                      onClick={() => void githubClient.openExternalUrl(repo.htmlUrl)}
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
