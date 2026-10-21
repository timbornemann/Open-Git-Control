import type { UntrackBlockReason, UntrackScopeOption } from '@/shared/ipc/untrackFiles';
type Translate = (de: string, en: string) => string;

export function untrackScopeText(option: UntrackScopeOption, tr: Translate): string {
  switch (option.kind) {
    case 'file':
      return tr(`Datei: ${option.value}`, `File: ${option.value}`);
    case 'directory':
      return tr(`Ordner: ${option.value}/`, `Folder: ${option.value}/`);
    case 'topDirectory':
      return tr(`Oberster Ordner: ${option.value}/`, `Top-level folder: ${option.value}/`);
    case 'extension':
      return tr(`Dateityp im gesamten Repository: *${option.value}`, `File type throughout the repository: *${option.value}`);
  }
}

export function untrackBlockText(reason: UntrackBlockReason, tr: Translate): string {
  switch (reason) {
    case 'indexOnly':
      return tr(
        'Nur gestagt vorhandener Inhalt. Zuerst sichern oder mit der Arbeitsdatei abgleichen.',
        'Content exists only in staging. Save it or reconcile it with the working file first.',
      );
    case 'conflict':
      return tr('Datei hat ungelöste Konflikte.', 'File has unresolved conflicts.');
    case 'submodule':
      return tr('Submodule werden hier nicht entfernt.', 'Submodules cannot be untracked here.');
    case 'unsupported':
      return tr('Dieser Indexeintrag kann nicht sicher entfernt werden.', 'This index entry cannot be safely untracked.');
    case 'unreadable':
      return tr('Arbeitsdatei ist nicht sicher lesbar.', 'Working file cannot be read safely.');
    case 'tooLarge':
      return tr('Datei ist für diese Inhaltsprüfung zu groß.', 'File is too large for this content inspection.');
  }
}

export function untrackPhaseText(phase: string, tr: Translate): string {
  switch (phase) {
    case 'validate':
      return tr('Auswahl und aktuellen Arbeitsstand erneut prüfen …', 'Rechecking selection and current working state …');
    case 'prepare':
      return tr('Entfernung in einer privaten Index-Kopie vorbereiten …', 'Preparing removal in a private index copy …');
    case 'publish':
      return tr('Geprüfte Indexänderung übernehmen …', 'Publishing the verified index change …');
    default:
      return tr('Versionierte Dateien, Ignorierregeln und Inhalte prüfen …', 'Checking tracked files, ignore rules and contents …');
  }
}

export function untrackErrorText(error: string, tr: Translate): string {
  const messages: Record<string, string> = {
    'Repository changed. Inspect the files again.': tr(
      'Das Repository hat sich geändert. Bitte erneut prüfen.',
      'Repository changed. Inspect the files again.',
    ),
    'Too many matching files. Choose a smaller folder or a single file.': tr(
      'Zu viele passende Dateien. Bitte einen kleineren Ordner oder eine einzelne Datei wählen.',
      'Too many matching files. Choose a smaller folder or a single file.',
    ),
    'This preview belongs to another window or repository.': tr(
      'Die Vorschau gehört zu einem anderen Fenster oder Repository. Bitte erneut prüfen.',
      'This preview belongs to another window or repository. Inspect again.',
    ),
    'The selection contains an unavailable file.': tr(
      'Die Auswahl enthält eine gesperrte oder nicht mehr verfügbare Datei. Bitte erneut prüfen.',
      'The selection contains a blocked or unavailable file. Inspect again.',
    ),
    'Git operation was aborted.': tr('Abgebrochen. Die Entfernung wurde nicht übernommen.', 'Cancelled. The removal was not published.'),
    'The operation was aborted': tr('Abgebrochen. Die Entfernung wurde nicht übernommen.', 'Cancelled. The removal was not published.'),
    'The Git index changed outside the lock. Your draft was kept.': tr(
      'Ein anderer Prozess hat den Index geändert. Die Entfernung wurde nicht übernommen. Bitte erneut prüfen.',
      'Another process changed the index. The removal was not published. Inspect again.',
    ),
    'Incomplete or unsupported Git response.': tr(
      'Die Git-Antwort ist unvollständig oder nicht unterstützt. Es wurde nichts entfernt.',
      'The Git response is incomplete or unsupported. No files were untracked.',
    ),
    'Incomplete Git index response.': tr(
      'Der Git-Index konnte nicht vollständig gelesen werden. Es wurde nichts entfernt.',
      'The Git index could not be read completely. No files were untracked.',
    ),
    'Cannot determine the current branch and HEAD.': tr(
      'Branch und HEAD konnten nicht sicher ermittelt werden. Bitte erneut prüfen.',
      'Cannot determine the current branch and HEAD. Inspect again.',
    ),
  };
  if (error.startsWith('The Git index is busy.'))
    return tr(
      'Der Git-Index ist belegt. Die andere Git-Aktion abschließen und erneut prüfen.',
      'The Git index is busy. Finish the other Git operation and inspect again.',
    );
  return messages[error] ?? error;
}
