import { Save, RotateCcw } from 'lucide-react';
import { useI18n } from '@/i18n';
import { RemoteEndpointEditor } from './RemoteEndpointEditor';
import { RemoteConfigurationSelection } from './RemoteConfigurationSelection';
import { RemoteConfigurationHosting } from './RemoteConfigurationHosting';
import { useRemoteConfiguration } from './useRemoteConfiguration';
import './hosting.css';
import './remote-configuration.css';
import { useOptionalUIContext } from '@/contexts/AppStateContext';
import { Button } from '@/components/ui/Button';

export function RemoteConfigurationView({ repoPath }: { repoPath: string | null }) {
  const { tr } = useI18n();
  const editor = useRemoteConfiguration(repoPath);
  const onPublish = useOptionalUIContext()?.onOpenRepositoryPublication;
  if (!repoPath) return <p className="hosting-empty">{tr('Zuerst ein lokales Repository öffnen.', 'Open a local repository first.')}</p>;
  return (
    <main className="remote-configuration hosting-workspace" aria-label={tr('Remote-Konfiguration', 'Remote configuration')}>
      <header className="remote-configuration__heading">
        <div>
          <h1>{tr('Remote-Konfiguration', 'Remote configuration')}</h1>
          <p>{repoPath}</p>
        </div>
        <div className="hosting-actions">
          <Button disabled={editor.task.busy || !onPublish} onClick={() => onPublish?.()}>
            {tr('Repository veröffentlichen', 'Publish repository')}
          </Button>
          <button type="button" disabled={editor.task.busy || !editor.dirty} onClick={editor.reset}>
            <RotateCcw size={14} />
            {tr('Entwurf verwerfen', 'Discard draft')}
          </button>
          <button className="remote-configuration__save" type="button" disabled={editor.task.busy || !editor.snapshot} onClick={editor.save}>
            <Save size={14} />
            {tr('Speichern', 'Save')}
          </button>
        </div>
      </header>
      <p className="remote-configuration__notice">
        {tr(
          'Diese Einstellungen sind optional. „Speichern“ übernimmt deine Auswahl lokal für dieses Repository und startet keine Übertragung.',
          'These settings are optional. Save applies your choices locally to this repository without starting a transfer.',
        )}
      </p>
      {editor.dirty && <p role="status">{tr('Ungespeicherter Entwurf', 'Unsaved draft')}</p>}
      {editor.snapshot && (
        <>
          <p>
            {tr('Aktueller Branch', 'Current branch')}: <strong>{editor.snapshot.branch || 'HEAD'}</strong> · Upstream:{' '}
            {editor.snapshot.upstream ? `${editor.snapshot.upstream.remote}/${editor.snapshot.upstream.branch}` : '—'}
          </p>
          {editor.snapshot.remotes.length > 0 && (
            <RemoteConfigurationSelection
              snapshot={editor.snapshot}
              preferences={editor.preferences}
              update={editor.update}
              disabled={editor.task.busy}
              setUpstream={editor.setUpstream}
            />
          )}
          <section className="remote-configuration__section">
            <h2>{tr('Verbundene Remotes', 'Connected remotes')}</h2>
            <p>
              {tr(
                'Ein Remote ist eine Verbindung zu einem Repository auf einem Server. Hier kannst du zum Beispiel ein zusätzliches Backup verbinden. Änderungen an Namen und URLs gelten sofort.',
                'A remote connects this repository to a repository on a server. Add another connection here, for example for a backup. Name and URL changes apply immediately.',
              )}
            </p>
            <RemoteEndpointEditor
              repoPath={repoPath}
              snapshot={editor.snapshot}
              preferences={editor.preferences}
              connections={editor.connections}
              bindingConnection={editor.bindingConnection}
              setBindingConnection={editor.setBindingConnection}
              bind={editor.bind}
              setCredentialMode={editor.setCredentialMode}
              edit={editor.edit}
              request={editor.request}
              task={editor.task}
              reload={editor.reload}
              invalidatePlan={() => {}}
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
          <RemoteConfigurationHosting preferences={editor.preferences} connections={editor.connections} update={editor.update} disabled={editor.task.busy} />
        </>
      )}
      {editor.task.busy && <p role="status">{tr('Laden …', 'Loading …')}</p>}
      {editor.message && <p role="status">{editor.message}</p>}
      {editor.task.error && (
        <p role="alert" className="hosting-error">
          {editor.task.error}
        </p>
      )}
    </main>
  );
}
