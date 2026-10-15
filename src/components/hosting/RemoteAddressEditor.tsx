import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useI18n } from '@/i18n';
import type { GitRemoteDto, GitRemoteSnapshotDto } from '@/types/remoteTransfers';
import type { transferClient } from '@/services/hostingClient';
import type { useHostingTask } from './useHostingTask';

type Props = {
  remote: GitRemoteDto;
  snapshot: GitRemoteSnapshotDto;
  task: ReturnType<typeof useHostingTask>;
  edit: (action: 'remove' | 'rename' | 'set-url', name: string, value?: string) => Promise<GitRemoteSnapshotDto | undefined>;
  request: typeof transferClient.request;
  repoPath: string;
  reload: () => Promise<void>;
  onRenamed: (name: string) => void;
};

export function RemoteAddressEditor({ remote, snapshot, task, edit, request, repoPath, reload, onRenamed }: Props) {
  const { tr } = useI18n();
  const [name, setName] = useState(remote.name);
  const originalUrl = remote.fetchUrls[0] ?? '';
  const originalPush = remote.pushUrls.length === 1 && remote.pushUrls[0] === originalUrl ? '' : remote.pushUrls.join('\n');
  const [url, setUrl] = useState(originalUrl);
  const [push, setPush] = useState(originalPush);
  const changed = Boolean(url.trim()) && (url.trim() !== originalUrl || push !== originalPush);
  const duplicate = name.trim() !== remote.name && snapshot.remotes.some((entry) => entry.name === name.trim());
  return (
    <>
      <form
        className="remote-configuration__rename"
        onSubmit={(event) => {
          event.preventDefault();
          if (task.busy || duplicate || !name.trim() || name.trim() === remote.name) return;
          void edit('rename', remote.name, name.trim()).then((next) => {
            if (next) onRenamed(name.trim());
          });
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
        <Button type="submit" disabled={task.busy || duplicate || !name.trim() || name.trim() === remote.name}>
          {tr('Umbenennen', 'Rename')}
        </Button>
        {duplicate && <small>{tr('Dieser Name wird bereits verwendet.', 'This name is already in use.')}</small>}
      </form>
      <form
        className="remote-configuration__form"
        aria-label={tr('Adressen für ', 'Addresses for ') + remote.name}
        onSubmit={(event) => {
          event.preventDefault();
          if (task.busy || !changed) return;
          if (push === originalPush) {
            void edit('set-url', remote.name, url.trim());
            return;
          }
          const pushUrls = push
            .split(/\r?\n/)
            .map((value) => value.trim())
            .filter(Boolean);
          void task.run(async () => {
            await request('editRemote', {
              repoPath,
              mutation: { action: 'set-url', name: remote.name, ...(url.trim() !== originalUrl ? { url: url.trim() } : {}), pushUrls },
            });
            await reload();
          });
        }}
      >
        <label>
          {tr('Repository-Adresse', 'Repository address')}
          <TextField
            required
            aria-label={tr('Fetch-URL für ', 'Fetch URL for ') + remote.name}
            value={url}
            disabled={task.busy}
            onChange={(event) => setUrl(event.target.value)}
          />
          <small>
            {tr('HTTPS- oder SSH-Clone-URL für Fetch, Pull und standardmäßig auch Push.', 'HTTPS or SSH clone URL for fetch, pull and, by default, push.')}
          </small>
        </label>
        {remote.fetchUrls.length > 1 && (
          <p className="remote-configuration__endpoint-url">
            {tr('Weitere Fetch-Adressen', 'Additional fetch addresses')}: {remote.fetchUrls.slice(1).join(' · ')}
          </p>
        )}
        <label>
          {tr('Abweichende Push-Adressen (optional)', 'Different push addresses (optional)')}
          <TextField
            as="textarea"
            aria-label={tr('Push-URLs für ', 'Push URLs for ') + remote.name}
            value={push}
            rows={2}
            disabled={task.busy}
            placeholder={url}
            onChange={(event) => setPush(event.target.value)}
          />
          <small>
            {tr(
              'Leer lassen, um die Repository-Adresse zu verwenden. Mehrere Adressen: eine pro Zeile.',
              'Leave empty to use the repository address. For multiple addresses, enter one per line.',
            )}
          </small>
        </label>
        <div className="hosting-actions">
          <Button type="submit" disabled={task.busy || !changed}>
            {tr('Adressen übernehmen', 'Apply addresses')}
          </Button>
          <small>
            {tr('Gilt sofort für dieses Repository. Startet keine Übertragung.', 'Applies immediately to this repository. Does not start a transfer.')}
          </small>
        </div>
      </form>
    </>
  );
}
