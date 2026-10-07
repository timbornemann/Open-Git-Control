import type { SecretScanProgressDto } from '@/types/secretScan';
import type { NotificationMessage } from '@/types/notifications';

/** Percentage describes the known commit pass; setup and validation stay indeterminate. */
export function secretScanNotification(
  scan: SecretScanProgressDto | undefined,
  tr: (de: string, en: string) => string,
): Pick<NotificationMessage, 'msg' | 'detail' | 'progress'> {
  const phase = scan?.phase ?? 'preparing';
  const messages: Record<SecretScanProgressDto['phase'], string> = {
    preparing: tr('Secret-Scan wird vorbereitet …', 'Preparing secret scan …'),
    staged: tr('Secret-Scan · Staging prüfen', 'Secret scan · Checking staged changes'),
    history: tr('Secret-Scan · Commits prüfen', 'Secret scan · Checking commits'),
    tags: tr('Secret-Scan · Tag-Commits prüfen', 'Secret scan · Checking tag commits'),
    lfs: tr('Secret-Scan · LFS-Inhalte prüfen', 'Secret scan · Checking LFS content'),
    verifying: tr('Secret-Scan · Abschlussprüfung', 'Secret scan · Final checks'),
    complete: tr('Secret-Scan abgeschlossen', 'Secret scan completed'),
  };
  const count = (value: number) => tr(value.toLocaleString('de-DE'), value.toLocaleString('en-US'));
  const lines = scan ? tr(`${count(scan.checkedLines)} Zeilen geprüft`, `${count(scan.checkedLines)} lines checked`) : undefined;
  const total = scan?.totalCommits ?? 0;
  const knownTotal = (phase === 'history' || phase === 'tags') && total > 0;
  const completed = Math.min(total, Math.max(0, scan?.processedCommits ?? 0));
  return {
    msg: messages[phase],
    detail: knownTotal ? tr(`${count(completed)} / ${count(total)} Commits · ${lines}`, `${count(completed)} / ${count(total)} commits · ${lines}`) : lines,
    progress: {
      label: knownTotal ? tr('Fortschritt der Commit-Prüfung', 'Commit scan progress') : tr('Fortschritt des Secret-Scans', 'Secret scan progress'),
      value: knownTotal ? Math.floor((completed / total) * 100) : phase === 'complete' ? 100 : null,
    },
  };
}
