import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useI18n } from '@/i18n';
import { useUIStore } from '@/contexts/AppStateContext';
import { providerLabels, useHostingState } from '@/components/hosting/hostingState';
import type { HostingConnection } from '@/types/hostingDtos';
import type { PublicationContext, PublicationSelection } from '@/types/repositoryPublication';
import { APPLICATION_OPEN_STAGING_COMMIT_EVENT } from '@/utils/layoutPreferences';
import { RepositoryCreationTarget } from './RepositoryCreationTarget';
import { PublicationRefs } from './PublicationRefs';

type Props = {
  step: number;
  context: PublicationContext;
  selection: PublicationSelection;
  connection?: HostingConnection;
  connections: HostingConnection[];
  chooseAccount: (id: string) => void;
  created: boolean;
  busy: boolean;
  edit: (patch: Partial<PublicationSelection>) => void;
  update: (value: PublicationSelection) => void;
};
export function PublicationSetupFields({ step, context, selection, connection, connections, chooseAccount, created, busy, edit, update }: Props) {
  const { tr } = useI18n();
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  return (
    <>
      {step === 1 && (
        <section className="publication-section">
          <p className="publication-help">
            {tr(
              'Erstelle ein leeres Hosting-Repository für dieses lokale Projekt. README, Lizenz und Gitignore kommen aus deiner vorhandenen Historie.',
              'Create an empty hosted repository for this local project. README, license and gitignore come from your existing history.',
            )}
          </p>
          <div className="publication-grid">
            <label>
              {tr('Anbieter, Server und Konto', 'Provider, server and account')}
              <select
                aria-label={tr('Anbieter, Server und Konto', 'Provider, server and account')}
                value={connection?.id || ''}
                disabled={busy || created}
                onChange={(event) => chooseAccount(event.target.value)}
              >
                <option value="">{tr('Konto auswählen', 'Choose account')}</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {providerLabels[c.provider]} · {c.baseUrl} · {c.username || c.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr('Repository-Name', 'Repository name')}
              <TextField
                value={selection.creation.name}
                disabled={busy || created}
                maxLength={100}
                onChange={(event) => edit({ creation: { ...selection.creation, name: event.target.value } })}
              />
            </label>
          </div>
          {!connection ? (
            <div className="publication-prerequisite">
              <p>{tr('Verbinde ein Hosting-Konto, um hier ein Repository anzulegen.', 'Connect a hosting account to create a repository here.')}</p>
              <Button
                onClick={() => {
                  useHostingState.getState().navigate('connections');
                  setActiveTab('hosting');
                }}
              >
                {tr('Konten & Server', 'Accounts & servers')}
              </Button>
            </div>
          ) : (
            <RepositoryCreationTarget
              connection={connection}
              creation={selection.creation}
              disabled={busy || created}
              onChange={(creation) => edit({ creation })}
            />
          )}
          <div className="publication-grid">
            <label>
              {tr('Beschreibung (optional)', 'Description (optional)')}
              <TextField
                value={selection.creation.description || ''}
                disabled={busy || created}
                onChange={(event) => edit({ creation: { ...selection.creation, description: event.target.value } })}
              />
            </label>
            <label>
              {tr('Sichtbarkeit', 'Visibility')}
              <select
                aria-label={tr('Sichtbarkeit', 'Visibility')}
                disabled={busy || created}
                value={selection.creation.private ? 'private' : 'public'}
                onChange={(event) => edit({ creation: { ...selection.creation, private: event.target.value === 'private' } })}
              >
                <option value="private">{tr('Privat', 'Private')}</option>
                <option value="public">{tr('Öffentlich', 'Public')}</option>
              </select>
            </label>
          </div>
        </section>
      )}
      {step === 2 && (
        <section className="publication-section">
          <div className="publication-grid">
            <label>
              {tr('Neuer Remote-Name', 'New remote name')}
              <TextField disabled={busy || created} value={selection.remoteName} onChange={(event) => edit({ remoteName: event.target.value })} />
              <small>
                {context.snapshot.remotes.length
                  ? tr('Bestehende Remotes werden zusätzlich beibehalten.', 'Existing remotes are kept alongside this connection.')
                  : tr('origin ist die übliche erste Verbindung.', 'origin is the usual first connection.')}
              </small>
            </label>
            <label>
              {tr('Transport & Anmeldung', 'Transport & authentication')}
              <select
                aria-label={tr('Transport & Anmeldung', 'Transport & authentication')}
                disabled={busy || created}
                value={`${selection.transport}:${selection.credentialMode}`}
                onChange={(event) => {
                  const [transport, credentialMode] = event.target.value.split(':');
                  edit({
                    transport: transport as PublicationSelection['transport'],
                    credentialMode: credentialMode as PublicationSelection['credentialMode'],
                  });
                }}
              >
                <option value="https:connection">HTTPS · {tr('Ausgewähltes App-Konto', 'Selected app account')}</option>
                <option value="https:system">HTTPS · {tr('System-Credentials', 'System credentials')}</option>
                <option value="ssh:system">SSH · {tr('System-Schlüssel', 'System keys')}</option>
              </select>
            </label>
          </div>
          {context.snapshot.remotes.length > 0 && (
            <label className="publication-check">
              <input
                type="checkbox"
                checked={selection.makePrimary}
                disabled={busy || created}
                onChange={(event) => edit({ makePrimary: event.target.checked })}
              />
              {tr('Als neues Hauptziel verwenden', 'Use as new primary target')}
            </label>
          )}
          <p className="publication-help">
            {context.snapshot.remotes.length && !selection.makePrimary
              ? tr(
                  'Hosting-, Fetch-, Pull-, Push-Ziel und Tracking bleiben wie bisher. Nur diese Veröffentlichung verwendet die neue Verbindung.',
                  'Hosting, fetch, pull, push defaults and tracking stay as configured. This publication alone uses the new connection.',
                )
              : tr(
                  'Die neue Verbindung wird nach geprüftem Upload zum Standard. Der veröffentlichte Branch erhält sein Tracking.',
                  'After verified upload, this connection becomes the default and the published branch gets tracking.',
                )}
          </p>
          <PublicationRefs context={context} selection={selection} disabled={busy} update={update} />
          {context.dirtyFiles > 0 && (
            <div className="publication-working-changes">
              <strong>
                {context.dirtyFiles} {tr('offene Dateiänderungen', 'uncommitted file changes')}
              </strong>
              <p>
                {tr(
                  'Hochgeladen werden ausschließlich Commits. Committe diese Änderungen bei Bedarf zuerst im Staging.',
                  'Only commits are uploaded. Commit these changes in Staging first if needed.',
                )}
              </p>
              <Button disabled={busy} onClick={() => window.dispatchEvent(new Event(APPLICATION_OPEN_STAGING_COMMIT_EVENT))}>
                {tr('Staging öffnen', 'Open staging')}
              </Button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
