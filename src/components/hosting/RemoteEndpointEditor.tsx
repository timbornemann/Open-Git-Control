import { useEffect, useRef, useState } from 'react';
import { Network, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useI18n } from '@/i18n';
import type { GitRemoteDto, GitRemoteSnapshotDto, RemotePreferences } from '@/types/remoteTransfers';
import type { HostingConnection } from '@/types/hostingDtos';
import type { transferClient } from '@/services/hostingClient';
import type { useHostingTask } from './useHostingTask';
import { RemoteEndpointAuthentication } from './RemoteEndpointAuthentication';

type Props = {
  repoPath: string;
  addRequest?: number;
  snapshot: GitRemoteSnapshotDto;
  preferences: RemotePreferences;
  connections: HostingConnection[];
  bind: (name: string, endpointUrl: string, connectionId: string, resolutionUrl?: string) => void;
  setCredentialMode: (name: string, endpointUrl: string, mode: 'hosting' | 'system') => void;
  edit: (action: 'remove' | 'rename' | 'set-url', name: string, value?: string) => void;
  request: typeof transferClient.request;
  task: ReturnType<typeof useHostingTask>;
  reload: () => Promise<void>;
  unbind?: (name: string, url: string) => void;
};

export function RemoteEndpointEditor(props: Props) {
  const { snapshot, task, request, repoPath, reload, addRequest } = props;
  const { tr } = useI18n();
  const suggestedName = (remotes: GitRemoteDto[]) => {
    const base = remotes.length ? 'backup' : 'origin';
    let name = base;
    for (let suffix = 2; remotes.some((remote) => remote.name === name); suffix++) name = base + suffix;
    return name;
  };
  const [newName, setNewName] = useState(() => suggestedName(snapshot.remotes));
  const [newUrl, setNewUrl] = useState('');
  const addForm = useRef<HTMLDetailsElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!addRequest || !addForm.current) return;
    addForm.current.open = true;
    addForm.current.scrollIntoView?.({ block: 'nearest' });
    nameField.current?.focus({ preventScroll: true });
  }, [addRequest]);
  return (
    <>
      <div className="remote-configuration__remote-list">
        {snapshot.remotes.map((remote) => (
          <RemoteEndpointRow key={remote.name} {...props} remote={remote} />
        ))}
      </div>
      <details ref={addForm} className="remote-configuration__advanced" open={snapshot.remotes.length === 0 ? true : undefined}>
        <summary>
          <Plus size={14} aria-hidden="true" />
          {tr('Remote hinzufügen', 'Add remote')}
        </summary>
        <p>
          {tr(
            'Kopiere die HTTPS- oder SSH-Clone-URL vom Hosting-Anbieter. Für ein neues Repository verwende „Repository veröffentlichen“.',
            'Copy the HTTPS or SSH clone URL from your hosting provider. For a new repository, use Publish repository.',
          )}
        </p>
        <form
          className="remote-configuration__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (task.busy || !newName.trim() || !newUrl.trim()) return;
            void task.run(async () => {
              const updated = await request('editRemote', { repoPath, mutation: { action: 'add', name: newName.trim(), url: newUrl.trim() } });
              setNewUrl('');
              setNewName(suggestedName(updated.remotes));
              await reload();
            });
          }}
        >
          <div className="remote-configuration__fields">
            <label>
              {tr('Remote-Name', 'Remote name')}
              <TextField
                ref={nameField}
                aria-label={tr('Name des neuen Remotes', 'New remote name')}
                required
                value={newName}
                disabled={task.busy}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="origin"
              />
              <small>{tr('Ein lokaler Name, zum Beispiel origin oder backup.', 'A local name, for example origin or backup.')}</small>
            </label>
            <label>
              {tr('Git-URL des vorhandenen Repositorys', 'Git URL of the existing repository')}
              <TextField
                required
                aria-label={tr('Adresse des neuen Remotes', 'New remote URL')}
                value={newUrl}
                disabled={task.busy}
                onChange={(event) => setNewUrl(event.target.value)}
                placeholder="https://server/team/repository.git"
              />
            </label>
          </div>
          <div className="hosting-actions">
            <Button type="submit" icon={<Plus size={14} />} disabled={task.busy || !newName.trim() || !newUrl.trim()}>
              {tr('Remote hinzufügen', 'Add remote')}
            </Button>
            <small>
              {tr(
                'Legt die Verbindung sofort an. Dateien werden erst bei einem Transfer übertragen.',
                'Adds the connection immediately. Files are only transferred when you start a transfer.',
              )}
            </small>
          </div>
        </form>
      </details>
    </>
  );
}

function RemoteEndpointRow({ remote, ...props }: Props & { remote: GitRemoteDto }) {
  const { tr } = useI18n();
  const { task, edit, repoPath, request, reload, preferences } = props;
  const [name, setName] = useState(remote.name);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  return (
    <article className="remote-configuration__remote">
      <header className="remote-configuration__remote-heading">
        <h3>
          <Network size={16} aria-hidden="true" />
          {remote.name}
        </h3>
        <small>
          {preferences.hostingRemote === remote.name
            ? tr('Für PRs, CI und Releases ausgewählt', 'Selected for PRs, CI and releases')
            : tr('Git-Verbindung', 'Git connection')}
        </small>
      </header>
      <RemoteFetchUrlEditor key={JSON.stringify(remote.fetchUrls)} remote={remote} busy={task.busy} edit={edit} />
      <dl className="remote-configuration__urls">
        {remote.fetchUrls.length > 1 && (
          <div>
            <dt>{tr('Weitere Fetch-URLs', 'Additional fetch URLs')}</dt>
            <dd>{remote.fetchUrls.slice(1).join('\n')}</dd>
          </div>
        )}
        <div>
          <dt>{tr('Push', 'Push')}</dt>
          <dd>{remote.pushUrls.join('\n')}</dd>
        </div>
      </dl>
      <details className="remote-configuration__advanced">
        <summary>{tr('Weitere Remote-Einstellungen', 'More remote settings')}</summary>
        <p>
          {tr(
            'Diese Aktionen ändern die Git-Verbindung sofort. Bereits hochgeladene Repositorys bleiben bestehen.',
            'These actions change the Git connection immediately. Repositories already uploaded remain on the server.',
          )}
        </p>
        <div className="remote-configuration__fields">
          <form
            className="remote-configuration__form"
            onSubmit={(event) => {
              event.preventDefault();
              edit('rename', remote.name, name.trim());
            }}
          >
            <label>
              {tr('Remote-Name', 'Remote name')}
              <TextField
                required
                aria-label={tr('Name für ', 'Name for ') + remote.name}
                value={name}
                disabled={task.busy}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <Button type="submit" disabled={task.busy || !name.trim() || name.trim() === remote.name}>
              {tr('Umbenennen', 'Rename')}
            </Button>
          </form>
        </div>
        <form
          className="remote-configuration__form"
          key={remote.pushUrls.join('|')}
          onSubmit={(event) => {
            event.preventDefault();
            const pushUrls = String(new FormData(event.currentTarget).get('pushUrls') ?? '')
              .split(/\r?\n/)
              .map((url) => url.trim())
              .filter(Boolean);
            void task.run(async () => {
              await request('editRemote', { repoPath, mutation: { action: 'set-url', name: remote.name, pushUrls } });
              await reload();
            });
          }}
        >
          <label>
            {tr('Push-URLs', 'Push URLs')}
            <TextField
              as="textarea"
              aria-label={tr('Push-URLs für ', 'Push URLs for ') + remote.name}
              name="pushUrls"
              defaultValue={remote.pushUrls.join('\n')}
              rows={2}
              disabled={task.busy}
            />
            <small>
              {tr(
                'Eine URL pro Zeile. Leer nutzt die Fetch-URL. Mehrere URLs erhalten alle denselben Push.',
                'One URL per line. Leave empty to use the fetch URL. All listed URLs receive the same push.',
              )}
            </small>
          </label>
          <Button type="submit" disabled={task.busy}>
            {tr('Push-URLs übernehmen', 'Apply push URLs')}
          </Button>
        </form>
        <div className="hosting-actions">
          <Button variant="danger" disabled={task.busy} onClick={() => setConfirmRemoval(true)}>
            {tr('Verbindung entfernen', 'Remove connection')}
          </Button>
          <small>
            {tr('Entfernt nur das lokale Remote, nicht das Repository auf dem Server.', 'Removes only the local remote, not the repository on the server.')}
          </small>
        </div>
        {confirmRemoval && (
          <div className="remote-configuration__upstream" role="group" aria-label={tr('Entfernen bestätigen', 'Confirm removal')}>
            <p>
              {tr(
                `Verbindung „${remote.name}“ wirklich entfernen? Die lokalen Dateien und das Repository auf dem Server bleiben erhalten. Auswahlregeln mit diesem Remote müssen anschließend geprüft werden.`,
                `Remove the “${remote.name}” connection? Local files and the repository on the server are retained. Selection rules using this remote need to be reviewed afterwards.`,
              )}
            </p>
            <div className="hosting-actions">
              <Button
                variant="danger"
                disabled={task.busy}
                onClick={() => {
                  setConfirmRemoval(false);
                  edit('remove', remote.name);
                }}
              >
                {tr('Remote jetzt entfernen', 'Remove remote now')}
              </Button>
              <Button disabled={task.busy} onClick={() => setConfirmRemoval(false)}>
                {tr('Abbrechen', 'Cancel')}
              </Button>
            </div>
          </div>
        )}
      </details>
      <RemoteEndpointAuthentication
        remote={remote}
        preferences={preferences}
        connections={props.connections}
        disabled={task.busy}
        bind={props.bind}
        setCredentialMode={props.setCredentialMode}
        unbind={props.unbind}
      />
    </article>
  );
}

function RemoteFetchUrlEditor({ remote, busy, edit }: { remote: GitRemoteDto; busy: boolean; edit: Props['edit'] }) {
  const { tr } = useI18n();
  const original = remote.fetchUrls[0] ?? '';
  const [value, setValue] = useState(original);
  const changed = Boolean(value.trim() && value.trim() !== original);
  return (
    <form
      className="remote-configuration__form"
      aria-label={tr('Adresse für ', 'Address for ') + remote.name}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && changed) edit('set-url', remote.name, value.trim());
      }}
    >
      <label>
        {tr('Remote-Adresse (Fetch & Pull)', 'Remote URL (fetch & pull)')}
        <TextField
          required
          aria-label={tr('Fetch-URL für ', 'Fetch URL for ') + remote.name}
          value={value}
          disabled={busy}
          onChange={(event) => setValue(event.target.value)}
        />
        <small>
          {tr(
            'Push nutzt diese Adresse, sofern keine eigenen Push-Adressen eingerichtet sind.',
            'Push uses this address unless separate push URLs are configured.',
          )}
        </small>
      </label>
      <Button type="submit" disabled={busy || !changed}>
        {tr('Adresse übernehmen', 'Apply URL')}
      </Button>
    </form>
  );
}
