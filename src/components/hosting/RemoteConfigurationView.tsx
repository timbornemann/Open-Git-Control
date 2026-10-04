import { Save, RotateCcw } from 'lucide-react';
import { useI18n } from '@/i18n';
import { RemoteEndpointEditor } from './RemoteEndpointEditor';
import { RemoteConfigurationSelection } from './RemoteConfigurationSelection';
import { RemoteConfigurationHosting } from './RemoteConfigurationHosting';
import { useRemoteConfiguration } from './useRemoteConfiguration';
import './hosting.css';
import './remote-configuration.css';

export function RemoteConfigurationView({ repoPath }: { repoPath: string | null }) {
  const { tr } = useI18n();
  const editor = useRemoteConfiguration(repoPath);
  if (!repoPath) return <p className="hosting-empty">{tr('Zuerst ein lokales Repository öffnen.', 'Open a local repository first.')}</p>;
  return (
    <main className="remote-configuration hosting-workspace" aria-label={tr('Remote-Konfiguration', 'Remote configuration')}>
      <header className="remote-configuration__heading">
        <div>
          <h1>{tr('Remote-Konfiguration', 'Remote configuration')}</h1>
          <p>{repoPath}</p>
        </div>
        <div className="hosting-actions">
          <button type="button" disabled={editor.task.busy || !editor.dirty} onClick={editor.reset}>
            <RotateCcw size={14} />
            {tr('Entwurf verwerfen', 'Discard draft')}
          </button>
          <button type="button" disabled={editor.task.busy || !editor.snapshot} onClick={editor.save}>
            <Save size={14} />
            {tr('Speichern', 'Save')}
          </button>
        </div>
      </header>
      <p className="remote-configuration__notice">
        {tr(
          'Auswahlregeln und Kontobindungen werden erst mit „Speichern“ übernommen. Entwürfe bleiben in dieser Sitzung für dieses Repository erhalten.',
          'Selection rules and account bindings take effect when saved. Drafts remain available for this repository during this session.',
        )}
      </p>
      {editor.dirty && <p role="status">{tr('Ungespeicherter Entwurf', 'Unsaved draft')}</p>}
      {editor.snapshot && (
        <>
          <p>
            {tr('Aktueller Branch', 'Current branch')}: <strong>{editor.snapshot.branch || 'HEAD'}</strong> · Upstream:{' '}
            {editor.snapshot.upstream ? `${editor.snapshot.upstream.remote}/${editor.snapshot.upstream.branch}` : '—'}
          </p>
          <RemoteConfigurationSelection
            snapshot={editor.snapshot}
            preferences={editor.preferences}
            update={editor.update}
            disabled={editor.task.busy}
            setUpstream={editor.setUpstream}
          />
          <RemoteConfigurationHosting preferences={editor.preferences} connections={editor.connections} update={editor.update} disabled={editor.task.busy} />
          <section className="remote-configuration__section">
            <h2>{tr('Remotes und Endpunkte', 'Remotes and endpoints')}</h2>
            <p>
              {tr(
                'Remote hinzufügen, umbenennen, entfernen und URLs ändern sind ausdrückliche Git-Aktionen und werden sofort angewendet. Der Entwurf wird an die gültigen Endpunkte angepasst.',
                'Adding, renaming, removing remotes and changing URLs are explicit Git actions and apply immediately. The draft is adjusted to the valid endpoints.',
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
