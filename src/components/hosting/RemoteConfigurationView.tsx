import { useState } from 'react';
import { ArrowDownUp, GitBranch, Network, RotateCcw, Save } from 'lucide-react';
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
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ActionRequirement } from '@/components/ui/ActionRequirement';
import { remoteConfigurationIssue } from './remoteConfigurationValidation';

export function RemoteConfigurationView({ repoPath }: { repoPath: string | null }) {
  const { tr } = useI18n();
  const editor = useRemoteConfiguration(repoPath);
  const onPublish = useOptionalUIContext()?.onOpenRepositoryPublication;
  const [section, setSection] = useState<'transfers' | 'connections'>('transfers');
  const snapshot = editor.snapshot;
  const issue = snapshot ? remoteConfigurationIssue(snapshot, editor.preferences, tr) : null;
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
              {snapshot.remotes.length === 1
                ? tr('1 Verbindung', '1 connection')
                : tr(`${snapshot.remotes.length} Verbindungen`, `${snapshot.remotes.length} connections`)}
            </span>
          </div>
        )}
      </header>
      <nav className="remote-configuration__navigation" aria-label={tr('Konfigurationsbereiche', 'Configuration sections')}>
        <SegmentedControl
          ariaLabel={tr('Konfigurationsbereich', 'Configuration section')}
          value={section}
          onChange={setSection}
          options={[
            {
              value: 'transfers',
              label: (
                <>
                  <ArrowDownUp size={14} aria-hidden="true" />
                  {tr('Übertragungen', 'Transfers')}
                </>
              ),
            },
            {
              value: 'connections',
              label: (
                <>
                  <Network size={14} aria-hidden="true" />
                  {tr('Verbindungen & Konten', 'Connections & accounts')}
                </>
              ),
            },
          ]}
        />
      </nav>
      <div className="remote-configuration__content" aria-busy={editor.task.busy}>
        {snapshot && (
          <>
            <div hidden={section !== 'transfers'}>
              {snapshot.remotes.length > 0 && (
                <RemoteConfigurationSelection
                  snapshot={snapshot}
                  preferences={editor.preferences}
                  pullConfiguration={editor.pullConfiguration}
                  update={editor.update}
                  disabled={editor.task.busy}
                  setUpstream={editor.setUpstream}
                />
              )}
              {snapshot.remotes.length === 0 && (
                <section className="remote-configuration__section remote-configuration__empty">
                  <Network size={24} aria-hidden="true" />
                  <h2>{tr('Dieses Repository ist noch nicht verbunden', 'This repository is not connected yet')}</h2>
                  <p>
                    {tr(
                      'Verbinde ein vorhandenes Repository über seine Git-URL oder erstelle ein neues Repository auf deinem Hosting-Anbieter.',
                      'Connect an existing repository using its Git URL or create a new repository on your hosting provider.',
                    )}
                  </p>
                  <div className="hosting-actions">
                    <Button variant="primary" onClick={() => setSection('connections')}>
                      {tr('Vorhandenes Repository verbinden', 'Connect existing repository')}
                    </Button>
                    {onPublish && (
                      <Button disabled={editor.task.busy} onClick={() => onPublish()}>
                        {tr('Repository veröffentlichen', 'Publish repository')}
                      </Button>
                    )}
                  </div>
                  <details className="remote-configuration__advanced">
                    <summary>{tr('Pull-Strategie vorbereiten', 'Prepare pull strategy')}</summary>
                    <RemotePullStrategy
                      preferences={editor.preferences}
                      configuration={editor.pullConfiguration}
                      update={editor.update}
                      disabled={editor.task.busy}
                    />
                  </details>
                </section>
              )}
            </div>
            <div hidden={section !== 'connections'}>
              <section className="remote-configuration__section">
                <div className="remote-configuration__section-heading">
                  <div>
                    <h2>{tr('Verbundene Repositorys', 'Connected repositories')}</h2>
                    <p>
                      {tr(
                        'Jede Verbindung heißt in Git „Remote“. Der Name, etwa origin oder backup, gilt nur in diesem lokalen Repository.',
                        'Git calls each connection a “remote”. Its name, such as origin or backup, belongs to this local repository.',
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
              <RemoteConfigurationHosting
                preferences={editor.preferences}
                connections={editor.connections}
                update={editor.update}
                disabled={editor.task.busy}
              />
            </div>
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
              '„Speichern“ übernimmt Übertragungsregeln und Kontozuordnungen. Es startet keinen Transfer.',
              'Save applies transfer rules and account bindings. It does not start a transfer.',
            )}
          </small>
        </div>
        <div className="hosting-actions">
          <Button icon={<RotateCcw size={14} />} disabled={editor.task.busy || !editor.dirty} onClick={editor.reset}>
            {tr('Entwurf verwerfen', 'Discard draft')}
          </Button>
          <ActionRequirement
            reason={editor.task.busy ? null : issue}
            remedy={issue ? { label: tr('Auswahl prüfen', 'Review selection'), onClick: () => setSection('transfers') } : undefined}
          >
            <Button variant="primary" icon={<Save size={14} />} disabled={editor.task.busy || !snapshot} onClick={editor.save}>
              {tr('Speichern', 'Save')}
            </Button>
          </ActionRequirement>
        </div>
        {editor.task.error && (
          <details className="remote-configuration__error" role="alert">
            <summary>{tr('Die Änderung konnte nicht übernommen werden. Details anzeigen.', 'The change could not be applied. Show details.')}</summary>
            <p>{editor.task.error}</p>
          </details>
        )}
      </footer>
    </main>
  );
}
