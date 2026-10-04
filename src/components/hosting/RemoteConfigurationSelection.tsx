import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import type { GitRemoteSnapshotDto, RemotePreferences, RemoteSelectionMode, RemoteTransferAction } from '@/types/remoteTransfers';

type Props = {
  snapshot: GitRemoteSnapshotDto;
  preferences: RemotePreferences;
  update: (next: RemotePreferences) => void;
  disabled: boolean;
  setUpstream: (remote: string, branch: string) => void;
};
export function RemoteConfigurationSelection({ snapshot, preferences, update, disabled, setUpstream }: Props) {
  const { tr } = useI18n();
  const [profileName, setProfileName] = useState(preferences.profiles?.find((profile) => profile.id === preferences.activeProfileId)?.name ?? '');
  const activeProfile = preferences.profiles?.find((profile) => profile.id === preferences.activeProfileId);
  useEffect(() => {
    setProfileName(activeProfile?.name ?? '');
  }, [activeProfile?.id, activeProfile?.name]);
  const [mappingBranch, setMappingBranch] = useState(snapshot.branch);
  const selected = preferences.pushRemotes ?? [];
  const pullBranch = preferences.pullBranches?.[mappingBranch] ?? '';
  const pushBranches = preferences.pushBranches?.[mappingBranch] ?? {};
  const upstreamBranch =
    preferences.pullBranches?.[snapshot.branch] ||
    (snapshot.upstream && snapshot.upstream.remote === preferences.pullRemote ? snapshot.upstream.branch : snapshot.branch);
  const mode = (action: RemoteTransferAction) => (
    <label>
      {tr('Auswahl bei mehreren Remotes', 'Selection with multiple remotes')}
      <select
        aria-label={`${action} ${tr('Auswahlmodus', 'selection mode')}`}
        disabled={disabled}
        value={preferences.selectionModes?.[action] ?? 'ask'}
        onChange={(event) => update({ ...preferences, selectionModes: { ...preferences.selectionModes, [action]: event.target.value as RemoteSelectionMode } })}
      >
        <option value="ask">{tr('Bei jeder Übertragung fragen', 'Ask for each transfer')}</option>
        <option value="remember">{tr('Diese Auswahl verwenden', 'Use this selection')}</option>
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
        <option value="">{tr('Noch nicht festgelegt', 'Not configured')}</option>
        {snapshot.remotes.map((remote) => (
          <option value={remote.name} key={remote.name}>
            {remote.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="remote-configuration__section">
      <h2>{tr('Auswahlregeln', 'Selection rules')}</h2>
      <p>
        {tr(
          'Fetch, Pull und Push verwenden unabhängige Regeln. Hintergrund-Fetch verwendet bei „Fragen“ die Git-Standardquelle.',
          'Fetch, pull and push use independent rules. Background fetch uses the Git default source when set to ask.',
        )}
      </p>
      <div className="remote-configuration__rules">
        <fieldset disabled={disabled}>
          <legend>Fetch</legend>
          {source('fetch')}
          {mode('fetch')}
        </fieldset>
        <fieldset disabled={disabled}>
          <legend>Pull</legend>
          {source('pull')}
          {mode('pull')}
          <button
            type="button"
            disabled={disabled || !preferences.pullRemote || !snapshot.branch}
            onClick={() => preferences.pullRemote && setUpstream(preferences.pullRemote, upstreamBranch)}
          >
            {tr('Als Upstream setzen', 'Set as upstream')}
          </button>
          {preferences.pullRemote && (
            <small>
              {snapshot.branch} → {preferences.pullRemote}/{upstreamBranch}
            </small>
          )}
        </fieldset>
        <fieldset disabled={disabled}>
          <legend>Push</legend>
          {snapshot.remotes.map((remote) => (
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
          ))}
          {mode('push')}
        </fieldset>
      </div>
      <h3>{tr('Branch-Zuordnungen', 'Branch mappings')}</h3>
      <p>{tr('Beim Wechsel der Pull-Quelle werden deren Branch-Zuordnungen zurückgesetzt.', 'Changing the pull source clears its branch mappings.')}</p>
      <p>
        {tr(
          'Ohne Zuordnung verwendet Pull den Upstream-Branch und Push den Namen des lokalen Branches.',
          'Without a mapping, pull uses the upstream branch and push uses the local branch name.',
        )}
      </p>
      <div className="hosting-form">
        <label>
          {tr('Lokaler Branch', 'Local branch')}
          <input
            aria-label={tr('Lokaler Branch', 'Local branch')}
            value={mappingBranch}
            disabled={disabled}
            onChange={(event) => setMappingBranch(event.target.value)}
            list="remote-config-mapping-branches"
          />
        </label>
        <datalist id="remote-config-mapping-branches">
          {[...new Set([snapshot.branch, ...Object.keys(preferences.pullBranches ?? {}), ...Object.keys(preferences.pushBranches ?? {})])]
            .filter(Boolean)
            .map((branch) => (
              <option key={branch} value={branch} />
            ))}
        </datalist>
        <label>
          {tr('Pull-Branch auf der gewählten Quelle', 'Pull branch on the selected source')}
          <input
            disabled={disabled || !mappingBranch}
            value={pullBranch}
            placeholder={snapshot.upstream && snapshot.upstream.remote === preferences.pullRemote ? snapshot.upstream.branch : mappingBranch}
            onChange={(event) => {
              const mappings = { ...preferences.pullBranches };
              if (event.target.value) mappings[mappingBranch] = event.target.value;
              else delete mappings[mappingBranch];
              update({ ...preferences, pullBranches: mappings });
            }}
          />
        </label>
        {selected.map((name) => (
          <label key={name}>
            {tr(`Push-Branch auf ${name}`, `Push branch on ${name}`)}
            <input
              disabled={disabled || !mappingBranch}
              value={pushBranches[name] ?? ''}
              placeholder={mappingBranch}
              onChange={(event) => {
                const targets = { ...pushBranches };
                if (event.target.value) targets[name] = event.target.value;
                else delete targets[name];
                update({ ...preferences, pushBranches: { ...preferences.pushBranches, [mappingBranch]: targets } });
              }}
            />
          </label>
        ))}
      </div>
      <h3>{tr('Push-Profile', 'Push profiles')}</h3>
      <p>
        {tr(
          'Profile speichern Ziele und Branch-Zuordnungen. Tags und Force-Push werden pro Übertragung ausgewählt.',
          'Profiles save targets and branch mappings. Tags and force push are selected for each transfer.',
        )}
      </p>
      <label>
        {tr('Aktives Profil', 'Active profile')}
        <select
          disabled={disabled}
          value={preferences.activeProfileId ?? ''}
          onChange={(event) => {
            const profile = preferences.profiles?.find((candidate) => candidate.id === event.target.value);
            setProfileName(profile?.name ?? '');
            update({
              ...preferences,
              activeProfileId: profile?.id,
              ...(profile
                ? {
                    pushRemotes: profile.remoteNames,
                    pushBranches: {
                      ...preferences.pushBranches,
                      [snapshot.branch]:
                        profile.targetBranches ?? Object.fromEntries(profile.remoteNames.map((name) => [name, profile.destinationBranch || snapshot.branch])),
                    },
                  }
                : {}),
            });
          }}
        >
          <option value="">{tr('Kein Profil', 'No profile')}</option>
          {preferences.profiles?.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </label>
      <div className="hosting-actions">
        <input
          aria-label={tr('Profilname', 'Profile name')}
          placeholder={tr('Profilname', 'Profile name')}
          value={profileName}
          onChange={(event) => setProfileName(event.target.value)}
          disabled={disabled}
        />
        <button
          type="button"
          disabled={disabled || !profileName.trim() || !selected.length}
          onClick={() => {
            const profile = {
              id: crypto.randomUUID(),
              name: profileName.trim(),
              remoteNames: [...selected],
              targetBranches: { ...(preferences.pushBranches?.[snapshot.branch] ?? {}) },
            };
            update({ ...preferences, profiles: [...(preferences.profiles ?? []), profile], activeProfileId: profile.id });
            setProfileName('');
          }}
        >
          {tr('Auswahl als Profil hinzufügen', 'Add selection as profile')}
        </button>
        <button
          type="button"
          disabled={disabled || !preferences.activeProfileId || !profileName.trim() || !selected.length}
          onClick={() =>
            update({
              ...preferences,
              profiles: preferences.profiles?.map((profile) =>
                profile.id === preferences.activeProfileId
                  ? {
                      id: profile.id,
                      name: profileName.trim(),
                      remoteNames: [...selected],
                      targetBranches: { ...(preferences.pushBranches?.[snapshot.branch] ?? {}) },
                    }
                  : profile,
              ),
            })
          }
        >
          {tr('Profil aktualisieren', 'Update profile')}
        </button>
        <button
          type="button"
          disabled={disabled || !preferences.activeProfileId}
          onClick={() =>
            update({
              ...preferences,
              profiles: preferences.profiles?.filter((profile) => profile.id !== preferences.activeProfileId),
              activeProfileId: undefined,
            })
          }
        >
          {tr('Profil entfernen', 'Remove profile')}
        </button>
      </div>
    </section>
  );
}
