import { useState, type Dispatch, type SetStateAction } from 'react';
import { useI18n } from '@/i18n';
import type { GitRemoteSnapshotDto, RemotePreferences } from '@/types/remoteTransfers';
import type { HostingConnection } from '@/types/hostingDtos';
import type { transferClient } from '@/services/hostingClient';
import type { useHostingTask } from './useHostingTask';

type Props = {
  repoPath: string;
  snapshot: GitRemoteSnapshotDto;
  preferences: RemotePreferences;
  connections: HostingConnection[];
  bindingConnection: string;
  setBindingConnection: Dispatch<SetStateAction<string>>;
  bind: (name: string, endpointUrl: string, resolutionUrl?: string) => void;
  setCredentialMode: (name: string, endpointUrl: string, mode: 'hosting' | 'system') => void;
  edit: (action: 'remove' | 'rename' | 'set-url', name: string, value?: string) => void;
  request: typeof transferClient.request;
  task: ReturnType<typeof useHostingTask>;
  reload: () => Promise<void>;
  invalidatePlan: () => void;
};
export function RemoteEndpointEditor({
  repoPath,
  snapshot,
  preferences,
  connections,
  bindingConnection,
  setBindingConnection,
  bind,
  setCredentialMode,
  edit,
  request,
  task,
  reload,
  invalidatePlan,
}: Props) {
  const { tr } = useI18n();
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  return (
    <>
      <div className="hosting-card-grid">
        {snapshot.remotes.map((r) => (
          <article className="hosting-card" key={r.name}>
            <h3>{r.name}</h3>
            {r.fetchUrls.map((url) => (
              <small key={url}>Fetch: {url}</small>
            ))}
            {r.pushUrls.map((url) => (
              <small key={url}>Push: {url}</small>
            ))}
            <div className="hosting-actions">
              <button
                onClick={() => {
                  const value = window.prompt(tr('Neuer Remote-Name', 'New remote name'), r.name);
                  if (value) edit('rename', r.name, value);
                }}
              >
                {tr('Umbenennen', 'Rename')}
              </button>
              <button
                onClick={() => {
                  const value = window.prompt('Fetch URL', r.fetchUrls[0]);
                  if (value) edit('set-url', r.name, value);
                }}
              >
                URL
              </button>
              <button onClick={() => edit('remove', r.name)}>{tr('Entfernen', 'Remove')}</button>
            </div>
            <details>
              <summary>{tr('Push-URLs bearbeiten', 'Edit push URLs')}</summary>
              <form
                key={r.pushUrls.join('|')}
                onSubmit={(event) => {
                  event.preventDefault();
                  const pushUrls = String(new FormData(event.currentTarget).get('pushUrls') ?? '')
                    .split(/\r?\n/)
                    .map((url) => url.trim())
                    .filter(Boolean);
                  void task.run(async () => {
                    await request('editRemote', { repoPath, mutation: { action: 'set-url', name: r.name, pushUrls } });
                    invalidatePlan();
                    await reload();
                  });
                }}
              >
                <label>
                  {tr('Eine URL pro Zeile. Leer verwendet die Fetch-URL.', 'One URL per line. Empty uses the fetch URL.')}
                  <textarea name="pushUrls" defaultValue={r.pushUrls.join('\n')} rows={3} />
                </label>
                <button disabled={task.busy}>{tr('Push-URLs speichern', 'Save push URLs')}</button>
              </form>
            </details>
            <label>
              {tr('Hosting-Konto zuordnen', 'Bind hosting account')}
              <select value={bindingConnection} onChange={(event) => setBindingConnection(event.target.value)}>
                <option value="">{tr('Konto auswählen', 'Select account')}</option>
                {connections
                  .filter((c) => c.authenticated)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} · {c.username}
                    </option>
                  ))}
              </select>
            </label>
            {[...new Set([...r.fetchUrls, ...r.pushUrls])].map((endpointUrl) => {
              const binding = preferences.bindings?.find((candidate) => candidate.remoteName === r.name && candidate.url === endpointUrl);
              return (
                <div key={endpointUrl}>
                  <small>{endpointUrl}</small>
                  <small>
                    {preferences.bindings?.find((binding) => binding.remoteName === r.name && binding.url === endpointUrl)?.repository?.connectionId ??
                      tr('Native Git-Anmeldung', 'Native Git authentication')}
                  </small>
                  <label>
                    {tr('Git-Anmeldung für diesen Endpunkt', 'Git authentication for this endpoint')}
                    <select
                      value={binding?.credentialMode ?? (binding?.repository ? 'hosting' : 'system')}
                      disabled={task.busy || !binding?.repository}
                      onChange={(event) => setCredentialMode(r.name, endpointUrl, event.target.value as 'hosting' | 'system')}
                    >
                      <option value="hosting">{tr('Zugeordnetes Hosting-Konto', 'Bound hosting account')}</option>
                      <option value="system">{tr('SSH / gespeicherte Git-Anmeldung', 'SSH / saved Git credentials')}</option>
                    </select>
                  </label>
                  <button
                    disabled={task.busy || !bindingConnection}
                    onClick={() => {
                      const url = window.prompt(
                        tr('Repository-Web-URL zum Auflösen des ausgewählten Endpunkts', 'Repository web URL to resolve the selected endpoint'),
                        endpointUrl,
                      );
                      if (url) bind(r.name, endpointUrl, url);
                    }}
                  >
                    {tr('Konto diesem Endpunkt zuordnen', 'Bind account to this endpoint')}
                  </button>
                </div>
              );
            })}
          </article>
        ))}
      </div>
      <form
        className="hosting-form"
        onSubmit={(event) => {
          event.preventDefault();
          void task.run(async () => {
            await request('editRemote', { repoPath, mutation: { action: 'add', name: newName, url: newUrl } });
            setNewName('');
            setNewUrl('');
            await reload();
          });
        }}
      >
        <h3>{tr('Remote hinzufügen', 'Add remote')}</h3>
        <label>
          {tr('Name', 'Name')}
          <input required value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="forgejo" />
        </label>
        <label>
          URL
          <input required value={newUrl} onChange={(event) => setNewUrl(event.target.value)} placeholder="git@server:namespace/repository.git" />
        </label>
        <button disabled={task.busy}>{tr('Hinzufügen', 'Add')}</button>
      </form>
    </>
  );
}
