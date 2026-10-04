import { useEffect, useRef, useState } from 'react';
import { hostingClient, transferClient } from '@/services/hostingClient';
import { appClient } from '@/services/appClient';
import { useGitStore, useUIStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type { HostedRepository, HostingPage, HostingProvider } from '@/types/hostingDtos';
import { HostingConnections } from './HostingConnections';
import { HostingRepositoryDetail } from './HostingRepositoryDetail';
import { RemoteTransferPanel } from './RemoteTransferPanel';
import { hostedRepositoryKey, providerLabels, useHostingState } from './hostingState';
import { useHostingTask } from './useHostingTask';
import './hosting.css';
import { migrateHostingPins, readHostingPins, writeHostingPins } from './hostingPinStore';
import { localRepositoryKey, useLocalHostingRepositories } from './useLocalHostingRepositories';
import { useHostingConnections } from './useHostingConnections';

export function HostingWorkspace() {
  useHostingConnections();
  const { tr } = useI18n();
  const state = useHostingState();
  const { setConnections, connections, connectionFilter, revision } = state;
  const activeRepo = useGitStore((s) => s.activeRepo);
  const openRepos = useGitStore((s) => s.openRepos);
  const onSwitchRepo = useGitStore((s) => s.onSwitchRepo);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const clones = useLocalHostingRepositories(openRepos, connections, revision);
  const onOpenRepo = useGitStore((s) => s.onAddRepo);
  const task = useHostingTask(`${state.connectionFilter}/${state.revision}/${activeRepo ?? ''}`);
  const { run, setError } = task;
  const [pages, setPages] = useState<Record<string, HostingPage<HostedRepository>>>({});
  const [providerFilter, setProviderFilter] = useState<HostingProvider | ''>('');
  const [search, setSearch] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [name, setName] = useState('');
  const [namespace, setNamespace] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setPrivate] = useState(true);
  const [initializeReadme, setInitializeReadme] = useState(true);
  const [remoteName, setRemoteName] = useState('origin');
  const [pins, setPins] = useState(readHostingPins);
  const lifecycle = useRef({ generation: 0 }).current;
  useEffect(() => {
    let active = true;
    void hostingClient
      .request('connections', undefined)
      .then((next) => {
        if (active) setConnections(next);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, [revision, setConnections, setError]);
  useEffect(() => {
    const current = ++lifecycle.generation;
    const selectedConnections = connections.filter((c) => (c.authenticated || c.hasCredentials) && (!connectionFilter || c.id === connectionFilter));
    if (!selectedConnections.length) {
      setPages({});
      return;
    }
    void run(async () => {
      const results = await Promise.allSettled(selectedConnections.map((c) => hostingClient.request('repositories', { connectionId: c.id })));
      if (current !== lifecycle.generation) return;
      const next: Record<string, HostingPage<HostedRepository>> = {};
      const errors: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') next[selectedConnections[index].id] = result.value;
        else errors.push(`${selectedConnections[index].label}: ${String(result.reason)}`);
      });
      setPages(next);
      setPins(
        migrateHostingPins(
          connections,
          Object.values(next).flatMap((page) => page.items),
        ),
      );
      if (errors.length) setError(errors.join('\n'));
    });
    return () => {
      lifecycle.generation++;
    };
  }, [connections, connectionFilter, revision, lifecycle, run, setError]);
  const filtered = Object.values(pages)
    .flatMap((page) => page.items)
    .filter((repo) => {
      const connection = state.connections.find((c) => c.id === repo.ref.connectionId);
      return (
        Boolean(connection && (connection.authenticated || connection.hasCredentials)) &&
        (!providerFilter || connection?.provider === providerFilter) &&
        `${repo.fullName} ${repo.description ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())
      );
    })
    .sort((a, b) => Number(pins.includes(hostedRepositoryKey(b))) - Number(pins.includes(hostedRepositoryKey(a))) || a.fullName.localeCompare(b.fullName));
  const togglePin = (repo: HostedRepository) => {
    const key = hostedRepositoryKey(repo);
    const next = pins.includes(key) ? pins.filter((p) => p !== key) : [...pins, key];
    setPins(next);
    writeHostingPins(next);
  };
  const clone = (repo: HostedRepository, useSsh = false) =>
    void task.run(
      async () => {
        const parent = await appClient.selectProjectParentDirectory();
        if (!parent) return;
        const result = await hostingClient.request('clone', { repository: repo.ref, targetDir: parent, targetName: repo.name, useSsh });
        return result;
      },
      (result) => {
        if (result)
          void onOpenRepo(result.path)
            .then((opened) => {
              if (opened) setActiveTab('repo');
            })
            .catch((error: Error) => setError(error.message));
      },
    );
  const creationConnection = state.connections.find((c) => c.id === state.connectionFilter && c.authenticated);
  const create = (connect: boolean) =>
    void task.run(
      async () => {
        if (!creationConnection) throw new Error(tr('Zuerst ein Konto auswählen.', 'Select an account first.'));
        const capturedPath = activeRepo;
        const repo = await hostingClient.request('createRepository', {
          connectionId: creationConnection.id,
          namespace: namespace || undefined,
          name,
          description,
          private: isPrivate,
          initializeReadme: connect || creationConnection.provider === 'bitbucket-data-center' ? false : initializeReadme,
        });
        if (connect && capturedPath) {
          await transferClient.request('editRemote', { repoPath: capturedPath, mutation: { action: 'add', name: remoteName, url: repo.cloneUrl } });
          const preferences = await transferClient.request('getPreferences', { repoPath: capturedPath });
          await transferClient.request('setPreferences', {
            repoPath: capturedPath,
            preferences: {
              ...preferences,
              hostingRemote: remoteName,
              hostingRepository: repo.ref,
              bindings: [...(preferences.bindings ?? []).filter((b) => b.remoteName !== remoteName), { remoteName, url: repo.cloneUrl, repository: repo.ref }],
            },
          });
        }
        return repo;
      },
      (repo) => {
        state.refresh();
        state.select(repo);
      },
    );
  return (
    <div className="hosting-workspace">
      <header className="hosting-heading">
        <div>
          <h1>Hosting</h1>
          <p>{tr('Repositories über alle Konten und Server verwalten.', 'Manage repositories across your accounts and servers.')}</p>
        </div>
        <button onClick={state.refresh} disabled={task.busy}>
          {tr('Aktualisieren', 'Refresh')}
        </button>
      </header>
      <nav className="hosting-tabs">
        <button aria-pressed={state.section !== 'connections' && state.section !== 'remotes'} onClick={() => state.navigate('repositories')}>
          {tr('Repositories', 'Repositories')}
        </button>
        <button aria-pressed={state.section === 'connections'} onClick={() => state.navigate('connections')}>
          {tr('Konten & Server', 'Accounts & servers')}
        </button>
        {activeRepo && (
          <button aria-pressed={state.section === 'remotes'} onClick={() => state.navigate('remotes')}>
            {tr('Remotes & Übertragungen', 'Remotes & transfers')}
          </button>
        )}
      </nav>
      {state.section === 'connections' ? (
        <HostingConnections />
      ) : state.section === 'remotes' && activeRepo ? (
        <RemoteTransferPanel key={activeRepo} repoPath={activeRepo} mode="remotes" />
      ) : (
        <>
          <div className="hosting-filters">
            <input
              aria-label={tr('Repositories suchen', 'Search repositories')}
              placeholder={tr('Repositories suchen …', 'Search repositories …')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              aria-label={tr('Anbieter filtern', 'Filter provider')}
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value as HostingProvider | '')}
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
              {state.connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} · {c.username ?? c.baseUrl}
                </option>
              ))}
            </select>
          </div>
          <details className="hosting-card">
            <summary>{tr('Repository per URL öffnen oder forken', 'Open or fork a repository by URL')}</summary>
            <form
              className="hosting-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!creationConnection) return;
                void task.run(async () => {
                  const resolved = await hostingClient.request('resolveRepository', { connectionId: creationConnection.id, url: repositoryUrl });
                  if (!resolved)
                    throw new Error(tr('Die Repository-URL gehört nicht zum gewählten Server.', 'The repository URL does not belong to the selected server.'));
                  return resolved;
                }, state.select);
              }}
            >
              <label>
                {tr('Repository-URL', 'Repository URL')}
                <input required value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} />
              </label>
              <p>
                {tr(
                  'Server und Konto im Filter auswählen. Auch Repositories außerhalb deines Katalogs lassen sich öffnen, klonen und forken.',
                  'Select the server and account in the filter. Repositories outside your catalog can also be opened, cloned and forked.',
                )}
              </p>
              <button disabled={task.busy || !creationConnection}>{tr('Repository öffnen', 'Open repository')}</button>
            </form>
          </details>
          {!state.connections.some((c) => c.authenticated) && (
            <div className="hosting-empty">
              <p>{tr('Verbinde ein Konto, um Repositories, PRs und CI zu verwenden.', 'Connect an account to use repositories, change requests and CI.')}</p>
              <button onClick={() => state.navigate('connections')}>{tr('Konto verbinden', 'Connect account')}</button>
            </div>
          )}
          <div className="hosting-content">
            <div className="hosting-catalog">
              {filtered.map((repo) => {
                const connection = state.connections.find((c) => c.id === repo.ref.connectionId);
                return (
                  <article
                    className={`hosting-card ${state.selected && hostedRepositoryKey(state.selected) === hostedRepositoryKey(repo) ? 'selected' : ''}`}
                    key={hostedRepositoryKey(repo)}
                  >
                    <button className="hosting-repository-title" onClick={() => state.select(repo)}>
                      {repo.fullName}
                    </button>
                    <small>
                      {connection?.label} · {repo.private ? tr('Privat', 'Private') : tr('Öffentlich', 'Public')}
                    </small>
                    <p>{repo.description}</p>
                    {clones[localRepositoryKey(repo.ref)]?.map((path) => (
                      <button
                        key={path}
                        disabled={task.busy}
                        onClick={() =>
                          void task.run(
                            () => onSwitchRepo(path),
                            (opened) => {
                              if (opened) setActiveTab('repo');
                            },
                          )
                        }
                      >
                        {tr('Lokalen Klon öffnen', 'Open local clone')} · {path}
                      </button>
                    ))}
                    <div className="hosting-actions">
                      <button onClick={() => state.select(repo)}>{tr('Öffnen', 'Open')}</button>
                      <button disabled={task.busy} onClick={() => clone(repo)}>
                        {tr('Klonen', 'Clone')}
                      </button>
                      {repo.sshUrl && (
                        <button disabled={task.busy} onClick={() => clone(repo, true)}>
                          SSH
                        </button>
                      )}
                      <button aria-pressed={pins.includes(hostedRepositoryKey(repo))} onClick={() => togglePin(repo)}>
                        {pins.includes(hostedRepositoryKey(repo)) ? '★' : '☆'}
                      </button>
                    </div>
                  </article>
                );
              })}
              {Object.entries(pages)
                .filter(([, page]) => page.nextCursor)
                .map(([id, page]) => (
                  <button
                    key={id}
                    disabled={task.busy}
                    onClick={() =>
                      void task.run(
                        () => hostingClient.request('repositories', { connectionId: id, cursor: page.nextCursor! }),
                        (next) => {
                          setPages((current) => ({ ...current, [id]: { ...next, items: [...current[id].items, ...next.items] } }));
                          setPins(migrateHostingPins(state.connections, next.items));
                        },
                      )
                    }
                  >
                    {tr('Weitere laden', 'Load more')} · {state.connections.find((c) => c.id === id)?.label}
                  </button>
                ))}
              {Object.values(pages).some((page) => page.stale) && (
                <p role="status">{tr('Gespeicherter Katalog · Server derzeit nicht erreichbar', 'Saved catalog · server currently unavailable')}</p>
              )}
              <details className="hosting-card">
                <summary>{tr('Repository erstellen oder lokal verbinden', 'Create repository or connect local repository')}</summary>
                <form
                  className="hosting-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    create(false);
                  }}
                >
                  <p>{creationConnection ? creationConnection.label : tr('Oben ein bestimmtes Konto auswählen.', 'Select a specific account above.')}</p>
                  <label>
                    {tr('Name', 'Name')}
                    <input required value={name} onChange={(event) => setName(event.target.value)} />
                  </label>
                  <label>
                    {tr('Namespace / Gruppe / Workspace / Projekt', 'Namespace / group / workspace / project')}
                    <input value={namespace} onChange={(event) => setNamespace(event.target.value)} />
                  </label>
                  <label>
                    {tr('Beschreibung', 'Description')}
                    <input value={description} onChange={(event) => setDescription(event.target.value)} />
                  </label>
                  <label className="hosting-checkbox">
                    <input type="checkbox" checked={isPrivate} onChange={(event) => setPrivate(event.target.checked)} />
                    {tr('Privat', 'Private')}
                  </label>
                  {creationConnection?.provider !== 'bitbucket-data-center' && (
                    <label className="hosting-checkbox">
                      <input type="checkbox" checked={initializeReadme} onChange={(event) => setInitializeReadme(event.target.checked)} />
                      README
                    </label>
                  )}
                  <button disabled={task.busy || !creationConnection}>{tr('Erstellen', 'Create')}</button>
                  {activeRepo && (
                    <>
                      <label>
                        {tr('Remote-Name zum Verbinden', 'Remote name to connect')}
                        <input value={remoteName} onChange={(event) => setRemoteName(event.target.value)} />
                      </label>
                      <button type="button" disabled={task.busy || !creationConnection || !remoteName} onClick={() => create(true)}>
                        {tr('Erstellen & aktives Repository verbinden', 'Create & connect active repository')}
                      </button>
                    </>
                  )}
                </form>
              </details>
            </div>
            {state.selected && (
              <HostingRepositoryDetail key={hostedRepositoryKey(state.selected)} repository={state.selected} cloneBusy={task.busy} onClone={clone} />
            )}
          </div>
        </>
      )}
      {task.busy && <p role="status">{tr('Laden …', 'Loading …')}</p>}
      {task.error && (
        <p className="hosting-error" role="alert">
          {task.error}
        </p>
      )}
    </div>
  );
}
