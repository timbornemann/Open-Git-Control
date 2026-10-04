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
}: {
  plan: GitPushPlanDto;
  batch: GitPushBatchDto | null;
  scan: SecretScanResultDto | null;
  reviewingRetry: boolean;
  force: boolean;
  busy: boolean;
  executePush: (approve?: boolean) => void;
}) {
  const { tr } = useI18n();
  return (
    <div className="hosting-card">
      <strong>{reviewingRetry ? tr('Geprüfte Wiederholung', 'Reviewed retry') : tr('Geprüfter Push-Plan', 'Reviewed push plan')}</strong>
      <code>{plan.sourceOid}</code>
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
      {scan?.notes.map((note) => (
        <p key={note}>{note}</p>
      ))}
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
