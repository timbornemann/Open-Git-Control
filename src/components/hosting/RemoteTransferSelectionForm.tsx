import { useState } from 'react';
import { useI18n } from '@/i18n';
import type { RemoteSelectionMode } from '@/types/remoteTransfers';
import type { RemoteTransferSelection, RemoteTransferState } from './remoteTransferState';

export function RemoteTransferSelectionForm({
  state,
  tags,
  choose,
}: {
  state: RemoteTransferState;
  tags: string[];
  choose: (selection: RemoteTransferSelection, mode: RemoteSelectionMode) => void;
}) {
  const { tr } = useI18n();
  const [selection, setSelection] = useState(state.selection);
  const [profileId, setProfileId] = useState(state.preferences.activeProfileId ?? '');
  const { intent, snapshot } = state;
  if (!snapshot || !intent || !snapshot.remotes.length)
    return (
      <p>
        {tr(
          'Noch keine Remotes eingerichtet. Eine Verbindung auf der Konfigurationsseite ergänzen.',
          'No remotes configured. Add a connection on the configuration page.',
        )}
      </p>
    );
  const pushing = intent.mode === 'push';
  if (state.reason === 'no-branch')
    return (
      <p className="hosting-error">
        {tr(
          'Für Push oder Pull zuerst einen lokalen Branch auschecken. Der aktuelle Stand ist keinem Branch zugeordnet.',
          'Check out a local branch before pushing or pulling. The current checkout has no branch.',
        )}
      </p>
    );
  const chooseRemote = (remote: string) => {
    const branch =
      intent.mode === 'pull' && state.preferences.pullRemote === remote && state.preferences.pullBranches?.[snapshot.branch]
        ? state.preferences.pullBranches[snapshot.branch]
        : snapshot.upstream?.remote === remote
          ? snapshot.upstream.branch
          : snapshot.branch;
    setSelection({ ...selection, selectedRemoteNames: [remote], branch });
  };
  const valid =
    selection.selectedRemoteNames.length > 0 && (intent.mode === 'fetch' || Boolean(selection.branch)) && (!intent.selectTags || selection.tagNames.length > 0);
  return (
    <div className="hosting-form">
      <p>
        {tr('Aktueller Branch:', 'Current branch:')} <strong>{snapshot.branch || 'HEAD'}</strong>
      </p>
      {state.reason === 'selection-invalid' && (
        <p className="hosting-error">
          {tr(
            'Die gespeicherte Auswahl wurde durch eine Remote- oder Kontoänderung ungültig. Ziele erneut auswählen.',
            'A remote or account change invalidated the saved selection. Select the targets again.',
          )}
        </p>
      )}
      {pushing ? (
        <>
          {snapshot.remotes.map((remote) => (
            <label className="hosting-checkbox" key={remote.name}>
              <input
                type="checkbox"
                checked={selection.selectedRemoteNames.includes(remote.name)}
                disabled={Boolean(intent.constrainedRemoteNames)}
                onChange={(event) => {
                  setProfileId('');
                  setSelection({
                    ...selection,
                    selectedRemoteNames: event.target.checked
                      ? [...selection.selectedRemoteNames, remote.name]
                      : selection.selectedRemoteNames.filter((name) => name !== remote.name),
                  });
                }}
              />
              <span>
                <strong>{remote.name}</strong>
                {remote.pushUrls.map((url) => (
                  <small key={url}>{url}</small>
                ))}
              </span>
            </label>
          ))}
          {!intent.constrainedRemoteNames && (
            <label>
              {tr('Push-Profil', 'Push profile')}
              <select
                value={profileId}
                onChange={(event) => {
                  setProfileId(event.target.value);
                  const profile = state.preferences.profiles?.find((candidate) => candidate.id === event.target.value);
                  if (profile)
                    setSelection({
                      ...selection,
                      selectedRemoteNames: profile.remoteNames,
                      branch: snapshot.branch,
                      targetBranches: Object.fromEntries(
                        profile.remoteNames.map((name) => [name, profile.targetBranches?.[name] || profile.destinationBranch || snapshot.branch]),
                      ),
                    });
                  else
                    setSelection({
                      ...selection,
                      selectedRemoteNames: snapshot.defaultPushRemote
                        ? [snapshot.defaultPushRemote]
                        : snapshot.remotes.length === 1
                          ? [snapshot.remotes[0].name]
                          : [],
                      branch: snapshot.branch,
                      targetBranches: {},
                    });
                }}
              >
                <option value="">{tr('Einmalige Auswahl', 'One-time selection')}</option>
                {state.preferences.profiles?.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      ) : (
        <label>
          {intent.mode === 'pull' ? tr('Pull-Remote', 'Pull remote') : tr('Fetch-Remote', 'Fetch remote')}
          <select value={selection.selectedRemoteNames[0] ?? ''} onChange={(event) => chooseRemote(event.target.value)}>
            <option value="">{tr('Quelle auswählen', 'Select source')}</option>
            {snapshot.remotes.map((remote) => (
              <option key={remote.name}>{remote.name}</option>
            ))}
          </select>
        </label>
      )}
      {intent.mode !== 'fetch' && (
        <label>
          {pushing ? tr('Zielbranch', 'Destination branch') : tr('Remote-Branch', 'Remote branch')}
          <input
            value={selection.branch}
            disabled={Boolean(intent.destinationBranch)}
            onChange={(event) => {
              setProfileId('');
              setSelection({ ...selection, branch: event.target.value });
            }}
          />
        </label>
      )}
      {pushing &&
        !intent.constrainedRemoteNames &&
        selection.selectedRemoteNames.map((name) => (
          <label key={name}>
            {tr(`Zielbranch für ${name}`, `Destination branch for ${name}`)}
            <input
              value={selection.targetBranches[name] ?? ''}
              placeholder={selection.branch}
              onChange={(event) => {
                setProfileId('');
                setSelection({ ...selection, targetBranches: { ...selection.targetBranches, [name]: event.target.value } });
              }}
            />
          </label>
        ))}
      {intent.selectTags && (
        <fieldset>
          <legend>{tr('Tags ausdrücklich auswählen', 'Explicitly select tags')}</legend>
          {tags.map((tag) => (
            <label className="hosting-checkbox" key={tag}>
              <input
                type="checkbox"
                checked={selection.tagNames.includes(tag)}
                onChange={(event) =>
                  setSelection({
                    ...selection,
                    tagNames: event.target.checked ? [...selection.tagNames, tag] : selection.tagNames.filter((name) => name !== tag),
                  })
                }
              />
              {tag}
            </label>
          ))}
        </fieldset>
      )}
      <div className="hosting-actions">
        {intent.constrainedRemoteNames ? (
          <button disabled={!valid || state.busy} onClick={() => choose(selection, 'ask')}>
            {tr('Ausführen', 'Execute')}
          </button>
        ) : (
          <>
            <button disabled={!valid || state.busy} onClick={() => choose({ ...selection, ...(pushing ? { profileId: profileId || null } : {}) }, 'remember')}>
              {tr('Speichern und ausführen', 'Save and execute')}
            </button>
            <button disabled={!valid || state.busy} onClick={() => choose({ ...selection, ...(pushing ? { profileId: profileId || null } : {}) }, 'ask')}>
              {tr('Jedes Mal fragen', 'Ask every time')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
