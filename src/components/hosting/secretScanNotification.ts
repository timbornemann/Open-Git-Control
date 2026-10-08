import type { SecretScanProgressDto, SecretScanPushScopeDto } from '@/types/secretScan';
import type { NotificationMessage } from '@/types/notifications';

export function secretScanFallbackDetail(scope: SecretScanPushScopeDto | undefined, tr: (de: string, en: string) => string): string | undefined {
  if (!scope?.fallbackReasons.length) return undefined;
  const remaining = scope.fallbackReasons.length - 1;
  return `${tr('Vollständige Historienprüfung', 'Full history scan')}: ${scope.fallbackReasons[0]}${remaining ? tr(` · ${remaining} weitere Hinweise in den Prüfdetails`, ` · ${remaining} more explanations in Check details`) : ''}`;
}

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
  const scope = scan?.pushScope;
  const scopeDetail =
    scope?.totalCommits === 0
      ? tr('Keine neuen Commits · Historienprüfung übersprungen', 'No new commits · History scan skipped')
      : scope
        ? tr(
            `${count(scope.totalCommits)} Commits an ${count(scope.endpointCount)} Push-Zielen prüfen`,
            `${count(scope.totalCommits)} commits to check across ${count(scope.endpointCount)} push endpoints`,
          )
        : undefined;
  const counts = knownTotal
    ? tr(`${count(completed)} / ${count(total)} Commits · ${lines}`, `${count(completed)} / ${count(total)} commits · ${lines}`)
    : lines;
  const fallback = secretScanFallbackDetail(scope, tr);
  return {
    msg: messages[phase],
    detail: [counts, scopeDetail, fallback].filter(Boolean).join('\n') || undefined,
    progress: {
      label: knownTotal ? tr('Fortschritt der Commit-Prüfung', 'Commit scan progress') : tr('Fortschritt des Secret-Scans', 'Secret scan progress'),
      value: knownTotal ? Math.floor((completed / total) * 100) : phase === 'complete' ? 100 : null,
    },
  };
}
