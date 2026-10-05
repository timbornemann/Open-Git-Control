import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useGitStore } from '@/contexts/AppStateContext';
import { hostingClient, transferClient } from '@/services/hostingClient';
import { useI18n } from '@/i18n';
import { useHostingState } from './hostingState';
import { useHostingTask } from './useHostingTask';
import { HostingDialog } from './HostingDialog';

export type HostingRepositoryFormMode = 'url' | 'create' | null;
export function HostingRepositoryForms({ mode, onClose }: { mode: HostingRepositoryFormMode; onClose: () => void }) {
  const { tr } = useI18n();
  const state = useHostingState();
  const activeRepo = useGitStore((s) => s.activeRepo);
  const [connectionId, setConnectionId] = useState(state.connectionFilter);
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [name, setName] = useState('');
  const [namespace, setNamespace] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setPrivate] = useState(true);
  const [initializeReadme, setInitializeReadme] = useState(true);
  const [remoteName, setRemoteName] = useState('origin');
  const [connect, setConnect] = useState(false);
  const task = useHostingTask(`${connectionId}/${mode}/${activeRepo ?? ''}`);
  const connection = state.connections.find((c) => c.id === connectionId && c.authenticated);
  const create = () =>
    void task.run(
      async () => {
        if (!connection) throw new Error(tr('Zuerst ein Konto auswählen.', 'Select an account first.'));
        const capturedPath = activeRepo;
        const repo = await hostingClient.request('createRepository', {
          connectionId: connection.id,
          namespace: namespace || undefined,
          name,
          description,
          private: isPrivate,
          initializeReadme: connect || connection.provider === 'bitbucket-data-center' ? false : initializeReadme,
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
        onClose();
      },
    );
  const open = () =>
    void task.run(
      async () => {
        if (!connection) throw new Error(tr('Zuerst ein Konto auswählen.', 'Select an account first.'));
        const repo = await hostingClient.request('resolveRepository', { connectionId: connection.id, url: repositoryUrl });
        if (!repo) throw new Error(tr('Die Repository-URL gehört nicht zum gewählten Server.', 'The repository URL does not belong to the selected server.'));
        return repo;
      },
      (repo) => {
        state.select(repo);
        onClose();
      },
    );
  return (
    <HostingDialog
      open={mode !== null}
      title={mode === 'url' ? tr('Repository per URL öffnen', 'Open repository by URL') : tr('Neues Repository', 'New repository')}
      onClose={() => {
        if (!task.busy) onClose();
      }}
    >
      <form
        className="hosting-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!task.busy) {
            if (mode === 'url') open();
            else create();
          }
        }}
      >
        <label>
          {tr('Server und Konto', 'Server and account')}
          <select required value={connectionId} onChange={(event) => setConnectionId(event.target.value)} disabled={task.busy}>
            <option value="">{tr('Konto auswählen', 'Select account')}</option>
            {state.connections
              .filter((c) => c.authenticated)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} · {c.username ?? c.baseUrl}
                </option>
              ))}
          </select>
        </label>
        {mode === 'url' ? (
          <>
            <p className="hosting-help">
              {tr(
                'Öffne auch Repositories außerhalb deines Katalogs. Klonen und Forken sind anschließend auf der Detailseite verfügbar.',
                'Open repositories outside your catalog too. Clone and fork actions are available on the detail page.',
              )}
            </p>
            <label>
              {tr('Repository-URL', 'Repository URL')}
              <TextField
                required
                value={repositoryUrl}
                onChange={(event) => setRepositoryUrl(event.target.value)}
                placeholder="https://git.example.com/team/project"
              />
            </label>
            <Button type="submit" variant="primary" disabled={task.busy || !connection || !repositoryUrl.trim()}>
              {tr('Repository öffnen', 'Open repository')}
            </Button>
          </>
        ) : (
          <>
            <label>
              {tr('Name', 'Name')}
              <TextField required value={name} onChange={(event) => setName(event.target.value)} placeholder="my-project" />
            </label>
            <label>
              {tr('Namespace / Gruppe / Workspace / Projekt', 'Namespace / group / workspace / project')}
              <TextField value={namespace} onChange={(event) => setNamespace(event.target.value)} />
            </label>
            <label>
              {tr('Beschreibung', 'Description')}
              <TextField as="textarea" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <div className="hosting-form-options">
              <label className="hosting-checkbox">
                <input type="checkbox" checked={isPrivate} onChange={(event) => setPrivate(event.target.checked)} />
                {tr('Privat', 'Private')}
              </label>
              {connection?.provider !== 'bitbucket-data-center' && (
                <label className="hosting-checkbox">
                  <input type="checkbox" checked={initializeReadme} onChange={(event) => setInitializeReadme(event.target.checked)} disabled={connect} />
                  README
                </label>
              )}
            </div>
            {activeRepo && (
              <>
                <label className="hosting-checkbox">
                  <input type="checkbox" checked={connect} onChange={(event) => setConnect(event.target.checked)} />
                  {tr('Mit aktivem lokalen Repository verbinden', 'Connect to active local repository')}
                </label>
                {connect && (
                  <label>
                    {tr('Remote-Name', 'Remote name')}
                    <TextField required value={remoteName} onChange={(event) => setRemoteName(event.target.value)} />
                    <small>{activeRepo}</small>
                  </label>
                )}
              </>
            )}
            <Button
              type="submit"
              variant="primary"
              icon={<Plus size={14} />}
              disabled={task.busy || !connection || !name.trim() || (connect && !remoteName.trim())}
            >
              {connect ? tr('Erstellen & verbinden', 'Create & connect') : tr('Repository erstellen', 'Create repository')}
            </Button>
          </>
        )}
        {task.busy && (
          <p className="hosting-notice" role="status">
            {tr('Wird vorbereitet …', 'Preparing …')}
          </p>
        )}
        {task.error && (
          <p className="hosting-error" role="alert">
            {task.error}
          </p>
        )}
      </form>
    </HostingDialog>
  );
}
