import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import type { GitRemoteSnapshotDto, RemotePreferences } from '@/types/remoteTransfers';
import { getRemoteTransferDefaults, resolveRemoteTransferSelection } from '@/utils/remoteTransferSelection';
import { RemoteConfigurationActions } from './RemoteConfigurationActions';

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
  const pullDefaults = getRemoteTransferDefaults('pull', snapshot, preferences);
  const pushDefaults = resolveRemoteTransferSelection('push', snapshot, preferences);
  const selected = preferences.pushRemotes ?? pushDefaults.selectedRemoteNames;
  const pullBranch = preferences.pullBranches?.[mappingBranch] ?? '';
  const pushBranches = preferences.pushBranches?.[mappingBranch] ?? {};
  const upstreamBranch = pullDefaults.branch || snapshot.branch;
  return (
    <section className="remote-configuration__section">
      <RemoteConfigurationActions
        snapshot={snapshot}
        preferences={preferences}
        update={update}
        disabled={disabled}
        selected={selected}
        activeProfileName={activeProfile?.name}
      />
      <details className="remote-configuration__advanced">
        <summary>{tr('Andere Zielbranches und Upstream', 'Different destination branches and upstream')}</summary>
        <p>
          {tr(
            'Optional: Nur ändern, wenn ein Remote einen anderen Branchnamen verwenden soll.',
            'Optional: change these only when a remote should use a different branch name.',
          )}
        </p>
        <div className="hosting-actions">
          <button
            type="button"
            disabled={disabled || !pullDefaults.remote || !snapshot.branch}
            onClick={() => pullDefaults.remote && setUpstream(pullDefaults.remote, upstreamBranch)}
          >
            {tr('Als Upstream setzen', 'Set as upstream')}
          </button>
          {pullDefaults.remote && (
            <small>
              {snapshot.branch} → {pullDefaults.remote}/{upstreamBranch}
            </small>
          )}
        </div>
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
              placeholder={mappingBranch === snapshot.branch ? pullDefaults.branch : mappingBranch}
              onChange={(event) => {
                const mappings = { ...preferences.pullBranches };
                if (event.target.value) mappings[mappingBranch] = event.target.value;
                else delete mappings[mappingBranch];
                update({ ...preferences, pullRemote: pullDefaults.remote, pullBranches: mappings });
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
      </details>
      <details className="remote-configuration__advanced">
        <summary>
          {tr('Push-Profile', 'Push profiles')}
          {preferences.profiles?.length ? ` (${preferences.profiles.length})` : ''}
        </summary>
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
      </details>
    </section>
  );
}
