import { useI18n } from '@/i18n';
import type { GitPushPlanDto, GitPushBatchDto } from '@/types/remoteTransfers';
import type { SecretScanResultDto } from '@/types/gitDtos';

export function PushTransferReview({
  plan,
  batch,
  scan,
  reviewingRetry,
  force,
  busy,
  executePush,
  retryScan,
  allowlistAndRescan,
  openAllowlist,
}: {
  plan: GitPushPlanDto;
  batch: GitPushBatchDto | null;
  scan: SecretScanResultDto | null;
  reviewingRetry: boolean;
  force: boolean;
  busy: boolean;
  executePush: (approve?: boolean) => void;
  retryScan: () => void;
  allowlistAndRescan?: () => void;
  openAllowlist?: () => void;
}) {
  const { tr } = useI18n();
  return (
    <div className="hosting-card">
      <strong>{reviewingRetry ? tr('Geprüfte Wiederholung', 'Reviewed retry') : tr('Geprüfter Push-Plan', 'Reviewed push plan')}</strong>
      <p>
        {tr('Quellbranch', 'Source branch')}: <strong>{plan.branch}</strong> · <code title={plan.sourceOid}>{plan.sourceOid.slice(0, 12)}</code>
      </p>
      {plan.targets
        .filter(
          (target) =>
            !reviewingRetry ||
            (!target.grouped && batch?.targets.some((result) => result.id === target.id && !['success', 'up-to-date'].includes(result.status))),
        )
        .map((target) => (
          <p key={target.id}>
            {target.remoteName} → {target.destinationRef}
            <small>{target.url}</small>
          </p>
        ))}
      {plan.targets.some((target) => target.grouped) && (
        <p>
          {tr(
            'Dieses Git unterstützt keine einzelnen Push-URLs: alle Endpunkte desselben Remote werden als Gruppe gepusht. Force und gezielte Wiederholung erfordern getrennte Remotes oder ein Git-Update.',
            'This Git cannot address individual push URLs: all endpoints of the same remote are pushed as a group. Force and targeted retry require separate remotes or a Git update.',
          )}
        </p>
      )}
      {scan?.findings.length ? (
        <>
          <p className="hosting-error">
            {tr('Secret-Scan hat Treffer gefunden:', 'Secret scan found matches:')} {scan.findings.length}
          </p>
          <ul>
            {scan.findings.map((finding) => (
              <li key={finding.id}>
                {finding.filePath}:{finding.lineNumber} · {finding.ruleId}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {scan?.findings.length && allowlistAndRescan ? (
        <button disabled={busy || scan.historyScanIncomplete} onClick={allowlistAndRescan}>
          {tr('Dateien allowlisten und erneut prüfen', 'Allowlist files and check again')}
        </button>
      ) : null}
      {openAllowlist && (
        <button disabled={busy} onClick={openAllowlist}>
          {tr('Allowlist bearbeiten', 'Edit allowlist')}
        </button>
      )}
      {scan?.historyScanIncomplete && (
        <p className="hosting-error" role="alert">
          {tr(
            'Die Push-Historie konnte nicht vollständig auf Secrets geprüft werden. Der Push wurde noch nicht ausgeführt. Starte die Prüfung erneut; bei einem weiteren Fehler stehen die Einzelheiten unter „Prüfdetails“.',
            'The push history could not be fully checked for secrets. Nothing has been pushed yet. Retry the check; if it fails again, see Check details.',
          )}
        </p>
      )}
      {scan?.notes.length ? (
        <details>
          <summary>{tr('Prüfdetails', 'Check details')}</summary>
          {scan.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </details>
      ) : null}
      {scan?.historyScanIncomplete && (
        <button disabled={busy} onClick={retryScan}>
          {tr('Erneut prüfen', 'Retry check')}
        </button>
      )}
      <button disabled={busy || scan?.historyScanIncomplete === true} onClick={() => executePush(Boolean(scan?.findings.length))}>
        {scan?.findings.length
          ? force
            ? tr('Treffer geprüft & Force-with-lease bestätigen', 'Matches reviewed & confirm force with lease')
            : tr('Treffer geprüft: trotzdem auf diese Ziele pushen', 'Matches reviewed: push to these targets anyway')
          : force
            ? tr('Force-with-lease bestätigen', 'Confirm force with lease')
            : tr('Auf diese Ziele pushen', 'Push to these targets')}
      </button>
    </div>
  );
}
