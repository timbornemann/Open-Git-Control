import { useState } from 'react';
import { GitBranch, Network, Plus, RotateCcw, Save } from 'lucide-react';
import { useI18n } from '@/i18n';
import { RemoteEndpointEditor } from './RemoteEndpointEditor';
import { RemoteConfigurationSelection } from './RemoteConfigurationSelection';
import { RemoteConfigurationHosting } from './RemoteConfigurationHosting';
import { RemotePullStrategy } from './RemotePullStrategy';
import { useRemoteConfiguration } from './useRemoteConfiguration';
import './hosting.css';
import './remote-configuration.css';
import { useOptionalUIContext } from '@/contexts/AppStateContext';
import { Button } from '@/components/ui/Button';
import { ActionRequirement } from '@/components/ui/ActionRequirement';
import { remoteConfigurationIssue } from './remoteConfigurationValidation';

export function RemoteConfigurationView({ repoPath }: { repoPath: string | null }) {
  const { tr } = useI18n();
  const editor = useRemoteConfiguration(repoPath);
  const onPublish = useOptionalUIContext()?.onOpenRepositoryPublication;
  const [addRequest, setAddRequest] = useState<{ repoPath: string; id: number } | null>(null);
  const snapshot = editor.snapshot;
  const issue = snapshot ? remoteConfigurationIssue(snapshot, editor.preferences, tr) : null;
  const addRemote = () => {
    if (!repoPath || !snapshot || editor.task.busy) return;
    setAddRequest((previous) => ({ repoPath, id: (previous?.id ?? 0) + 1 }));
  };
  if (!repoPath) return <p className="hosting-empty">{tr('Zuerst ein lokales Repository öffnen.', 'Open a local repository first.')}</p>;
  return (
    <main className="remote-configuration hosting-workspace" aria-label={tr('Remote-Konfiguration', 'Remote configuration')}>
      <header className="remote-configuration__heading">
        <div>
          <h1>{repoPath.split(/[\\/]/).pop()}</h1>
          <p title={repoPath}>{repoPath}</p>
        </div>
        {snapshot && (
          <div className="remote-configuration__context">
            <span>
              <GitBranch size={14} aria-hidden="true" />
              {snapshot.branch || tr('Kein Branch ausgewählt', 'No branch selected')}
            </span>
            <span>
              <Network size={14} aria-hidden="true" />
              {snapshot.remotes.length} {tr('Remotes', 'remotes')}
            </span>
            <Button icon={<Plus size={14} />} disabled={editor.task.busy} onClick={addRemote}>
              {tr('Remote hinzufügen', 'Add remote')}
            </Button>
          </div>
        )}
      </header>
      <nav className="remote-configuration__navigation" aria-label={tr('Zu einem Abschnitt springen', 'Jump to section')}>
        <a href="#remote-connections">{tr('Remotes', 'Remotes')}</a>
        <a href="#remote-transfers">{tr('Synchronisierung', 'Synchronization')}</a>
        {Boolean(snapshot?.remotes.length) && <a href="#remote-branches">{tr('Branches & Profile', 'Branches & profiles')}</a>}
        <a href="#remote-hosting">{tr('Hosting-Ziel', 'Hosting target')}</a>
      </nav>
      <div className="remote-configuration__content" aria-busy={editor.task.busy}>
        {snapshot && (
          <>
            <section id="remote-connections" className="remote-configuration__section">
              <div className="remote-configuration__section-heading">
                <div>
                  <h2>{tr('Remotes', 'Remotes')}</h2>
                  <p>
                    {tr(
                      'Ein Remote verbindet dieses Projekt mit einem Git-Repository auf einem Server. Wähle eine Verbindung, um ihre Adresse oder ihren Zugang zu ändern.',
                      'A remote connects this project to a Git repository on a server. Select a connection to change its address or access.',
                    )}
                  </p>
                </div>
                {onPublish && (
                  <Button disabled={editor.task.busy} onClick={() => onPublish()}>
                    {tr('Repository veröffentlichen', 'Publish repository')}
                  </Button>
                )}
              </div>
              <RemoteEndpointEditor
                key={repoPath}
                repoPath={repoPath}
                addRequest={addRequest?.repoPath === repoPath ? addRequest.id : 0}
                snapshot={snapshot}
                preferences={editor.preferences}
                connections={editor.connections}
                bind={editor.bind}
                setCredentialMode={editor.setCredentialMode}
                edit={editor.edit}
                request={editor.request}
                task={editor.task}
                reload={editor.reload}
                unbind={(name, url) => {
                  const next = {
                    ...editor.preferences,
                    bindings: editor.preferences.bindings?.filter((binding) => binding.remoteName !== name || binding.url !== url),
                  };
                  if (next.hostingRemote === name) {
                    delete next.hostingRemote;
                    delete next.hostingRepository;
                  }
                  editor.update(next);
                }}
              />
            </section>
            <div id="remote-transfers">
              {snapshot.remotes.length > 0 ? (
                <RemoteConfigurationSelection
                  snapshot={snapshot}
                  preferences={editor.preferences}
                  pullConfiguration={editor.pullConfiguration}
                  update={editor.update}
                  disabled={editor.task.busy}
                  setUpstream={editor.setUpstream}
                />
              ) : (
                <section className="remote-configuration__section">
                  <h2>{tr('Synchronisierung', 'Synchronization')}</h2>
                  <p>
                    {tr(
                      'Füge oben dein erstes Remote hinzu. Danach kannst du hier die Quellen und Ziele für Fetch, Pull und Push festlegen.',
                      'Add your first remote above. Then choose sources and targets for fetch, pull and push here.',
                    )}
                  </p>
                  <RemotePullStrategy
                    preferences={editor.preferences}
                    configuration={editor.pullConfiguration}
                    update={editor.update}
                    disabled={editor.task.busy}
                  />
                </section>
              )}
            </div>
            <RemoteConfigurationHosting preferences={editor.preferences} connections={editor.connections} update={editor.update} disabled={editor.task.busy} />
          </>
        )}
        {!snapshot && editor.task.busy && (
          <p className="remote-configuration__loading" role="status">
            {tr('Verbindungen und Einstellungen werden geladen …', 'Loading connections and settings …')}
          </p>
        )}
      </div>
      <footer className="remote-configuration__footer">
        <div className="remote-configuration__save-status" role="status">
          <strong>
            {editor.dirty
              ? tr('Ungespeicherter Entwurf', 'Unsaved draft')
              : editor.message || tr('Lokale Repository-Einstellungen', 'Local repository settings')}
          </strong>
          <small>
            {tr(
              'Speichert Synchronisierung und Repository-Zuordnungen. Remote-Adressen und Namen werden separat direkt übernommen.',
              'Saves synchronization and repository bindings. Remote addresses and names are applied separately and immediately.',
            )}
          </small>
        </div>
        <div className="hosting-actions">
          <Button icon={<RotateCcw size={14} />} disabled={editor.task.busy || !editor.dirty} onClick={editor.reset}>
            {tr('Entwurf verwerfen', 'Discard draft')}
          </Button>
          <ActionRequirement
            reason={editor.task.busy ? null : issue}
            remedy={
              issue
                ? {
                    label: tr('Auswahl prüfen', 'Review selection'),
                    onClick: () => document.getElementById('remote-transfers')?.scrollIntoView({ block: 'start' }),
                  }
                : undefined
            }
          >
            <Button variant="primary" icon={<Save size={14} />} disabled={editor.task.busy || !snapshot} onClick={editor.save}>
              {tr('Speichern', 'Save')}
            </Button>
          </ActionRequirement>
        </div>
        {editor.task.error && (
          <div className="remote-configuration__error" role="alert">
            <strong>{tr('Die Änderung konnte nicht übernommen werden.', 'The change could not be applied.')}</strong>
            <details>
              <summary>{tr('Technische Details', 'Technical details')}</summary>
              <p>{editor.task.error}</p>
            </details>
          </div>
        )}
      </footer>
    </main>
  );
}
