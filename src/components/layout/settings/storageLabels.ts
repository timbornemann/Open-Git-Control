import type { StorageCategory } from '@/shared/ipc/storageMaintenance';
type Translate = (de: string, en: string) => string;
export function storageCategoryLabel(category: StorageCategory, tr: Translate): string {
  const labels: Record<StorageCategory, [string, string]> = {
    previews: ['Vorschauen', 'Previews'],
    analytics: ['Repository-Analysen', 'Repository analytics'],
    statistics: ['Commit-Statistiken', 'Commit statistics'],
    http: ['HTTP-Cache', 'HTTP cache'],
    code: ['Code-Caches', 'Code caches'],
    auxiliary: ['Hosting, Logos & Grafik-Caches', 'Hosting, logos & graphics caches'],
    metadata: ['Repository-Zuordnungen', 'Repository associations'],
    temporary: ['Temporäre Arbeitsdateien', 'Temporary work files'],
    protected: ['Geschützte App-Daten', 'Protected app data'],
    unknown: ['Unbekannte / unklare Daten', 'Unknown / unclear data'],
    updates: ['Update-Installationsdateien', 'Update installers'],
    recovery: ['Wiederherstellungsjournale & Sicherungsreferenzen', 'Recovery journals & backup references'],
  };
  return tr(...labels[category]);
}
export function storageReasonLabel(reason: string, tr: Translate): string {
  const reasons: Record<string, [string, string]> = {
    missing: ['Repository fehlt; Beobachtungsfrist läuft', 'Repository missing; observation period is running'],
    unreachable: ['Laufwerk oder Ordner nicht erreichbar; Fehlensfrist zurückgesetzt', 'Drive or folder unreachable; missing period reset'],
    invalid: ['Keine gültige Git-Struktur; keine automatische Entfernung', 'Invalid Git structure; no automatic removal'],
    'git-unavailable': ['Git nicht verfügbar; Fehlensfrist zurückgesetzt', 'Git unavailable; missing period reset'],
    'missing-90-days': ['Repository seit 90 Tagen bestätigt fehlend', 'Repository confirmed missing for 90 days'],
    'in-use-or-recovery': ['Aktive Nutzung oder benötigter Verweis', 'Active use or required reference'],
    'open-recovery-operation': ['Offener oder unklarer Wiederherstellungsvorgang', 'Open or unclear recovery operation'],
    'completed-recovery-operation': ['Abgeschlossene Wiederherstellungssicherung; nur manuell entfernbar', 'Completed recovery backup; explicit removal only'],
    'cache-unused': ['Cache 30 Tage ohne Nutzung', 'Cache unused for 30 days'],
    'cache-budget': ['Cache-Budget überschritten', 'Cache budget exceeded'],
    'cache-cleared': ['Wiederherstellbarer Cache geleert', 'Rebuildable cache cleared'],
    'cache-location-changed': ['Cache nach Repository-Umzug ungültig', 'Cache invalid after repository relocation'],
    'return-period-expired': ['Rückkehrfrist von 30 Tagen abgelaufen', '30-day return period expired'],
    'in-use': ['Aktiver Schreib- oder Lesevorgang; zurückgestellt', 'Active writer or reader; deferred'],
    'in-use-or-unsupported': ['Aktiv oder Format nicht unterstützt; erhalten', 'Active or unsupported format; preserved'],
    'changed-during-inspection': ['Während der Prüfung verändert; zurückgestellt', 'Changed during inspection; deferred'],
    'unsupported-format': ['Beschädigtes oder nicht unterstütztes Format; erhalten', 'Damaged or unsupported format; preserved'],
    'unrecognized-data': ['Unbekannte Daten; erhalten', 'Unknown data; preserved'],
    'redirected-path': ['Symlink oder Junction; erhalten', 'Symlink or junction; preserved'],
    'inventory-failed': ['Speicherbereich konnte nicht gelesen werden; erhalten', 'Storage area could not be read; preserved'],
    'metadata-unreadable': ['Zuordnungsdatei nicht lesbar; Bereinigung gesperrt', 'Association file unreadable; cleanup blocked'],
    'active-temporary-workspace': [
      'Temporäre Arbeit aktiv oder Aufbewahrungsfrist läuft; geschützt',
      'Temporary work active or retention period running; protected',
    ],
  };
  return reasons[reason] ? tr(...reasons[reason]) : reason;
}
export function formatStorageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}
