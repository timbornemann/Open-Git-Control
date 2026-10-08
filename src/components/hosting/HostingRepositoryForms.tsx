import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ActionRequirement } from '@/components/ui/ActionRequirement';
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
  const accountField = useRef<HTMLSelectElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const urlField = useRef<HTMLInputElement>(null);
  const targetFields = useRef<HTMLDivElement>(null);
  const hasAccounts = state.connections.some((account) => account.authenticated);
  const missingField = !connection
    ? 'account'
    : mode === 'url'
      ? !repositoryUrl.trim()
        ? 'url'
        : null
      : !name.trim()
        ? 'name'
        : !namespace
          ? 'namespace'
          : connection.provider === 'bitbucket-cloud' && !projectKey
            ? 'project'
            : null;
  const requirement =
    missingField === 'account'
      ? hasAccounts
        ? tr('Wähle zuerst ein angemeldetes Konto.', 'Choose a signed-in account first.')
        : tr('Verbinde zuerst ein Hosting-Konto.', 'Connect a hosting account first.')
      : missingField === 'url'
        ? tr('Gib die Repository-URL ein.', 'Enter the repository URL.')
        : missingField === 'name'
          ? tr('Gib einen Repository-Namen ein.', 'Enter a repository name.')
          : missingField === 'namespace'
            ? tr(
                'Wähle das Konto, die Organisation, den Namespace oder Workspace für die Erstellung.',
                'Choose the account, organization, namespace or workspace for creation.',
              )
            : missingField === 'project'
              ? tr('Wähle ausdrücklich ein Bitbucket-Projekt.', 'Select a Bitbucket project explicitly.')
              : null;
  const remedy = {
    label: missingField === 'account' && !hasAccounts ? tr('Konto verbinden', 'Connect account') : tr('Angabe ergänzen', 'Complete field'),
    onClick: () => {
      if (missingField === 'account' && !hasAccounts) {
        onClose();
        state.navigate('connections');
      } else if (missingField === 'account') accountField.current?.focus();
      else if (missingField === 'name') nameField.current?.focus();
      else if (missingField === 'url') urlField.current?.focus();
      else targetFields.current?.querySelector<HTMLElement>(`[data-creation-field="${missingField}"]`)?.focus();
    },
  };
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
          <select ref={accountField} required value={connectionId} onChange={(event) => setConnectionId(event.target.value)} disabled={task.busy}>
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
                ref={urlField}
                required
                value={repositoryUrl}
                onChange={(event) => setRepositoryUrl(event.target.value)}
                placeholder="https://git.example.com/team/project"
              />
            </label>
            <ActionRequirement reason={!task.busy ? requirement : null} remedy={remedy}>
              <Button type="submit" variant="primary" disabled={task.busy || Boolean(missingField)}>
                {tr('Repository öffnen', 'Open repository')}
              </Button>
            </ActionRequirement>
          </>
        ) : (
          <>
            <label>
              {tr('Name', 'Name')}
              <TextField ref={nameField} required value={name} onChange={(event) => setName(event.target.value)} placeholder="my-project" />
            </label>
            <div ref={targetFields}>
              <RepositoryCreationTarget
                connection={connection}
                creation={{ connectionId, name, namespace, projectKey, private: isPrivate }}
                onChange={(value) => {
                  setNamespace(value.namespace || '');
                  setProjectKey(value.projectKey);
                }}
                disabled={task.busy}
              />
            </div>
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
            <ActionRequirement reason={!task.busy ? requirement : null} remedy={remedy}>
              <Button type="submit" variant="primary" icon={<Plus size={14} />} disabled={task.busy || Boolean(missingField)}>
                {tr('Repository erstellen', 'Create repository')}
              </Button>
            </ActionRequirement>
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
