import type { GitRemoteSnapshotDto, RemotePreferences, RemoteTransferAction } from '@/types/remoteTransfers';
import { getRemoteTransferDefaults } from '@/utils/remoteTransferSelection';

/** Keep unavailable selections visible so editing the page cannot silently drop a backup target. */
export function remoteConfigurationPushTargets(snapshot: GitRemoteSnapshotDto, preferences: RemotePreferences): string[] {
  const profile = preferences.profiles?.find((candidate) => candidate.id === preferences.activeProfileId);
  const configured = preferences.pushRemotes ?? profile?.remoteNames;
  if (configured?.some((name) => !snapshot.remotes.some((remote) => remote.name === name))) return configured;
  const defaults = getRemoteTransferDefaults('push', snapshot, preferences).selectedRemoteNames;
  return snapshot.remotes.length === 1 ? defaults : (configured ?? defaults);
}

/** Explain incomplete choices before Save; the main process still verifies every persisted endpoint. */
export function remoteConfigurationIssue(
  snapshot: GitRemoteSnapshotDto,
  preferences: RemotePreferences,
  tr: (de: string, en: string) => string,
): string | null {
  for (const action of ['fetch', 'pull', 'push'] satisfies RemoteTransferAction[]) {
    const names =
      action === 'push'
        ? (preferences.pushRemotes ?? preferences.profiles?.find((profile) => profile.id === preferences.activeProfileId)?.remoteNames ?? [])
        : [action === 'fetch' ? preferences.fetchRemote : preferences.pullRemote].filter((name): name is string => Boolean(name));
    const missing = names.find((name) => !snapshot.remotes.some((remote) => remote.name === name));
    if (missing)
      return tr(
        `Das ${action}-Ziel „${missing}“ ist nicht mehr verbunden. Wähle ein gültiges Ziel oder verbinde es erneut.`,
        `The ${action} target “${missing}” is no longer connected. Choose a valid target or reconnect it.`,
      );
    if (preferences.selectionModes?.[action] === 'remember' && !getRemoteTransferDefaults(action, snapshot, preferences).selectedRemoteNames.length) {
      return action === 'push'
        ? tr('Wähle mindestens ein Push-Ziel, um Push ohne Nachfrage zu verwenden.', 'Choose at least one push target to push without prompting.')
        : tr(`Wähle eine ${action}-Quelle, um ${action} ohne Nachfrage zu verwenden.`, `Choose a ${action} source to use ${action} without prompting.`);
    }
  }
  return null;
}
