import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useGitStore, useUIStore } from '@/contexts/AppStateContext';
import { hostingClient } from '@/services/hostingClient';
import { useI18n } from '@/i18n';
import { useHostingState } from './hostingState';
import { useHostingTask } from './useHostingTask';
import { HostingDialog } from './HostingDialog';
import { RepositoryCreationTarget } from '@/components/repository-publication/RepositoryCreationTarget';

export type HostingRepositoryFormMode = 'url' | 'create' | null;
export function HostingRepositoryForms({ mode, onClose }: { mode: HostingRepositoryFormMode; onClose: () => void }) {
  const { tr } = useI18n();
  const state = useHostingState();
  const activeRepo = useGitStore((s) => s.activeRepo);
  const onPublish = useUIStore((s) => s.onOpenRepositoryPublication);
  const [connectionId, setConnectionId] = useState(state.connectionFilter);
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [name, setName] = useState('');
  const [namespace, setNamespace] = useState('');
  const [projectKey, setProjectKey] = useState<string | undefined>();
  const [description, setDescription] = useState('');
  const [isPrivate, setPrivate] = useState(true);
  const [initializeReadme, setInitializeReadme] = useState(true);
  const task = useHostingTask(`${connectionId}/${mode}/${activeRepo ?? ''}`);
  const connection = state.connections.find((c) => c.id === connectionId && c.authenticated);
  const create = () =>
    void task.run(
      async () => {
        if (!connection) throw new Error(tr('Zuerst ein Konto auswählen.', 'Select an account first.'));
        await hostingClient.request('verifyCreationTarget', {
          connectionId: connection.id,
          namespace: namespace || undefined,
          projectKey,
          name,
          private: isPrivate,
        });
        const repo = await hostingClient.request('createRepository', {
          connectionId: connection.id,
          namespace: namespace || undefined,
          projectKey,
          name,
          description,
          private: isPrivate,
          initializeReadme: connection.provider === 'bitbucket-data-center' ? false : initializeReadme,
        });
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
            <RepositoryCreationTarget
              connection={connection}
              creation={{ connectionId, name, namespace, projectKey, private: isPrivate }}
              onChange={(value) => {
                setNamespace(value.namespace || '');
                setProjectKey(value.projectKey);
              }}
              disabled={task.busy}
            />
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
                  <input type="checkbox" checked={initializeReadme} onChange={(event) => setInitializeReadme(event.target.checked)} />
                  README
                </label>
              )}
            </div>
            {activeRepo && (
              <Button
                disabled={task.busy}
                onClick={() => {
                  onClose();
                  onPublish?.(connectionId || undefined);
                }}
              >
                {tr('Lokales Repository veröffentlichen …', 'Publish local repository …')}
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              icon={<Plus size={14} />}
              disabled={task.busy || !connection || !name.trim() || !namespace || (connection.provider === 'bitbucket-cloud' && !projectKey)}
            >
              {tr('Repository erstellen', 'Create repository')}
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
