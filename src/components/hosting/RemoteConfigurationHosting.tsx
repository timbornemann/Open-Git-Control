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
    <details className="remote-configuration__section remote-configuration__advanced">
      <summary>
        {tr('Hosting für PRs, CI und Releases (optional)', 'Hosting for PRs, CI and releases (optional)')}
        {preferences.hostingRemote ? ` · ${preferences.hostingRemote}` : ''}
      </summary>
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
            'Für diese Funktionen kannst du unter „Verbundene Remotes“ ein Hosting-Konto zuordnen. Für normale Git-Übertragungen ist das nicht nötig.',
            'For these features, bind a hosting account under Connected remotes. Normal Git transfers do not require this.',
          )}
        </p>
      )}
    </details>
  );
}
