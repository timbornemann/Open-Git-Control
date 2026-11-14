import type { ReactNode } from 'react';
import { AlertTriangle, ListFilter, LockKeyhole, RefreshCw, ShieldAlert, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SecretScanFindings } from '@/components/repository-security/SecretScanFindings';
import { useI18n } from '@/i18n';
import type { SecretScanResultDto } from '@/types/gitDtos';
import './pushSecretScanReview.css';

export function PushSecretScanReview({
  scan,
  force,
  busy,
  reviewingRetry,
  executePush,
  retryScan,
  allowlistAndRescan,
  openAllowlist,
  children,
}: {
  scan: SecretScanResultDto;
  force: boolean;
  busy: boolean;
  reviewingRetry: boolean;
  executePush: (approve?: boolean) => void;
  retryScan: () => void;
  allowlistAndRescan?: () => void;
  openAllowlist?: () => void;
  children: ReactNode;
}) {
  const { tr } = useI18n();
  const fileCount = new Set(scan.findings.map((finding) => finding.filePath)).size;
  const blocked = busy || scan.historyScanIncomplete === true;
  return (
    <div className="push-secret-review">
      <div className="push-secret-review__summary" role="status">
        <ShieldAlert size={25} aria-hidden="true" />
        <div>
          <h4>
            {tr(
              `${scan.findings.length} ${scan.findings.length === 1 ? 'mögliches Secret' : 'mögliche Secrets'} in ${fileCount} ${fileCount === 1 ? 'Datei' : 'Dateien'}`,
              `${scan.findings.length} possible ${scan.findings.length === 1 ? 'secret' : 'secrets'} in ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`,
            )}
          </h4>
          <p>
            {reviewingRetry
              ? tr('Die verbleibenden Push-Ziele wurden noch nicht ausgeführt.', 'The remaining push targets have not been pushed yet.')
              : tr(
                  'Es wurde noch nichts gepusht. Prüfe die Fundstellen, bevor du fortfährst.',
                  'Nothing has been pushed yet. Review the findings before continuing.',
                )}
          </p>
        </div>
      </div>

      {children}

      <div className="push-secret-review__section-label">
        <h4>{tr('Fundstellen', 'Findings')}</h4>
        <span>
          <LockKeyhole size={12} aria-hidden="true" />
          {tr('Secret-Werte sind verborgen', 'Secret values are hidden')}
        </span>
      </div>
      <SecretScanFindings findings={scan.findings} />

      <div className="push-secret-review__fix">
        <Wrench size={17} aria-hidden="true" />
        <div>
          <strong>{tr('Echtes Secret? Zuerst beheben.', 'Real secret? Fix it first.')}</strong>
          <p>
            {tr(
              'Entferne es aus den betroffenen Commits und pushe danach erneut. Ein neuer Commit allein entfernt es nicht aus der Historie.',
              'Remove it from the affected commits, then push again. A new commit alone does not remove it from history.',
            )}
          </p>
        </div>
      </div>

      {scan.historyScanIncomplete && (
        <div className="push-secret-review__incomplete" role="alert">
          <strong>{tr('Prüfung unvollständig', 'Check incomplete')}</strong>
          <p>
            {tr('Die gesamte Push-Historie muss geprüft werden, bevor du fortfahren kannst.', 'The full push history must be checked before you can continue.')}
          </p>
          <Button icon={<RefreshCw size={14} aria-hidden="true" />} disabled={busy} onClick={retryScan}>
            {tr('Erneut prüfen', 'Retry check')}
          </Button>
        </div>
      )}

      <div className="push-secret-review__choices" aria-label={tr('Weitere Aktionen', 'Other actions')}>
        {(allowlistAndRescan || openAllowlist) && (
          <section className="push-secret-review__choice">
            <h4>
              <ListFilter size={15} aria-hidden="true" />
              {tr('Fehlalarm oder Testdaten?', 'False positive or test data?')}
            </h4>
            <p>
              {tr('Die Allowlist nimmt ganze Dateien dauerhaft von künftigen Scans aus.', 'The allowlist permanently excludes entire files from future scans.')}
            </p>
            <div className="push-secret-review__choice-buttons">
              {allowlistAndRescan && (
                <Button disabled={blocked} onClick={allowlistAndRescan}>
                  {tr(
                    `${fileCount} ${fileCount === 1 ? 'Datei' : 'Dateien'} ausnehmen & ${force ? 'prüfen' : 'pushen'}`,
                    `Allowlist ${fileCount} ${fileCount === 1 ? 'file' : 'files'} & ${force ? 'recheck' : 'push'}`,
                  )}
                </Button>
              )}
              {openAllowlist && (
                <Button variant="ghost" disabled={busy} onClick={openAllowlist}>
                  {tr('Allowlist bearbeiten', 'Edit allowlist')}
                </Button>
              )}
            </div>
            {allowlistAndRescan && (
              <span className="push-secret-review__choice-note">
                {force
                  ? tr('Danach erneut prüfen und Force-with-lease bestätigen.', 'Then recheck and confirm force with lease.')
                  : tr('Prüft erneut und pusht, wenn keine weiteren Treffer vorliegen.', 'Rechecks and pushes if no further matches are found.')}
              </span>
            )}
          </section>
        )}
        <section className="push-secret-review__choice push-secret-review__choice--risk">
          <h4>
            <AlertTriangle size={15} aria-hidden="true" />
            {tr('Nur diesen Push freigeben', 'Allow this push only')}
          </h4>
          <p>
            {tr(
              'Die gefundenen Inhalte werden mit übertragen. Es wird keine dauerhafte Ausnahme gespeichert.',
              'The detected content will also be transferred. No permanent exception is saved.',
            )}
          </p>
          <Button variant="danger" disabled={blocked} onClick={() => executePush(true)}>
            {force ? tr('Trotzdem Force-with-lease bestätigen', 'Confirm force with lease anyway') : tr('Trotzdem pushen', 'Push anyway')}
          </Button>
        </section>
      </div>

      {scan.notes.length > 0 && (
        <details className="push-secret-review__details">
          <summary tabIndex={0}>{tr('Prüfdetails', 'Check details')}</summary>
          {scan.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </details>
      )}
    </div>
  );
}
