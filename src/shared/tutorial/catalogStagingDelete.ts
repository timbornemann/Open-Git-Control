import type { TutorialChapter } from './types';
import {
  scopeStep as s,
  scopeRecipe as seed,
  stagingControl as c,
  stagingRow as row,
  dialog,
  confirmDialog,
  cancelDialog,
  modifiedScopeFiles,
  tree,
  element,
} from './stagingLessonHelpers';
const file = row('untracked', 'notes.txt');
const remove = `${file} ${c('delete-untracked-file')}`;
export const TUTORIAL_STAGING_DELETE: TutorialChapter = {
  id: 'staging-delete',
  section: 'repo',
  title: ['Neue Dateien: Löschen bewusst bestätigen', 'New files: confirm deletion deliberately'],
  description: [
    'Den Unterschied zwischen Verwerfen und Löschen einer unversionierten Datei mit Abbrechen und Bestätigen üben.',
    'Practice the difference between discarding edits and deleting an untracked file, including Cancel and Confirm.',
  ],
  question: ['Wie lösche ich eine neue, noch unversionierte Datei?', 'How do I delete a new, untracked file?'],
  keywords: 'delete löschen untracked unversioniert neue datei wiederherstellen abbrechen cancel',
  steps: [
    s(
      'overview',
      ['Für neue Dateien gibt es noch keinen Git-Stand', 'New files have no saved Git version yet'],
      [
        'notes.txt ist neu und unversioniert. Git hat ihren Inhalt noch nicht in einem Commit gespeichert. Das rote x in diesem Bereich löscht die Datei aus dem Arbeitsordner; es ist eine andere Aktion als Verwerfen bei bekannten Dateien.',
        'notes.txt is new and untracked. Git has not saved its contents in a commit. The red x in this section deletes it from the working directory; this differs from Discard on tracked files.',
      ],
      file,
      { continue: false },
    ),
    s(
      'button',
      ['Achte auf die Löschbeschriftung', 'Check the delete label'],
      [
        'Die Zeile enthält Plus zum Vormerken und das rote x zum Löschen. Die Beschriftung des x lautet hier Datei löschen. Wir öffnen zuerst den Dialog und brechen ab.',
        'The row has plus for staging and a red x for deleting. Here the x is labeled Delete file. First we open the dialog and cancel.',
      ],
      remove,
    ),
    s(
      'open-delete',
      ['Öffne den Löschdialog', 'Open deletion confirmation'],
      [
        'Klicke das rote x bei notes.txt unter Unversioniert. Bis zur Bestätigung bleibt die Datei erhalten.',
        'Click the red x beside notes.txt under Untracked. The file is preserved until confirmation.',
      ],
      remove,
      { completion: element(dialog) },
    ),
    s(
      'warning',
      ['Prüfe Pfad und fehlende Git-Sicherung', 'Review the path and lack of a Git backup'],
      [
        'Der Dialog nennt notes.txt und den Status Unversioniert. Weil Git noch keinen gespeicherten Inhalt besitzt, kann es diese Datei nach dem Löschen nicht einfach wiederherstellen. Die Übung betrifft ausschließlich Beispieldaten.',
        'The dialog names notes.txt and its Untracked status. Since Git has no saved contents, it cannot simply restore this file after deletion. This exercise affects sample data only.',
      ],
      dialog,
      { prepare: seed({ submit: remove }) },
    ),
    s(
      'cancel-delete',
      ['Brich das Löschen ab', 'Cancel deletion'],
      ['Klicke Abbrechen. notes.txt soll im Bereich Unversioniert bleiben.', 'Click Cancel. notes.txt should remain in Untracked.'],
      cancelDialog,
      { prepare: seed({ submit: remove }), completion: { kind: 'absent', selector: dialog } },
    ),
    s(
      'preserved',
      ['Die Datei ist unverändert vorhanden', 'The file remains unchanged'],
      [
        'Der Abbruch hat notes.txt erhalten. Auch die zweite neue Datei docs/ideas.md, die geänderten Dateien und der Index bleiben unverändert.',
        'Canceling preserved notes.txt. The other new file docs/ideas.md, modified files and index are also unchanged.',
      ],
      file,
    ),
    s(
      'reopen-delete',
      ['Öffne die Bestätigung erneut', 'Reopen confirmation'],
      [
        'Klicke das rote x bei notes.txt noch einmal. Prüfe erneut den Dateinamen und bestätige dann im nächsten Schritt.',
        'Click the red x beside notes.txt again. Review the name, then confirm in the next step.',
      ],
      remove,
      { completion: element(dialog) },
    ),
    s(
      'confirm-delete',
      ['Lösche nur notes.txt', 'Delete notes.txt only'],
      [
        'Bestätige Datei löschen. notes.txt soll aus dem Arbeitsordner verschwinden. docs/ideas.md soll weiterhin neu sein; die anderen Änderungen und der Index bleiben erhalten.',
        'Confirm Delete file. notes.txt should disappear from the working directory. docs/ideas.md must remain untracked; other changes and the index are preserved.',
      ],
      confirmDialog,
      { prepare: seed({ submit: remove }), completion: tree(['src/app.ts'], modifiedScopeFiles, ['docs/ideas.md'], { absent: ['notes.txt'] }) },
    ),
    s(
      'result',
      ['Die Auswahl war auf eine Datei begrenzt', 'The selection affected one file'],
      [
        'Im Bereich Unversioniert bleibt docs/ideas.md. Das Löschen hat keine anderen Dateien entfernt. Ein erneuter Start dieser Lektion stellt das feste Beispiel wieder her; bei echten unversionierten Dateien ist das keine Git-Wiederherstellung.',
        'docs/ideas.md remains in Untracked. Deletion removed no other files. Restarting this lesson restores its fixed sample; that is not a Git recovery mechanism for real untracked files.',
      ],
      row('untracked', 'docs/ideas.md'),
      { prepare: seed({ deleted: ['notes.txt'] }) },
    ),
    s(
      'finish',
      ['Ignorieren lässt die Datei im Arbeitsordner', 'Ignoring keeps the file in the working directory'],
      [
        'Du hast die Löschbestätigung abgebrochen und gezielt bestätigt. Die nächsten Lektionen erklären Ignore-Regeln: Damit bleiben passende unversionierte Dateien im Ordner und werden aus der Git-Auswahl ausgeblendet.',
        'You canceled deletion and then confirmed a specific file. The next lessons explain ignore rules: matching untracked files remain in the folder and are hidden from Git’s selection.',
      ],
      undefined,
      { prepare: seed({ deleted: ['notes.txt'] }) },
    ),
  ],
};
