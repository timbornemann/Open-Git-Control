import { useI18n } from '@/i18n';
import type { GitPullConfigurationDto, GitRemoteSnapshotDto, RemotePreferences, RemoteSelectionMode, RemoteTransferAction } from '@/types/remoteTransfers';
import { getRemoteTransferDefaults, resolveRemoteTransferSelection } from '@/utils/remoteTransferSelection';
import { RemotePullStrategy } from './RemotePullStrategy';

type Props = {
  snapshot: GitRemoteSnapshotDto;
  preferences: RemotePreferences;
  update: (next: RemotePreferences) => void;
  disabled: boolean;
  selected: string[];
  activeProfileName?: string;
  pullConfiguration: GitPullConfigurationDto | null;
};

export function RemoteConfigurationActions({ snapshot, preferences, update, disabled, selected, activeProfileName, pullConfiguration }: Props) {
  const { tr } = useI18n();
  const soleRemote = snapshot.remotes.length === 1 ? snapshot.remotes[0] : null;
  const pullDefaults = getRemoteTransferDefaults('pull', snapshot, preferences);
  const pushDefaults = resolveRemoteTransferSelection('push', snapshot, preferences);
  const defaultSource = (action: 'fetch' | 'pull') =>
    getRemoteTransferDefaults(action, snapshot, { ...preferences, [action === 'fetch' ? 'fetchRemote' : 'pullRemote']: undefined }).remote;
  const mode = (action: RemoteTransferAction) => (
    <label>
      {tr('Beim Start', 'When starting')}
      <select
        aria-label={`${action} ${tr('Auswahlmodus', 'selection mode')}`}
        disabled={disabled}
        value={preferences.selectionModes?.[action] ?? 'ask'}
        onChange={(event) => update({ ...preferences, selectionModes: { ...preferences.selectionModes, [action]: event.target.value as RemoteSelectionMode } })}
      >
        <option value="ask">{tr('Jedes Mal auswählen', 'Choose every time')}</option>
        <option value="remember">{tr('Gespeicherte Auswahl verwenden', 'Use saved selection')}</option>
      </select>
    </label>
  );
  const source = (action: 'fetch' | 'pull') => (
    <label>
      {action === 'fetch' ? tr('Fetch-Quelle', 'Fetch source') : tr('Pull-Quelle', 'Pull source')}
      <select
        aria-label={action === 'fetch' ? tr('Fetch-Quelle', 'Fetch source') : tr('Pull-Quelle', 'Pull source')}
        disabled={disabled}
        value={(action === 'fetch' ? preferences.fetchRemote : preferences.pullRemote) ?? ''}
        onChange={(event) =>
          update({
            ...preferences,
            [action === 'fetch' ? 'fetchRemote' : 'pullRemote']: event.target.value || undefined,
            ...(action === 'pull' && preferences.pullRemote !== event.target.value ? { pullBranches: undefined } : {}),
          })
        }
      >
        <option value="">
          {tr('Standardquelle verwenden', 'Use default source')}
          {defaultSource(action) ? ` (${defaultSource(action)})` : ''}
        </option>
        {snapshot.remotes.map((remote) => (
          <option value={remote.name} key={remote.name}>
            {remote.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <h2>{tr('Push, Pull und Fetch', 'Push, pull and fetch')}</h2>
      <p>
        {soleRemote
          ? tr(
              `Nur ${soleRemote.name} ist eingerichtet. Alle drei Aktionen starten direkt; du musst hier nichts einstellen.`,
              `Only ${soleRemote.name} is configured. All three actions start directly; no setup is required here.`,
            )
          : tr(
              'Lege für jede Aktion fest, welches Remote verwendet wird und ob die Anwendung jedes Mal fragen soll.',
              'Choose a remote for each action and whether the app should ask every time.',
            )}
      </p>
      <div className="remote-configuration__rules">
        <fieldset disabled={disabled}>
          <legend>Fetch</legend>
          <p>{tr('Änderungen abrufen, ohne deine Arbeitsdateien zu ändern.', 'Download changes without changing your working files.')}</p>
          {soleRemote ? (
            <p className="remote-configuration__destination">
              <strong>{soleRemote.name}</strong>
              <small>{soleRemote.fetchUrls[0]}</small>
            </p>
          ) : (
            source('fetch')
          )}
          {!soleRemote && mode('fetch')}
          <small>{tr('Hintergrund-Fetch fragt nie nach einer Quelle.', 'Background fetch never asks for a source.')}</small>
        </fieldset>
        <fieldset disabled={disabled}>
          <legend>Pull</legend>
          <p>{tr('Remote-Änderungen in deinen aktuellen Branch übernehmen.', 'Bring remote changes into your current branch.')}</p>
          {soleRemote ? (
            <p className="remote-configuration__destination">
              <strong>
                {soleRemote.name}/{pullDefaults.branch || '—'}
              </strong>
            </p>
          ) : (
            source('pull')
          )}
          {!soleRemote && mode('pull')}
          <RemotePullStrategy
            preferences={preferences}
            configuration={pullConfiguration?.branch === snapshot.branch ? pullConfiguration : null}
            update={update}
            disabled={disabled}
          />
          {!soleRemote && (
            <small>
              {tr('Aktueller Quellbranch', 'Current source branch')}: {pullDefaults.branch || '—'}
            </small>
          )}
        </fieldset>
        <fieldset disabled={disabled}>
          <legend>Push</legend>
          <p>{tr('Lokale Commits veröffentlichen. Tags werden separat ausgewählt.', 'Publish local commits. Tags are selected separately.')}</p>
          {soleRemote ? (
            <p className="remote-configuration__destination">
              <strong>
                {soleRemote.name}/{pushDefaults.targetBranches[soleRemote.name] || snapshot.branch || '—'}
              </strong>
              <small>{soleRemote.pushUrls.join('\n')}</small>
            </p>
          ) : (
            snapshot.remotes.map((remote) => (
              <label key={remote.name} className="hosting-checkbox">
                <input
                  type="checkbox"
                  checked={selected.includes(remote.name)}
                  onChange={(event) =>
                    update({
                      ...preferences,
                      pushRemotes: event.target.checked ? [...selected, remote.name] : selected.filter((name) => name !== remote.name),
                    })
                  }
                />
                {remote.name}
              </label>
            ))
          )}
          {!soleRemote && mode('push')}
          {activeProfileName && (
            <small>
              {tr('Aktives Profil', 'Active profile')}: {activeProfileName}
            </small>
          )}
        </fieldset>
      </div>
    </>
  );
}
