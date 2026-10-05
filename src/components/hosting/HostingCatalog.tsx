import { Download, FolderGit2, GitBranch, Globe, Lock, Search, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextField } from '@/components/ui/TextField';
import { useI18n } from '@/i18n';
import { hostedRepositoryKey, providerLabels, useHostingState } from './hostingState';
import type { useHostingCatalog } from './useHostingCatalog';
import { localRepositoryKey } from './useLocalHostingRepositories';
import type { HostingProvider } from '@/types/hostingDtos';

export function HostingCatalog({ catalog }: { catalog: ReturnType<typeof useHostingCatalog> }) {
  const { tr } = useI18n();
  const state = useHostingState();
  const { repositories, connections, clones, task, pins, togglePin, activateLocal, clone, loadMore } = catalog;
  return (
    <>
      <div className="hosting-filters hosting-catalog-toolbar">
        <label className="hosting-search">
          <Search size={16} aria-hidden="true" />
          <TextField
            aria-label={tr('Repositories suchen', 'Search repositories')}
            placeholder={tr('Repositories suchen …', 'Search repositories …')}
            value={catalog.search}
            onChange={(event) => catalog.setSearch(event.target.value)}
          />
        </label>
        <select
          aria-label={tr('Anbieter filtern', 'Filter provider')}
          value={catalog.providerFilter}
          onChange={(event) => catalog.setProviderFilter(event.target.value as HostingProvider | '')}
        >
          <option value="">{tr('Alle Anbieter', 'All providers')}</option>
          {Object.entries(providerLabels).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label={tr('Server und Konto filtern', 'Filter server and account')}
          value={state.connectionFilter}
          onChange={(event) => state.setConnectionFilter(event.target.value)}
        >
          <option value="">{tr('Alle Konten & Server', 'All accounts & servers')}</option>
          {connections.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {connection.label} · {connection.username ?? connection.baseUrl}
            </option>
          ))}
        </select>
      </div>
      <div className="hosting-results" role="status">
        {repositories.length} {tr('Repositories', 'repositories')}
        {task.busy && ` · ${tr('Wird aktualisiert …', 'Updating …')}`}
      </div>
      <div className="hosting-catalog">
        {repositories.map((repo) => {
          const connection = connections.find((c) => c.id === repo.ref.connectionId);
          const paths = clones[localRepositoryKey(repo.ref)] ?? [];
          const pinned = pins.includes(hostedRepositoryKey(repo));
          return (
            <article className="hosting-repo-card" key={hostedRepositoryKey(repo)}>
              <div className="hosting-repo-card__heading">
                <span className="hosting-signet" aria-hidden="true">
                  <FolderGit2 size={20} />
                </span>
                <Button
                  variant="ghost"
                  className="hosting-repository-title"
                  aria-label={repo.fullName}
                  title={repo.fullName}
                  onClick={() => state.select(repo)}
                >
                  <span className="hosting-repo-card__namespace">{repo.fullName.substring(0, repo.fullName.lastIndexOf('/'))}</span>
                  <strong>{repo.name}</strong>
                </Button>
                <IconButton
                  icon={<Star size={15} fill={pinned ? 'currentColor' : 'none'} />}
                  aria-label={pinned ? tr('Pin entfernen', 'Unpin repository') : tr('Repository anpinnen', 'Pin repository')}
                  aria-pressed={pinned}
                  onClick={() => togglePin(repo)}
                />
              </div>
              <div className="hosting-repo-card__meta">
                <StatusBadge icon={repo.private ? <Lock size={12} /> : <Globe size={12} />}>
                  {repo.private ? tr('Privat', 'Private') : tr('Öffentlich', 'Public')}
                </StatusBadge>
                <StatusBadge tone="accent">{connection ? providerLabels[connection.provider] : 'Hosting'}</StatusBadge>
                <span className="hosting-repo-card__account" title={connection?.baseUrl}>
                  {connection?.label}
                </span>
              </div>
              <p className="hosting-repo-card__description">{repo.description || tr('Keine Beschreibung vorhanden.', 'No description available.')}</p>
              <div className="hosting-repo-card__branch">
                <GitBranch size={12} aria-hidden="true" />
                {repo.defaultBranch}
                <span>{paths.length ? tr('Lokal vorhanden', 'Available locally') : tr('Nur Remote', 'Remote only')}</span>
              </div>
              {paths.length > 0 && (
                <div className="hosting-local-clones">
                  {paths.map((path) => (
                    <Button
                      variant="ghost"
                      className="hosting-local-clone"
                      key={path}
                      disabled={task.busy}
                      icon={<FolderGit2 size={13} />}
                      title={path}
                      onClick={() => activateLocal(path)}
                    >
                      {tr('Lokalen Klon öffnen', 'Open local clone')} · {path}
                    </Button>
                  ))}
                </div>
              )}
              <div className="hosting-repo-card__actions">
                <Button onClick={() => state.select(repo)}>{tr('Öffnen', 'Open')}</Button>
                <Button variant="ghost" icon={<Download size={14} />} disabled={task.busy} onClick={() => clone(repo)}>
                  {tr('Klonen', 'Clone')}
                </Button>
                {repo.sshUrl && (
                  <Button variant="ghost" disabled={task.busy} onClick={() => clone(repo, true)}>
                    SSH
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!repositories.length && !task.busy && (
        <div className="hosting-empty">
          <FolderGit2 size={30} aria-hidden="true" />
          <h3>{tr('Keine passenden Repositories', 'No matching repositories')}</h3>
          <p>{tr('Verbinde ein Konto oder passe die Filter an.', 'Connect an account or adjust the filters.')}</p>
          <Button onClick={() => state.navigate('connections')}>{tr('Konten & Server', 'Accounts & servers')}</Button>
        </div>
      )}
      <div className="hosting-actions">
        {Object.entries(catalog.pages)
          .filter(([, page]) => page.nextCursor)
          .map(([id, page]) => (
            <Button key={id} disabled={task.busy} onClick={() => loadMore(id, page.nextCursor!)}>
              {tr('Weitere laden', 'Load more')} · {connections.find((c) => c.id === id)?.label}
            </Button>
          ))}
      </div>
    </>
  );
}
