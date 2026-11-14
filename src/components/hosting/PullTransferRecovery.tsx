import { useI18n } from '@/i18n';
import { AlertTriangle, FolderOpen, GitBranch, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { GitPullRecoveryDto, RemoteTransferOperations } from '@/types/remoteTransfers';
import './pullTransferRecovery.css';

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
  const missingBranch = recovery && !recovery.branchExists;
  const branchAvailable = recovery?.branchExists;
  const defaultBranch = missingBranch ? recovery.defaultBranch : null;
  const mode =
    failedPull.mode === 'rebase'
      ? 'Rebase'
      : failedPull.mode === 'merge'
        ? 'Merge'
        : failedPull.mode === 'ff-only'
          ? 'Fast-forward only'
          : failedPull.mode === 'no-ff'
            ? 'Merge (no fast-forward)'
            : tr('Git-Konfiguration', 'Git configuration');
  return (
    <section className="pull-recovery">
      <div className="pull-recovery__heading">
        <AlertTriangle size={23} aria-hidden="true" />
        <div>
          <h4>
            {branchAvailable
              ? tr('Pull-Quelle wieder verfügbar', 'Pull source available again')
              : recovery
                ? tr('Remote-Branch nicht gefunden', 'Remote branch not found')
                : tr('Pull wurde unterbrochen', 'Pull was interrupted')}
          </h4>
          <p>{tr('Prüfe den nächsten Schritt, bevor du den Pull wiederholst.', 'Review the next step before retrying the pull.')}</p>
        </div>
      </div>
      <dl className="pull-recovery__source">
        <div>
          <dt>{tr('Pull-Quelle', 'Pull source')}</dt>
          <dd>
            <code>
              {failedPull.remote}/{failedPull.branch}
            </code>
          </dd>
        </div>
        <div>
          <dt>{tr('Pull-Modus', 'Pull strategy')}</dt>
          <dd>{mode}</dd>
        </div>
      </dl>
      <p className="pull-recovery__explanation">
        {branchAvailable
          ? tr(
              'Der Branch ist inzwischen wieder auf dem Remote verfügbar. Du kannst den Pull erneut versuchen.',
              'The branch is available on the remote again. You can retry the pull.',
            )
          : missingBranch
            ? tr(
                'Nach dem Merge eines Pull Requests kann der Remote-Branch gelöscht werden. Dein lokaler Branch und seine Commits bleiben erhalten. Wechsle zum Standardbranch und führe dort Pull aus.',
                'A remote branch can be deleted after merging a pull request. Your local branch and its commits are preserved. Switch to the default branch and pull there.',
              )
            : tr(
                'Lokale Änderungen und Konflikte im Arbeitsbereich prüfen. Die Wiederholung verwendet dieselbe Quelle und denselben Pull-Modus.',
                'Inspect local changes and conflicts in the workspace. Retry uses the same source and pull strategy.',
              )}
      </p>
      <div className="pull-recovery__next">
        {branchAvailable ? (
          <RefreshCw size={19} aria-hidden="true" />
        ) : defaultBranch ? (
          <GitBranch size={19} aria-hidden="true" />
        ) : (
          <FolderOpen size={19} aria-hidden="true" />
        )}
        <div>
          <h4>
            {branchAvailable
              ? tr('Quelle ist wieder erreichbar', 'Source is available again')
              : defaultBranch
                ? tr('Auf einem vorhandenen Branch weiterarbeiten', 'Continue on an existing branch')
                : tr('Arbeitsstand zuerst prüfen', 'Check the working state first')}
          </h4>
          {missingBranch && !defaultBranch && (
            <p>
              {tr(
                'Der Standardbranch konnte nicht sicher ermittelt werden. Wähle einen vorhandenen Branch im Arbeitsbereich.',
                'The default branch could not be determined safely. Select an existing branch in the workspace.',
              )}
            </p>
          )}
          {defaultBranch && (
            <p>{tr('Wechselt zum Standardbranch. Führe den Pull anschließend dort aus.', 'Switches to the default branch. Run the pull there afterwards.')}</p>
          )}
          {!recovery && (
            <p>
              {tr(
                'Öffne die Dateien, sichere offene Änderungen oder löse vorhandene Konflikte.',
                'Open the files, save uncommitted changes or resolve existing conflicts.',
              )}
            </p>
          )}
          <Button variant="primary" disabled={busy} onClick={branchAvailable ? () => retry(failedPull) : defaultBranch ? switchToDefault : openWorkspace}>
            {branchAvailable
              ? tr('Diese Pull-Quelle erneut versuchen', 'Retry this pull source')
              : defaultBranch
                ? tr(`Zu ${defaultBranch.name} wechseln`, `Switch to ${defaultBranch.name}`)
                : tr('Arbeitsbereich öffnen', 'Open workspace')}
          </Button>
        </div>
      </div>
      {branchAvailable || defaultBranch ? (
        <Button variant="ghost" disabled={busy} icon={<FolderOpen size={14} aria-hidden="true" />} onClick={openWorkspace}>
          {tr('Arbeitsbereich öffnen', 'Open workspace')}
        </Button>
      ) : !recovery ? (
        <div className="pull-recovery__alternative">
          <p>
            {tr(
              'Arbeitsstand bereits geprüft? Mit derselben Quelle und demselben Modus erneut versuchen.',
              'Already checked the working state? Retry with the same source and strategy.',
            )}
          </p>
          <Button disabled={busy} icon={<RefreshCw size={14} aria-hidden="true" />} onClick={() => retry(failedPull)}>
            {tr('Diese Pull-Quelle erneut versuchen', 'Retry this pull source')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
