import { ArrowDownToLine, Download, Upload } from 'lucide-react';
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
  const fetchDefaults = getRemoteTransferDefaults('fetch', snapshot, preferences);
  const pullDefaults = getRemoteTransferDefaults('pull', snapshot, preferences);
  const pushDefaults = resolveRemoteTransferSelection('push', snapshot, preferences);
  const defaultSource = (action: 'fetch' | 'pull') =>
    getRemoteTransferDefaults(action, snapshot, { ...preferences, [action === 'fetch' ? 'fetchRemote' : 'pullRemote']: undefined }).remote;
  const sourceIsMissing = (action: 'fetch' | 'pull') => {
    const name = action === 'fetch' ? preferences.fetchRemote : preferences.pullRemote;
    return Boolean(name && !snapshot.remotes.some((remote) => remote.name === name));
  };
  const pushTargetIsMissing = selected.some((name) => !snapshot.remotes.some((remote) => remote.name === name));
  const mode = (action: RemoteTransferAction) => (
    <label>
      {tr('Zielauswahl beim Start', 'Target selection when starting')}
      <select
        aria-label={`${action} ${tr('Auswahlmodus', 'selection mode')}`}
        disabled={disabled}
        value={preferences.selectionModes?.[action] ?? 'ask'}
        onChange={(event) => update({ ...preferences, selectionModes: { ...preferences.selectionModes, [action]: event.target.value as RemoteSelectionMode } })}
      >
        <option value="ask">{tr('Vor jeder Übertragung fragen', 'Ask before every transfer')}</option>
        <option value="remember">{tr('Diese Auswahl direkt verwenden', 'Use this selection directly')}</option>
      </select>
    </label>
  );
  const source = (action: 'fetch' | 'pull') => (
    <label>
      {action === 'fetch'
        ? tr('Von welchem Remote laden?', 'Which remote to download from?')
        : tr('Von welchem Remote übernehmen?', 'Which remote to pull from?')}
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
          {action === 'pull' && preferences.fetchRemote ? tr('Fetch-Quelle verwenden', 'Use fetch source') : tr('Git-Standard', 'Git default')}
          {defaultSource(action) ? ` (${defaultSource(action)})` : ''}
        </option>
        {(action === 'fetch' ? preferences.fetchRemote : preferences.pullRemote) &&
          !snapshot.remotes.some((remote) => remote.name === (action === 'fetch' ? preferences.fetchRemote : preferences.pullRemote)) && (
            <option value={action === 'fetch' ? preferences.fetchRemote : preferences.pullRemote}>
              {action === 'fetch' ? preferences.fetchRemote : preferences.pullRemote} · {tr('nicht mehr vorhanden', 'no longer available')}
            </option>
          )}
        {snapshot.remotes.map((remote) => (
          <option value={remote.name} key={remote.name}>
            {remote.name} · {remote.fetchUrls[0]}
          </option>
        ))}
      </select>
    </label>
  );
  const behavior = (action: RemoteTransferAction) =>
    soleRemote || preferences.selectionModes?.[action] === 'remember'
      ? tr('Startet direkt mit dieser Auswahl.', 'Starts directly with this selection.')
      : tr('Fragt vor dem Start. Diese Auswahl dient als Vorschlag.', 'Asks before starting. This selection is a suggestion.');
  return (
    <>
      <h2>{tr('So synchronisierst du dieses Repository', 'How this repository synchronizes')}</h2>
      <p>
        {soleRemote
          ? tr(
              `Nur ${soleRemote.name} ist eingerichtet. Alle drei Aktionen starten direkt; du musst hier nichts einstellen.`,
              `Only ${soleRemote.name} is configured. All three actions start directly; no setup is required here.`,
            )
          : tr(
              'Wähle zuerst die Quelle oder Ziele. Entscheide danach für jede Aktion, ob diese Auswahl direkt verwendet werden soll.',
              'First choose a source or targets. Then decide for each action whether to use that selection directly.',
            )}
      </p>
      <small>
        {tr(
          'Die Anzeigen „Nächster Transfer“ zeigen das Verhalten nach dem Speichern deiner Auswahl.',
          'The Next transfer summaries show the behavior after saving your choices.',
        )}
      </small>
      <div className="remote-configuration__rules">
        <section className="remote-configuration__rule" aria-labelledby="remote-fetch-title">
          <div className="remote-configuration__rule-description">
            <h3 id="remote-fetch-title">
              <Download size={16} aria-hidden="true" />
              Fetch <span>{tr('Abrufen', 'Download')}</span>
            </h3>
            <p>
              {tr(
                'Lädt den Serverstand zur Ansicht herunter. Deine Dateien und dein aktueller Branch bleiben unverändert.',
                'Downloads the server state for inspection. Your files and current branch stay unchanged.',
              )}
            </p>
          </div>
          <fieldset disabled={disabled} aria-label="Fetch">
            {soleRemote && !sourceIsMissing('fetch') ? (
              <p className="remote-configuration__destination">
                <strong>{soleRemote.name}</strong>
                <small>{soleRemote.fetchUrls[0]}</small>
              </p>
            ) : (
              <div className="remote-configuration__fields">
                {source('fetch')}
                {mode('fetch')}
              </div>
            )}
            <p className="remote-configuration__effect">
              <strong>
                {tr('Nächster Fetch', 'Next fetch')}: {fetchDefaults.remote || tr('Quelle auswählen', 'Choose a source')}
              </strong>
              <small>{behavior('fetch')}</small>
            </p>
            <small>
              {preferences.selectionModes?.fetch === 'remember'
                ? tr('Hintergrund-Fetch nutzt die gespeicherte Quelle und zeigt keine Auswahl.', 'Background fetch uses the saved source without prompting.')
                : tr(
                    'Hintergrund-Fetch nutzt weiterhin die Git-Standardquelle und fragt nie nach.',
                    'Background fetch keeps using the Git default source and never prompts.',
                  )}
            </small>
          </fieldset>
        </section>
        <section className="remote-configuration__rule" aria-labelledby="remote-pull-title">
          <div className="remote-configuration__rule-description">
            <h3 id="remote-pull-title">
              <ArrowDownToLine size={16} aria-hidden="true" />
              Pull <span>{tr('Übernehmen', 'Integrate')}</span>
            </h3>
            <p>
              {tr(
                'Lädt Änderungen und übernimmt sie in deinen aktuellen Branch. Die Strategie bestimmt, wie lokale und entfernte Commits zusammengeführt werden.',
                'Downloads changes and integrates them into your current branch. The strategy determines how local and remote commits are combined.',
              )}
            </p>
          </div>
          <fieldset disabled={disabled} aria-label="Pull">
            {soleRemote && !sourceIsMissing('pull') ? (
              <p className="remote-configuration__destination">
                <strong>
                  {soleRemote.name}/{pullDefaults.branch || '—'}
                </strong>
              </p>
            ) : (
              <div className="remote-configuration__fields">
                {source('pull')}
                {mode('pull')}
              </div>
            )}
            <RemotePullStrategy
              preferences={preferences}
              configuration={pullConfiguration?.branch === snapshot.branch ? pullConfiguration : null}
              update={update}
              disabled={disabled}
            />
            <p className="remote-configuration__effect">
              <strong>
                {tr('Nächster Pull', 'Next pull')}:{' '}
                {pullDefaults.remote
                  ? `${pullDefaults.remote}/${pullDefaults.branch || '—'} → ${snapshot.branch || 'HEAD'}`
                  : tr('Quelle auswählen', 'Choose a source')}
              </strong>
              <small>{behavior('pull')}</small>
            </p>
          </fieldset>
        </section>
        <section className="remote-configuration__rule" aria-labelledby="remote-push-title">
          <div className="remote-configuration__rule-description">
            <h3 id="remote-push-title">
              <Upload size={16} aria-hidden="true" />
              Push <span>{tr('Hochladen', 'Upload')}</span>
            </h3>
            <p>
              {tr(
                'Veröffentlicht deine lokalen Commits. Wähle mehrere Ziele, um denselben Stand auch auf ein Backup zu laden.',
                'Publishes your local commits. Choose multiple targets to upload the same state to a backup.',
              )}
            </p>
          </div>
          <fieldset disabled={disabled} aria-label="Push">
            {soleRemote && !pushTargetIsMissing ? (
              <p className="remote-configuration__destination">
                <strong>
                  {soleRemote.name}/{pushDefaults.targetBranches[soleRemote.name] || snapshot.branch || '—'}
                </strong>
                <small>{soleRemote.pushUrls.join('\n')}</small>
              </p>
            ) : (
              <div className="remote-configuration__targets">
                {snapshot.remotes.map((remote) => (
                  <label key={remote.name} className="hosting-checkbox remote-configuration__target">
                    <input
                      type="checkbox"
                      aria-label={tr(`Push-Ziel ${remote.name}`, `Push target ${remote.name}`)}
                      checked={selected.includes(remote.name)}
                      onChange={(event) =>
                        update({
                          ...preferences,
                          pushRemotes: event.target.checked ? [...selected, remote.name] : selected.filter((name) => name !== remote.name),
                        })
                      }
                    />
                    <span>
                      <strong>{remote.name}</strong>
                      <small>
                        {remote.pushUrls[0]}
                        {remote.pushUrls.length > 1 ? tr(` · ${remote.pushUrls.length} Push-URLs`, ` · ${remote.pushUrls.length} push URLs`) : ''}
                      </small>
                    </span>
                  </label>
                ))}
                {selected
                  .filter((name) => !snapshot.remotes.some((remote) => remote.name === name))
                  .map((name) => (
                    <label key={name} className="hosting-checkbox">
                      <input type="checkbox" checked onChange={() => update({ ...preferences, pushRemotes: selected.filter((target) => target !== name) })} />
                      {name} · {tr('nicht mehr vorhanden — abwählen oder Remote wieder verbinden', 'no longer available — deselect or reconnect the remote')}
                    </label>
                  ))}
              </div>
            )}
            {!soleRemote && mode('push')}
            <p className="remote-configuration__effect">
              <strong>
                {tr('Nächster Push', 'Next push')}:{' '}
                {selected.length
                  ? selected.map((name) => `${snapshot.branch || 'HEAD'} → ${name}/${pushDefaults.targetBranches[name] || snapshot.branch || '—'}`).join(' · ')
                  : tr('Mindestens ein Ziel auswählen', 'Choose at least one target')}
              </strong>
              <small>{behavior('push')}</small>
            </p>
            {activeProfileName && (
              <small>
                {tr('Aktives Profil', 'Active profile')}: {activeProfileName}
              </small>
            )}
            <small>
              {tr(
                'Tags werden separat ausgewählt. Ein Backup-Push ändert deinen Upstream nicht.',
                'Tags are selected separately. Pushing to a backup does not change your upstream.',
              )}
            </small>
          </fieldset>
        </section>
      </div>
    </>
  );
}
