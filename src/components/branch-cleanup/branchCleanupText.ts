import type { BranchCleanupReason } from '@/shared/ipc/branchCleanup';

type Translate = (de: string, en: string) => string;
export function branchCleanupReasonText(reason: BranchCleanupReason, tr: Translate) {
  const labels: Record<BranchCleanupReason['code'], string> = {
    merged: tr('Im Vergleichsziel enthalten', 'Contained in the comparison target'),
    'merged-request': tr('Über bestätigten Pull-/Merge-Request übernommen', 'Integrated through a verified pull/merge request'),
    'upstream-gone': tr('Zugeordneter Upstream wurde auf dem Server entfernt', 'Tracked upstream was removed on the server'),
    'remote-removed': tr('Das konfigurierte Remote wurde entfernt', 'The configured remote was removed'),
    inactive: tr(
      'Seit mindestens 90 Tagen ohne Commit, ohne lokale Zuordnung und offenen Request',
      'No commit for at least 90 days, no local counterpart or open request',
    ),
    'not-candidate': tr('Noch nicht zusammengeführt; kein verwaister Branch nachgewiesen', 'Not merged; no evidence of an orphaned branch'),
    'manual-review': tr(
      'Keine Zusammenführung nachgewiesen; Löschen nur mit Zusatzbestätigung',
      'No integration could be verified; deletion requires additional confirmation',
    ),
    current: tr('Aktuell ausgecheckter Branch', 'Currently checked-out branch'),
    worktree: tr('Einem Worktree zugeordnet', 'Assigned to a worktree'),
    protected: tr('Geschützter Branch oder Vergleichsziel', 'Protected branch or comparison target'),
    'open-request': tr('Wird von einem offenen Pull-/Merge-Request verwendet', 'Used by an open pull/merge request'),
    operation: tr('Im Repository läuft ein Git-Vorgang', 'A Git operation is in progress'),
    'incomplete-history': tr('Die Historie lässt keine vollständige Prüfung zu', 'History does not allow a complete inspection'),
    'missing-target': tr('Ein Vergleichsziel muss gewählt werden', 'A comparison target must be selected'),
    'remote-unavailable': tr('Der Server-Bestand konnte nicht vollständig geprüft werden', 'The server inventory could not be fully inspected'),
    'unknown-protection': tr('Schutzregeln oder offene Requests sind nicht zuverlässig geprüft', 'Protection rules or open requests could not be verified'),
    'endpoint-isolation': tr('Dieses Git kann das Server-Ziel nicht einzeln ansprechen', 'This Git cannot isolate the server endpoint'),
    'local-work': tr('Das lokale Gegenstück wird gerade verwendet', 'The local counterpart is in use'),
    'planner-work': tr('Einer laufenden Planner-Aufgabe zugeordnet', 'Assigned to an ongoing planner task'),
  };
  return reason.detail && reason.code !== 'inactive' ? `${labels[reason.code]}: ${reason.detail}` : labels[reason.code];
}

export function branchCleanupMessage(message: string, tr: Translate) {
  const labels: Record<string, string> = {
    changed: tr('Der geprüfte Stand hat sich geändert. Bitte erneut prüfen.', 'The inspected state changed. Inspect again.'),
    expired: tr('Diese Prüfung ist abgelaufen oder nicht mehr gültig. Bitte erneut prüfen.', 'This inspection expired or is no longer valid. Inspect again.'),
    cancelled: tr('Abgebrochen; keine weiteren Löschungen gestartet.', 'Cancelled; no further deletions started.'),
    'server-not-deleted': tr(
      'Das ausgewählte Server-Gegenstück wurde nicht nachweislich gelöscht. Der lokale Branch bleibt erhalten.',
      'The selected server counterpart was not confirmed deleted. The local branch was kept.',
    ),
    deleted: tr('Branch gelöscht', 'Branch deleted'),
  };
  return labels[message] ?? message;
}

export function branchCleanupPhase(phase: string, tr: Translate) {
  const [key, ...detail] = phase.split(':');
  const labels: Record<string, string> = {
    checking: tr('Repository und Löschschutz prüfen …', 'Checking repository and deletion safeguards …'),
    remotes: tr('Remote-Daten abrufen …', 'Refreshing remote data …'),
    branches: tr('Branches auswerten …', 'Analyzing branches …'),
    deleting: tr('Bestätigte Auswahl bereinigen …', 'Cleaning up the confirmed selection …'),
  };
  return `${labels[key] ?? labels.checking}${detail.length ? ` ${detail.join(':').trim()}` : ''}`;
}
