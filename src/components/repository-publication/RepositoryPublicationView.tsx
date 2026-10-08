import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, ExternalLink, RefreshCw, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAppToast } from '@/hooks/useAppToast';
import { useI18n } from '@/i18n';
import { hostingClient } from '@/services/hostingClient';
import { appClient } from '@/services/appClient';
import { useHostingConnections } from '@/components/hosting/useHostingConnections';
import { useHostingState } from '@/components/hosting/hostingState';
import type { HostingConnection } from '@/types/hostingDtos';
import type { PublicationContext, PublicationSelection, RepositoryPublication } from '@/types/repositoryPublication';
import { openSystemTools, useGitAvailable } from '@/app/state/systemToolsStore';
import { newPublicationSelection, publicationDraftKey, usePublicationDraftState } from './publicationDraftState';
import { PublicationSetupFields } from './PublicationSetupFields';
import { PublicationSummary } from './PublicationSummary';
import { useRepositoryPublication } from './useRepositoryPublication';
import './repository-publication.css';

export function RepositoryPublicationView({ repoPath, requestedConnectionId }: { repoPath: string | null; requestedConnectionId?: string }) {
  useHostingConnections();
  const { tr } = useI18n(),
    toast = useAppToast();
  const connections = useHostingState((state) => state.connections);
  const gitReady = useGitAvailable();
  const [connectionId, setConnectionId] = useState(requestedConnectionId || '');
  const [loaded, setLoaded] = useState<{ repoPath: string; context: PublicationContext } | null>(null);
  const context = loaded?.repoPath === repoPath ? loaded.context : null;
  const lifecycle = useRef({ generation: 0 }).current;
  const refresh = useCallback(async () => {
    if (!repoPath || !gitReady) return;
    const id = ++lifecycle.generation;
    try {
      const value = await hostingClient.request('publicationContext', { repoPath });
      if (id === lifecycle.generation) setLoaded({ repoPath, context: value });
    } catch (error) {
      if (id === lifecycle.generation) toast(error instanceof Error ? error.message : String(error), true);
    }
  }, [repoPath, toast, gitReady, lifecycle]);
  useEffect(() => {
    void refresh();
    return () => {
      lifecycle.generation++;
    };
  }, [refresh, lifecycle]);
  useEffect(() => {
    if (!connectionId) setConnectionId(connections.find((c) => c.authenticated)?.id || '');
  }, [connectionId, connections]);
  useEffect(() => {
    if (requestedConnectionId) setConnectionId(requestedConnectionId);
  }, [requestedConnectionId]);
  const connection = connections.find((c) => c.id === connectionId && c.authenticated);
  if (!repoPath)
    return (
      <div className="publication-empty">{tr('Öffne zuerst ein bestehendes lokales Git-Repository.', 'Open an existing local Git repository first.')}</div>
    );
  if (!gitReady)
    return (
      <div className="publication-empty">
        <p>{tr('Git muss verfügbar sein, um das lokale Repository zu veröffentlichen.', 'Git must be available to publish the local repository.')}</p>
        <Button onClick={() => openSystemTools('git')}>{tr('Werkzeuge öffnen', 'Open tools')}</Button>
      </div>
    );
  return (
    <div className="repository-publication" aria-label={tr('Repository veröffentlichen', 'Publish repository')}>
      {context ? (
        <PublicationSession
          key={publicationDraftKey(repoPath, connection)}
          repoPath={repoPath}
          connection={connection}
          connections={connections.filter((c) => c.authenticated)}
          chooseAccount={setConnectionId}
          context={context}
          refresh={refresh}
        />
      ) : (
        <div className="publication-empty" role="status">
          {tr('Lokales Repository wird geprüft …', 'Checking local repository …')}
          <Button onClick={() => void refresh()} icon={<RefreshCw size={14} />}>
            {tr('Erneut prüfen', 'Check again')}
          </Button>
        </div>
      )}
    </div>
  );
}

function PublicationSession({
  repoPath,
  connection,
  connections,
  chooseAccount,
  context,
  refresh,
}: {
  repoPath: string;
  connection?: HostingConnection;
  connections: HostingConnection[];
  chooseAccount: (id: string) => void;
  context: PublicationContext;
  refresh: () => Promise<void>;
}) {
  const { tr } = useI18n();
  const key = publicationDraftKey(repoPath, connection);
  const [initial] = useState(() => newPublicationSelection(repoPath, connection, context));
  const selection = usePublicationDraftState((state) => state.drafts[key]) || initial;
  const update = (value: PublicationSelection) => usePublicationDraftState.getState().put(key, value);
  const [step, setStep] = useState(1);
  const scope = JSON.stringify([
    key,
    connection?.userId,
    connection?.username,
    connection?.baseUrl,
    connection?.authenticated,
    hostingClient.sessionVersion(connection?.id),
  ]);
  const workflow = useRepositoryPublication(selection, refresh, scope);
  const record = workflow.record;
  const setRecord = workflow.setRecord;
  useEffect(() => {
    const latest = context.publications.find((entry) => entry.id === record?.id);
    if (latest && record && latest.updatedAt > record.updatedAt) setRecord(latest);
  }, [context.publications, record, setRecord]);
  const created = Boolean(record?.repository),
    complete = record?.stage === 'complete';
  useLayoutEffect(() => {
    if (!usePublicationDraftState.getState().drafts[key]) usePublicationDraftState.getState().put(key, initial);
  }, [key, initial]);
  const resume = (pending: RepositoryPublication) => {
    const branches = pending.branches.length ? pending.selection.branches : newPublicationSelection(repoPath, connection, context).branches;
    update({ ...pending.selection, branches });
    workflow.setRecord(pending);
    setStep(2);
  };
  const review = async () => {
    if (await workflow.review()) setStep(3);
  };
  const newPublication = () => {
    workflow.setRecord(null);
    update(newPublicationSelection(repoPath, connection, context));
    setStep(1);
  };
  const edit = (patch: Partial<PublicationSelection>) => {
    update({ ...selection, ...patch });
  };
  const steps = [tr('Hosting-Ziel', 'Hosting target'), tr('Verbindung & Stand', 'Connection & content'), tr('Veröffentlichen', 'Publish')];
  return (
    <>
      <div className="publication-toolbar">
        <span title={repoPath}>{repoPath}</span>
        <Button size="xs" icon={<RefreshCw size={13} />} disabled={workflow.busy} onClick={() => void refresh()}>
          {tr('Aktualisieren', 'Refresh')}
        </Button>
      </div>
      <nav className="publication-steps" aria-label={tr('Veröffentlichungsschritte', 'Publication steps')}>
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-current={step === index + 1 ? 'step' : undefined}
            disabled={workflow.busy || index + 1 > step || complete}
            onClick={() => setStep(index + 1)}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      <div className="publication-body">
        {!record && context.publications.some((p) => p.stage !== 'complete' && p.selection.creation.connectionId === connection?.id) && (
          <section className="publication-pending">
            <h2>{tr('Einrichtung fortsetzen', 'Resume setup')}</h2>
            {context.publications
              .filter((p) => p.stage !== 'complete' && p.selection.creation.connectionId === connection?.id)
              .map((p) => (
                <div className="publication-pending-row" key={p.id}>
                  <span>
                    <strong>{p.repository?.fullName || p.selection.creation.name}</strong>
                    <small>
                      {p.repository ? tr('Repository bereits erstellt', 'Repository already created') : tr('Vorbereiteter Vorgang', 'Prepared operation')} ·{' '}
                      {p.selection.remoteName}
                    </small>
                  </span>
                  <Button disabled={workflow.busy} onClick={() => resume(p)}>
                    {tr('Fortsetzen', 'Resume')}
                  </Button>
                </div>
              ))}
          </section>
        )}
        {complete && record?.repository ? (
          <section className="publication-complete">
            <Check size={24} />
            <h2>{tr('Repository veröffentlicht', 'Repository published')}</h2>
            <p>{record.repository.fullName}</p>
            <p>
              {tr(
                'Der ausgewählte Stand ist am neuen Ziel geprüft. Vorhandene weitere Verbindungen bleiben erhalten.',
                'The selected revisions are verified at the new endpoint. Other existing connections are preserved.',
              )}
            </p>
            <Button icon={<ExternalLink size={14} />} onClick={() => void appClient.openExternalUrl(record.repository!.htmlUrl)}>
              {tr('Repository öffnen', 'Open repository')}
            </Button>
            <Button onClick={newPublication}>{tr('Weiteres Repository veröffentlichen', 'Publish another repository')}</Button>
          </section>
        ) : (
          <>
            <PublicationSetupFields
              step={step}
              context={context}
              selection={selection}
              connection={connection}
              connections={connections}
              chooseAccount={chooseAccount}
              created={created}
              busy={workflow.busy}
              edit={edit}
              update={update}
            />
            {step === 3 && record && (
              <PublicationSummary record={record} selection={selection} connection={connection} busy={workflow.busy} publish={workflow.publish} />
            )}
          </>
        )}
      </div>
      {!complete && (
        <footer className="publication-footer">
          <span role="status">
            {workflow.phase ||
              (step === 3 ? tr('Secret-Scan und LFS laufen über den sicheren Transfer-Ablauf.', 'Secret scan and LFS use the secure transfer workflow.') : '')}
          </span>
          <div>
            {workflow.busy ? (
              <Button onClick={workflow.cancel}>{tr('Abbrechen', 'Cancel')}</Button>
            ) : (
              <>
                {step > 1 && <Button onClick={() => setStep(step - 1)}>{tr('Zurück', 'Back')}</Button>}
                {step === 1 ? (
                  <Button
                    variant="primary"
                    disabled={
                      !connection ||
                      !selection.creation.name ||
                      !selection.creation.namespace ||
                      (connection.provider === 'bitbucket-cloud' && !selection.creation.projectKey)
                    }
                    onClick={() => setStep(2)}
                  >
                    {tr('Weiter', 'Next')}
                  </Button>
                ) : step === 2 ? (
                  <Button
                    variant="primary"
                    disabled={!connection || (!selection.branches.length && (context.branches.length > 0 || !context.snapshot.branch))}
                    onClick={() => void review()}
                  >
                    {tr('Auswahl prüfen', 'Review selection')}
                  </Button>
                ) : (
                  <Button variant="primary" icon={<UploadCloud size={14} />} disabled={!record} onClick={() => void workflow.publish()}>
                    {created
                      ? tr('Veröffentlichung fortsetzen', 'Resume publication')
                      : record?.branches.length
                        ? tr('Erstellen und veröffentlichen', 'Create and publish')
                        : tr('Erstellen und verbinden', 'Create and connect')}
                  </Button>
                )}
              </>
            )}
          </div>
        </footer>
      )}
    </>
  );
}
