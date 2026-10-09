import { useI18n } from '@/i18n';
import type { HostingConnection } from '@/types/hostingDtos';
import type { RemotePreferences } from '@/types/remoteTransfers';
type Props = { preferences: RemotePreferences; connections: HostingConnection[]; update: (next: RemotePreferences) => void; disabled: boolean };
export function RemoteConfigurationHosting({ preferences, connections, update, disabled }: Props) {
  const { tr } = useI18n();
  const bindings = (preferences.bindings ?? []).filter((binding) => binding.repository);
  const current = bindings.findIndex(
    (binding) =>
      binding.remoteName === preferences.hostingRemote &&
      binding.repository?.connectionId === preferences.hostingRepository?.connectionId &&
      binding.repository?.repositoryId === preferences.hostingRepository?.repositoryId &&
      binding.repository?.fullPath === preferences.hostingRepository?.fullPath,
  );
  return (
    <section className="remote-configuration__section">
      <h2>{tr('Repository für PRs, CI und Releases', 'Repository for PRs, CI and releases')}</h2>
      <p>
        {tr(
          'Dieses Ziel bestimmt, welches Konto und Repository für Change Requests, CI und Releases verwendet wird. Übertragungsziele bleiben unabhängig davon.',
          'This target determines the account and repository used for change requests, CI and releases. Transfer targets are selected separately.',
        )}
      </p>
      <label>
        {tr('Repository für Hosting-Funktionen', 'Repository for hosting features')}
        <select
          disabled={disabled}
          value={current < 0 ? '' : String(current)}
          onChange={(event) => {
            const binding = bindings[Number(event.target.value)];
            const next = { ...preferences };
            if (event.target.value === '' || !binding?.repository) {
              delete next.hostingRemote;
              delete next.hostingRepository;
            } else {
              next.hostingRemote = binding.remoteName;
              next.hostingRepository = binding.repository;
            }
            update(next);
          }}
        >
          <option value="">{tr('Kein Hosting-Ziel', 'No hosting target')}</option>
          {bindings.map((binding, index) => (
            <option key={`${binding.remoteName}/${binding.url}`} value={index}>
              {binding.remoteName} ·{' '}
              {connections.find((connection) => connection.id === binding.repository?.connectionId)?.label ?? binding.repository?.connectionId} ·{' '}
              {binding.repository?.fullPath}
            </option>
          ))}
        </select>
      </label>
      {!bindings.length && (
        <p>
          {tr(
            'Öffne oben bei einer Verbindung „Anmeldung und Hosting-Konto“, ordne ein Konto zu und wähle das Repository hier aus. Normale Git-Übertragungen benötigen diese Zuordnung nicht.',
            'Open Authentication and hosting account on a connection above, bind an account and select its repository here. Normal Git transfers do not need this binding.',
          )}
        </p>
      )}
      <small>
        {tr(
          'Diese Auswahl wird mit „Speichern“ übernommen. Der Release-Creator nutzt dieses Repository als Vorauswahl; Push-Ziele bleiben unabhängig.',
          'Save applies this selection. The release creator uses this repository as its default; push targets remain independent.',
        )}
      </small>
    </section>
  );
}
