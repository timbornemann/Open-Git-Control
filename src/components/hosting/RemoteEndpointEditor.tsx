import { useEffect, useRef, useState } from 'react';
import { Check, Network, Pencil, Plus, Trash2, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useI18n } from '@/i18n';
import { getRemoteTransferDefaults } from '@/utils/remoteTransferSelection';
import type { GitRemoteDto, GitRemoteSnapshotDto, RemotePreferences } from '@/types/remoteTransfers';
import type { HostingConnection } from '@/types/hostingDtos';
import type { transferClient } from '@/services/hostingClient';
import type { useHostingTask } from './useHostingTask';
import { RemoteEndpointAuthentication } from './RemoteEndpointAuthentication';
import { RemoteAddressEditor } from './RemoteAddressEditor';
import { remoteConfigurationPushTargets } from './remoteConfigurationValidation';

type Props = {
  repoPath: string;
  addRequest?: number;
  snapshot: GitRemoteSnapshotDto;
  preferences: RemotePreferences;
  connections: HostingConnection[];
  bind: (name: string, endpointUrl: string, connectionId: string, resolutionUrl?: string) => void;
  setCredentialMode: (name: string, endpointUrl: string, mode: 'hosting' | 'system') => void;
  edit: (action: 'remove' | 'rename' | 'set-url', name: string, value?: string) => Promise<GitRemoteSnapshotDto | undefined>;
  request: typeof transferClient.request;
  task: ReturnType<typeof useHostingTask>;
  reload: () => Promise<void>;
  unbind?: (name: string, url: string) => void;
};

const suggestedName = (remotes: GitRemoteDto[]) => {
  const base = remotes.length ? 'backup' : 'origin';
  let name = base;
  for (let suffix = 2; remotes.some((remote) => remote.name === name); suffix++) name = base + suffix;
  return name;
};

export function RemoteEndpointEditor(props: Props) {
  const { snapshot, task, request, repoPath, reload, addRequest, preferences } = props;
  const { tr } = useI18n();
  const [selection, setSelection] = useState<string | null>(() => snapshot.remotes[0]?.name ?? null);
  const [newName, setNewName] = useState(() => suggestedName(snapshot.remotes));
  const [newUrl, setNewUrl] = useState('');
  const [removal, setRemoval] = useState<string | null>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const selected = selection === null ? null : (snapshot.remotes.find((remote) => remote.name === selection) ?? snapshot.remotes[0] ?? null);
  const duplicate = snapshot.remotes.some((remote) => remote.name === newName.trim());
  const fetchSource = getRemoteTransferDefaults('fetch', snapshot, preferences).remote;
  const pullSource = getRemoteTransferDefaults('pull', snapshot, preferences).remote;
  const pushTargets = remoteConfigurationPushTargets(snapshot, preferences);
  const checkKey = (remote: GitRemoteDto) =>
    JSON.stringify([
      remote.name,
      remote.fetchUrls[0],
      preferences.bindings?.find((entry) => entry.remoteName === remote.name && entry.url === remote.fetchUrls[0]),
    ]);
  useEffect(() => {
    if (addRequest) setSelection(null);
  }, [addRequest]);
  useEffect(() => {
    if (selection !== null || !addRequest) return;
    nameField.current?.scrollIntoView?.({ block: 'nearest' });
    nameField.current?.focus({ preventScroll: true });
  }, [selection, addRequest]);
  return (
    <div className="remote-configuration__remote-workspace">
      <nav className="remote-configuration__remote-list" aria-label={tr('Remotes dieses Repositorys', 'Remotes in this repository')}>
        {!snapshot.remotes.length && <p>{tr('Noch kein Remote eingerichtet.', 'No remotes configured yet.')}</p>}
        {snapshot.remotes.map((remote) => (
          <button
            key={remote.name}
            className="ui-button remote-configuration__remote-choice"
            aria-label={tr(`Remote ${remote.name} bearbeiten`, `Edit remote ${remote.name}`)}
            aria-pressed={selected?.name === remote.name}
            disabled={task.busy}
            onClick={() => {
              setSelection(remote.name);
              setRemoval(null);
            }}
          >
            <span>
              <Network size={15} aria-hidden="true" />
              <strong>{remote.name}</strong>
              <Pencil size={12} aria-hidden="true" />
            </span>
            <small title={remote.fetchUrls[0]}>{remote.fetchUrls[0]}</small>
            <span className="remote-configuration__remote-roles">
              {[
                fetchSource === remote.name && 'Fetch',
                pullSource === remote.name && 'Pull',
                pushTargets.includes(remote.name) && 'Push',
                preferences.hostingRemote === remote.name && 'Hosting',
              ]
                .filter(Boolean)
                .join(' · ') || tr('Weitere Verbindung', 'Additional connection')}
            </span>
          </button>
        ))}
      </nav>
      <div className="remote-configuration__remote-detail">
        <div hidden={selected !== null}>
          <h3>{tr('Remote hinzufügen', 'Add remote')}</h3>
          <p>{tr('Verwende die HTTPS- oder SSH-Clone-URL eines vorhandenen Repositorys.', 'Use the HTTPS or SSH clone URL of an existing repository.')}</p>
          <form
            className="remote-configuration__form"
            onSubmit={(event) => {
              event.preventDefault();
              if (task.busy || duplicate || !newName.trim() || !newUrl.trim()) return;
              void task.run(async () => {
                const updated = await request('editRemote', { repoPath, mutation: { action: 'add', name: newName.trim(), url: newUrl.trim() } });
                await reload();
                setNewUrl('');
                setNewName(suggestedName(updated.remotes));
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
                <small>
                  {duplicate
                    ? tr('Dieser Name wird bereits verwendet.', 'This name is already in use.')
                    : tr('Ein Name für diese Verbindung, z. B. origin oder backup.', 'A name for this connection, e.g. origin or backup.')}
                </small>
              </label>
              <label>
                {tr('Git-URL', 'Git URL')}
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
              <Button type="submit" variant="primary" icon={<Plus size={14} />} disabled={task.busy || duplicate || !newName.trim() || !newUrl.trim()}>
                {tr('Remote hinzufügen', 'Add remote')}
              </Button>
              {snapshot.remotes.length > 0 && (
                <Button disabled={task.busy} onClick={() => setSelection(snapshot.remotes[0].name)}>
                  {tr('Abbrechen', 'Cancel')}
                </Button>
              )}
            </div>
            <small>
              {tr(
                'Die Verbindung wird sofort angelegt. Dabei werden keine Dateien übertragen.',
                'The connection is added immediately. No files are transferred.',
              )}
            </small>
          </form>
        </div>
        {snapshot.remotes.map((remote) => (
          <div key={remote.name} hidden={selected?.name !== remote.name}>
            <header className="remote-configuration__remote-heading">
              <h3>{remote.name}</h3>
              <div className="hosting-actions">
                <Button
                  disabled={task.busy || !remote.fetchUrls[0]}
                  icon={checked === checkKey(remote) ? <Check size={14} /> : <Wifi size={14} />}
                  onClick={() => {
                    setChecked(null);
                    void task.run(
                      async () => {
                        const url = remote.fetchUrls[0];
                        const binding = preferences.bindings?.find((entry) => entry.remoteName === remote.name && entry.url === url);
                        return request('checkConnection', {
                          repoPath,
                          remote: remote.name,
                          url,
                          connectionId: binding?.credentialMode === 'system' ? null : binding?.repository?.connectionId,
                        });
                      },
                      () => setChecked(checkKey(remote)),
                    );
                  }}
                >
                  {checked === checkKey(remote) ? tr('Erreichbar', 'Reachable') : tr('Verbindung prüfen', 'Check connection')}
                </Button>
                <Button variant="ghost" icon={<Trash2 size={14} />} disabled={task.busy} onClick={() => setRemoval(remote.name)}>
                  {tr('Verbindung entfernen', 'Remove connection')}
                </Button>
              </div>
            </header>
            {removal === remote.name && (
              <div className="remote-configuration__confirmation" role="group" aria-label={tr('Entfernen bestätigen', 'Confirm removal')}>
                <strong>{tr(`Remote „${remote.name}“ entfernen?`, `Remove remote “${remote.name}”?`)}</strong>
                <p>
                  {tr(
                    'Nur diese lokale Verbindung und ihre Tracking-Verweise werden entfernt. Deine Dateien und das Repository auf dem Server bleiben erhalten.',
                    'Only this local connection and its tracking references are removed. Your files and the repository on the server are retained.',
                  )}
                </p>
                <div className="hosting-actions">
                  <Button
                    variant="danger"
                    disabled={task.busy}
                    onClick={() => {
                      void props.edit('remove', remote.name).then((next) => {
                        if (next) setRemoval(null);
                      });
                    }}
                  >
                    {tr('Remote jetzt entfernen', 'Remove remote now')}
                  </Button>
                  <Button disabled={task.busy} onClick={() => setRemoval(null)}>
                    {tr('Abbrechen', 'Cancel')}
                  </Button>
                </div>
              </div>
            )}
            <RemoteAddressEditor
              key={JSON.stringify(remote)}
              remote={remote}
              snapshot={snapshot}
              task={task}
              edit={props.edit}
              request={request}
              repoPath={repoPath}
              reload={reload}
              onRenamed={setSelection}
            />
            <RemoteEndpointAuthentication
              remote={remote}
              preferences={preferences}
              connections={props.connections}
              disabled={task.busy}
              bind={props.bind}
              setCredentialMode={props.setCredentialMode}
              unbind={props.unbind}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
