import { useEffect, useRef, useState } from 'react';
import { ActionRequirement } from '@/components/ui/ActionRequirement';
import { useI18n } from '@/i18n';
import type { GitPullConfigurationDto, GitRemoteSnapshotDto, RemotePreferences } from '@/types/remoteTransfers';
import { getRemoteTransferDefaults } from '@/utils/remoteTransferSelection';
import { RemoteConfigurationActions } from './RemoteConfigurationActions';
import { RemoteBranchTracking } from './RemoteBranchTracking';
import { Button } from '@/components/ui/Button';
import { remoteConfigurationPushTargets } from './remoteConfigurationValidation';

type Props = {
  snapshot: GitRemoteSnapshotDto;
  preferences: RemotePreferences;
  pullConfiguration: GitPullConfigurationDto | null;
  update: (next: RemotePreferences) => void;
  disabled: boolean;
  setUpstream: (remote: string, branch: string) => void;
};
function profileRequirement(selected: string[], name: string, tr: (de: string, en: string) => string) {
  if (!selected.length) return tr('Wähle mindestens ein Push-Ziel für das Profil.', 'Choose at least one push target for the profile.');
  if (!name.trim()) return tr('Gib dem Push-Profil einen Namen.', 'Enter a name for the push profile.');
  return null;
}
export function RemoteConfigurationSelection({ snapshot, preferences, pullConfiguration, update, disabled, setUpstream }: Props) {
  const { tr } = useI18n();
  const [profileName, setProfileName] = useState(preferences.profiles?.find((profile) => profile.id === preferences.activeProfileId)?.name ?? '');
  const activeProfile = preferences.profiles?.find((profile) => profile.id === preferences.activeProfileId);
  useEffect(() => {
    setProfileName(activeProfile?.name ?? '');
  }, [activeProfile?.id, activeProfile?.name]);
  const [mappingBranch, setMappingBranch] = useState(snapshot.branch);
  const profileField = useRef<HTMLInputElement>(null);
  const pullDefaults = getRemoteTransferDefaults('pull', snapshot, preferences);
  const selected = remoteConfigurationPushTargets(snapshot, preferences);
  const pullBranch = preferences.pullBranches?.[mappingBranch] ?? '';
  const pushBranches = preferences.pushBranches?.[mappingBranch] ?? {};
  const upstreamBranch = pullDefaults.branch || snapshot.branch;
  return (
    <section className="remote-configuration__section">
      <RemoteConfigurationActions
        snapshot={snapshot}
        preferences={preferences}
        pullConfiguration={pullConfiguration}
        update={update}
        disabled={disabled}
        selected={selected}
        activeProfileName={activeProfile?.name}
      />
      <h2>{tr('Erweiterte Einstellungen', 'Advanced settings')}</h2>
      <p>
        {tr(
          'Für andere Branchnamen, Backup-Profile oder ein neues Branch-Tracking. Für normale Transfers sind diese Einstellungen nicht erforderlich.',
          'For different branch names, backup profiles or new branch tracking. These settings are not required for normal transfers.',
        )}
      </p>
      <details className="remote-configuration__advanced">
        <summary>{tr('Branch-Zuordnungen und Tracking', 'Branch mappings and tracking')}</summary>
        <p>
          {tr(
            'Optional: Nur ändern, wenn ein Remote einen anderen Branchnamen verwenden soll.',
            'Optional: change these only when a remote should use a different branch name.',
          )}
        </p>
        <p>{tr('Beim Wechsel der Pull-Quelle werden deren Branch-Zuordnungen zurückgesetzt.', 'Changing the pull source clears its branch mappings.')}</p>
        <p>
          {tr(
            'Leere Felder verwenden den Git-Standard: Pull nutzt den Tracking-Branch der gewählten Quelle, sonst den lokalen Branchnamen. Push nutzt den lokalen Branchnamen. Deine Zuordnungen gelten nach „Speichern“.',
            'Empty fields use Git defaults: pull uses the tracking branch for the selected source, otherwise the local branch name. Push uses the local branch name. Mappings apply after Save.',
          )}
        </p>
        <div className="remote-configuration__fields">
          <label>
            {tr('Lokaler Branch', 'Local branch')}
            <input
              className="ui-field ui-field--sm"
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
              className="ui-field ui-field--sm"
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
                className="ui-field ui-field--sm"
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
        <RemoteBranchTracking snapshot={snapshot} remote={pullDefaults.remote} targetBranch={upstreamBranch} disabled={disabled} setUpstream={setUpstream} />
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
        <p>
          {tr(
            'Beispiel: „Hauptserver & Backup“ lädt auf zwei Remotes. Wähle das Profil hier und nutze für Push „Diese Auswahl direkt verwenden“, um es bei normalen Pushes wiederzuverwenden.',
            'Example: “Main server & backup” uploads to two remotes. Select the profile here and choose Use this selection directly for push to reuse it for normal pushes.',
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
            className="ui-field ui-field--sm"
            ref={profileField}
            aria-label={tr('Profilname', 'Profile name')}
            placeholder={tr('Profilname', 'Profile name')}
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            disabled={disabled}
          />
          <ActionRequirement
            reason={disabled ? null : profileRequirement(selected, profileName, tr)}
            remedy={!profileName.trim() ? { label: tr('Profil benennen', 'Name profile'), onClick: () => profileField.current?.focus() } : undefined}
          >
            <Button
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
            </Button>
          </ActionRequirement>
          <Button
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
          </Button>
          <Button
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
          </Button>
        </div>
      </details>
    </section>
  );
}
