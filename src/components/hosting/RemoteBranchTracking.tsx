import { Button } from '@/components/ui/Button';
import { ActionRequirement } from '@/components/ui/ActionRequirement';
import { useI18n } from '@/i18n';
import type { GitRemoteSnapshotDto } from '@/types/remoteTransfers';

export function RemoteBranchTracking({
  snapshot,
  remote,
  targetBranch,
  disabled,
  setUpstream,
}: {
  snapshot: GitRemoteSnapshotDto;
  remote?: string;
  targetBranch: string;
  disabled: boolean;
  setUpstream: (remote: string, branch: string) => void;
}) {
  const { tr } = useI18n();
  const reason = !remote
    ? tr('Wähle zuerst eine Pull-Quelle.', 'Choose a pull source first.')
    : !snapshot.branch
      ? tr('Wechsle zuerst auf einen lokalen Branch; Detached HEAD hat keinen Upstream.', 'Switch to a local branch first; detached HEAD has no upstream.')
      : null;
  return (
    <div className="remote-configuration__upstream">
      <strong>{tr('Branch-Tracking (Upstream)', 'Branch tracking (upstream)')}</strong>
      <p>
        {tr(
          `Git merkt sich damit die Standardverbindung für ${snapshot.branch || 'HEAD'}. Diese separate Aktion gilt sofort und überträgt keine Commits.`,
          `Git remembers the default connection for ${snapshot.branch || 'HEAD'}. This separate action applies immediately and transfers no commits.`,
        )}
      </p>
      <small>
        {tr('Aktuell', 'Current')}:{' '}
        {snapshot.upstream ? `${snapshot.branch} → ${snapshot.upstream.remote}/${snapshot.upstream.branch}` : tr('Kein Upstream gesetzt', 'No upstream set')}
      </small>
      <div className="hosting-actions">
        <ActionRequirement reason={disabled ? null : reason}>
          <Button disabled={disabled || Boolean(reason)} onClick={() => remote && setUpstream(remote, targetBranch)}>
            {tr('Als Upstream setzen', 'Set as upstream')}
          </Button>
        </ActionRequirement>
        {remote && (
          <small>
            {tr('Neues Tracking', 'New tracking')}: {snapshot.branch} → {remote}/{targetBranch}
          </small>
        )}
      </div>
    </div>
  );
}
