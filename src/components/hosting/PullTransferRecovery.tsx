import { useI18n } from '@/i18n';
import type { GitPullRecoveryDto, RemoteTransferOperations } from '@/types/remoteTransfers';

type Input = RemoteTransferOperations['pull']['input'];
export function PullTransferRecovery({
  failedPull,
  busy,
  retry,
  openWorkspace,
  recovery,
  switchToDefault,
}: {
  failedPull: Input;
  busy: boolean;
  retry: (input: Input) => void;
  openWorkspace: () => void;
  recovery: GitPullRecoveryDto | null;
  switchToDefault: () => void;
}) {
  const { tr } = useI18n();
  if (recovery)
    return (
      <div className="hosting-card">
        <strong>
          {tr('Remote-Branch nicht gefunden', 'Remote branch not found')}: {failedPull.remote}/{failedPull.branch}
        </strong>
        <p>
          {recovery.branchExists
            ? tr(
                'Der Branch ist inzwischen wieder auf dem Remote verfügbar. Du kannst den Pull erneut versuchen.',
                'The branch is available on the remote again. You can retry the pull.',
              )
            : tr(
                'Nach dem Merge eines Pull Requests kann der Remote-Branch gelöscht werden. Dein lokaler Branch und seine Commits bleiben erhalten. Wechsle zum Standardbranch und führe dort Pull aus.',
                'A remote branch can be deleted after merging a pull request. Your local branch and its commits are preserved. Switch to the default branch and pull there.',
              )}
        </p>
        {recovery.branchExists ? (
          <button disabled={busy} onClick={() => retry(failedPull)}>
            {tr('Diese Pull-Quelle erneut versuchen', 'Retry this pull source')}
          </button>
        ) : recovery.defaultBranch ? (
          <button disabled={busy} onClick={switchToDefault}>
            {tr(`Zu ${recovery.defaultBranch.name} wechseln`, `Switch to ${recovery.defaultBranch.name}`)}
          </button>
        ) : (
          <p>
            {tr(
              'Der Standardbranch konnte nicht sicher ermittelt werden. Wähle einen vorhandenen Branch im Arbeitsbereich.',
              'The default branch could not be determined safely. Select an existing branch in the workspace.',
            )}
          </p>
        )}
        <button disabled={busy} onClick={openWorkspace}>
          {tr('Arbeitsbereich öffnen', 'Open workspace')}
        </button>
      </div>
    );
  return (
    <div className="hosting-card">
      <strong>
        {tr('Pull wurde unterbrochen', 'Pull was interrupted')}: {failedPull.remote}/{failedPull.branch}
      </strong>
      <p>
        {tr(
          'Lokale Änderungen und Konflikte im Arbeitsbereich prüfen. Die Wiederholung verwendet dieselbe Quelle und denselben Pull-Modus.',
          'Inspect local changes and conflicts in the workspace. Retry uses the same source and pull strategy.',
        )}
      </p>
      <button disabled={busy} onClick={() => retry(failedPull)}>
        {tr('Diese Pull-Quelle erneut versuchen', 'Retry this pull source')}
      </button>
      <button onClick={openWorkspace}>{tr('Arbeitsbereich öffnen', 'Open workspace')}</button>
    </div>
  );
}
