import type { TutorialChapter } from './types';
import { branchControl as c, branchElement as element } from './branchLessonHelpers';
import { stagingRow, tree } from './stagingLessonHelpers';
import { graphRow, historyViewer as viewer } from './historyLessonHelpers';
import {
  stashStep as s,
  ordinaryStashRecipe,
  ordinaryName,
  ordinaryEntry as entry,
  ordinaryAction as action,
  ordinaryFile as file,
  stashMessage,
  stashConfirm,
  stashCancel,
  emptyStashes,
  type StashStage,
} from './stashLessonHelpers';
const seed = (stage: StashStage = 'start', stashes = false, files = false, named = false, diff = false) =>
  ordinaryStashRecipe({ scope: 'all', stage, stashes, files, ...(named ? { name: ordinaryName('all') } : {}), ...(diff ? { diff: 'unstaged' } : {}) });
const returned = tree([], ['README.md'], ['notes.txt'], {
  content: [
    { path: 'README.md', source: 'index', value: { example: 'history-readme', version: 'latest' } },
    { path: 'README.md', source: 'worktree', value: { example: 'history-readme', version: 'work' } },
    { path: 'notes.txt', source: 'worktree', value: { example: 'tree-files', version: 'note' } },
  ],
});
export const TUTORIAL_STASH_ALL: TutorialChapter = {
  id: 'stash-all',
  section: 'repo',
  title: ['Alle Änderungen sichern und mit Pop zurückholen', 'Save all changes and bring them back with Pop'],
  description: [
    'Erfasse auch neue Dateien, prüfe den sauberen Arbeitsstand und hole das Arbeitspaket mit anschließend entfernter Sicherung zurück.',
    'Include new files, inspect the clean working state and restore the work bundle while removing its backup after success.',
  ],
  question: ['Wie sichere ich alle Änderungen einschließlich neuer Dateien?', 'How do I save all changes including new files?'],
  keywords: 'stash all alle gesamte neue dateien untracked pop anwenden sichern index sauber zurückholen',
  steps: [
    s(
      'overview',
      ['Diesmal gehört die gesamte offene Arbeit zusammen', 'This time all uncommitted work belongs together'],
      [
        'README besitzt eine Index- und eine weitere Arbeitsfassung; notes.txt ist neu. Wir sichern diesmal beide Dateien gemeinsam, ohne den Branch zu wechseln oder einen normalen Commit anzulegen.',
        'README has an index version and a further working edit; notes.txt is new. This time we will save both files together without switching branches or creating an ordinary commit.',
      ],
      c('staging'),
      { continue: false, prepare: seed() },
    ),
    s(
      'new-file',
      ['Eine neue Datei braucht die passende Stash-Variante', 'A new file needs the appropriate stash variant'],
      [
        'notes.txt gehört noch nicht zur gespeicherten Historie oder zum Index. Die Aktion Alle Änderungen stashen in dieser App nimmt solche neuen Dateien ausdrücklich mit auf.',
        'notes.txt is not yet in the saved history or index. This app’s Stash all changes action explicitly includes such new files.',
      ],
      stagingRow('untracked', 'notes.txt'),
      { prepare: seed() },
    ),
    s(
      'menu',
      ['Öffne die Aktionen der neuen Notiz', 'Open the new note’s actions'],
      [
        'Öffne das Kontextmenü von notes.txt. Auch von dieser Zeile aus kannst du die Aktion für den gesamten Arbeitsstand auswählen.',
        'Open the context menu of notes.txt. Even from this row you can choose the action for the whole working state.',
      ],
      stagingRow('untracked', 'notes.txt'),
      { prepare: seed(), gesture: 'contextmenu', completion: element(c('stash-all')) },
    ),
    s(
      'scope',
      ['Alle Änderungen überschreitet die ausgewählte Dateizeile', 'All changes goes beyond the selected file row'],
      [
        'Datei stashen würde hier nur notes.txt sichern. Alle Änderungen stashen nimmt zusätzlich die teilweise vorgemerkte README auf. Diese zweite Aktion verwenden wir jetzt.',
        'Stash file would save only notes.txt here. Stash all changes also includes the partially staged README. We will use that second action now.',
      ],
      c('stash-all'),
      { prepare: seed('menu') },
    ),
    s(
      'open',
      ['Öffne den Dialog für das gesamte Arbeitspaket', 'Open the dialog for the whole work bundle'],
      [
        'Wähle Alle Änderungen stashen. Der Dialog soll den Repository-Umfang und die betroffenen Änderungskategorien anzeigen.',
        'Choose Stash all changes. The dialog should show the repository scope and affected change categories.',
      ],
      c('stash-all'),
      { prepare: seed('menu'), completion: element(stashMessage) },
    ),
    s(
      'counts',
      ['Lies die Kategorien vor dem Bestätigen', 'Read the categories before confirming'],
      [
        'Der Dialog zählt versionierte und neue Einträge. README ist sowohl gestagt als auch weiter bearbeitet und wird deshalb in den versionierten Änderungseinträgen zweimal berücksichtigt. Die spätere Dateiliste enthält trotzdem nur README und notes.txt.',
        'The dialog counts tracked and untracked entries. README is staged and further modified, so it contributes twice to the tracked change entries. The later file list still contains only README and notes.txt.',
      ],
      '.dialog-modal',
      { prepare: seed('dialog') },
    ),
    s(
      'name',
      ['Nenne den Stash Arbeitspaket', 'Name the stash Work bundle'],
      [
        'Trage „Arbeitspaket“ in das optionale Nachrichtenfeld ein. Dieser Name hilft später beim Zuordnen der gemeinsamen Sicherung.',
        'Enter “Work bundle” in the optional message field. This name will help identify the combined backup later.',
      ],
      stashMessage,
      { prepare: seed('dialog'), completion: { kind: 'value', selector: stashMessage, value: ordinaryName('all') } },
    ),
    s(
      'cancel',
      ['Probiere Abbrechen vor der gemeinsamen Sicherung', 'Try Cancel before the combined backup'],
      [
        'Wähle Abbrechen. Die eingegebene Beschreibung allein hat noch keine Datei gesichert oder zurückgesetzt.',
        'Choose Cancel. Entering the description alone has not saved or reset any file.',
      ],
      stashCancel,
      { prepare: seed('dialog', false, false, true), completion: { kind: 'absent', selector: '.dialog-modal' } },
    ),
    s(
      'unchanged',
      ['Alle drei Änderungsbereiche sind weiterhin belegt', 'All three change sections still contain work'],
      [
        'Die Index- und Arbeitsfassung der README sowie notes.txt sind unverändert vorhanden. Wir starten den gesamten Vorgang erneut und bestätigen ihn diesmal.',
        'The README index and working versions and notes.txt are still present unchanged. We will start the entire operation again and confirm it this time.',
      ],
      c('staging'),
      { prepare: seed() },
    ),
    s(
      'retry-menu',
      ['Öffne das Notizmenü erneut', 'Open the note menu again'],
      [
        'Öffne erneut das Kontextmenü von notes.txt. Die neue Datei bleibt unser Ausgangspunkt für die repositoryweite Aktion.',
        'Open the context menu of notes.txt again. The new file remains our starting point for the repository-wide action.',
      ],
      stagingRow('untracked', 'notes.txt'),
      { prepare: seed(), gesture: 'contextmenu', completion: element(c('stash-all')) },
    ),
    s(
      'retry-open',
      ['Wähle wieder Alle Änderungen stashen', 'Choose Stash all changes again'],
      [
        'Öffne den Dialog erneut. Vor der Bestätigung kontrollieren wir wieder denselben Umfang.',
        'Open the dialog again. Before confirming, we will review the same scope again.',
      ],
      c('stash-all'),
      { prepare: seed('menu'), completion: element(stashMessage) },
    ),
    s(
      'name-again',
      ['Benenne das bestätigte Arbeitspaket', 'Name the work bundle to be confirmed'],
      [
        'Trage erneut „Arbeitspaket“ ein. Der zuvor abgebrochene Dialog hat noch keine Sicherung dieses Namens angelegt.',
        'Enter “Work bundle” again. The previously cancelled dialog has not created a backup of that name.',
      ],
      stashMessage,
      { prepare: seed('dialog'), completion: { kind: 'value', selector: stashMessage, value: ordinaryName('all') } },
    ),
    s(
      'save',
      ['Bestätige die Sicherung aller Änderungen', 'Confirm saving all changes'],
      [
        'Wähle Alle stashen. Erst wenn alle offenen Einträge einschließlich der neuen Notiz aus dem aktuellen Arbeitsstand verschwunden sind, ist diese Übung erfolgreich.',
        'Choose Stash all. This exercise succeeds once all uncommitted entries, including the new note, have left the current working state.',
      ],
      stashConfirm,
      { prepare: seed('dialog', false, false, true), completion: tree([], [], [], { absent: ['notes.txt'] }) },
    ),
    s(
      'clean',
      ['Der Arbeitsstand ist sauber, die Sicherung bleibt erhalten', 'The working state is clean and the backup remains'],
      [
        'README zeigt wieder die gespeicherte Welt-Begrüßung und notes.txt liegt nicht mehr im aktuellen Arbeitsordner. Beide Fassungen sind im Stash gesichert. main bleibt am bisherigen Commit.',
        'README again contains the saved world greeting and notes.txt is no longer in the current working directory. Both file versions are saved in the stash. main remains at its previous commit.',
      ],
      c('staging'),
      { prepare: seed('saved') },
    ),
    s(
      'open-stashes',
      ['Öffne die gemeinsame Sicherung', 'Open the combined backup'],
      [
        'Klappe Stashes auf. Dort soll das gerade bestätigte Arbeitspaket erscheinen.',
        'Expand Stashes. The work bundle you just confirmed should appear there.',
      ],
      c('stash-panel-toggle'),
      { prepare: seed('saved'), completion: element(entry) },
    ),
    s(
      'files',
      ['Zeige die gesicherten Dateinamen', 'Show the saved filenames'],
      [
        'Wähle Dateien am Arbeitspaket. Diese Liste soll auch die beim Sichern eingeschlossene neue Notiz enthalten.',
        'Choose Files on the work bundle. The list should include the new note captured by the backup.',
      ],
      action('files'),
      { prepare: seed('saved', true), completion: element(file('notes.txt')) },
    ),
    s(
      'both-files',
      ['README und neue Notiz sind gemeinsam gesichert', 'README and the new note are saved together'],
      [
        'Die Liste enthält genau README.md und notes.txt. Das Sichern aller Änderungen war also nicht auf die Notizzeile begrenzt, aus deren Menü du gestartet bist.',
        'The list contains exactly README.md and notes.txt. Saving all changes was therefore not limited to the note row whose menu you started from.',
      ],
      entry + ' .stash-file-list',
      { prepare: seed('saved', true, true) },
    ),
    s(
      'hide-files',
      ['Klappe die Dateiliste zu', 'Collapse the file list'],
      [
        'Wähle Dateien ausblenden. Das schließt die Leseansicht und lässt den Sicherungseintrag unangetastet.',
        'Choose Hide files. This closes the read-only list and leaves the backup entry untouched.',
      ],
      action('files'),
      { prepare: seed('saved', true, true), completion: { kind: 'absent', selector: entry + ' .stash-file-list' } },
    ),
    s(
      'pop-choice',
      ['Pop verbindet Anwenden und Entfernen nach Erfolg', 'Pop combines applying and removal after success'],
      [
        'Gewöhnliches Anwenden behält die Sicherung. Pop wendet das Arbeitspaket an und entfernt den ausgewählten Stash bei Erfolg. Wir wählen Pop und kontrollieren anschließend Dateien und Stapel.',
        'Ordinary Apply retains the backup. Pop applies the work bundle and removes the selected stash after success. We will choose Pop and then inspect the files and stack.',
      ],
      action('pop'),
      { prepare: seed('saved', true) },
    ),
    s(
      'pop',
      ['Hole das Arbeitspaket mit Pop zurück', 'Bring the work bundle back with Pop'],
      [
        'Wähle Pop. README und notes.txt sollen zurückkehren und die erfolgreich angewendete Sicherung soll verschwinden.',
        'Choose Pop. README and notes.txt should return and the successfully applied backup should disappear.',
      ],
      action('pop'),
      { prepare: seed('saved', true), completion: { kind: 'all', conditions: [returned, element(emptyStashes)] } },
    ),
    s(
      'returned',
      ['Die vorhandene README kehrt als Arbeitsänderung zurück', 'The existing README returns as a working edit'],
      [
        'README steht unter Änderungen; ihr Index entspricht wieder dem gespeicherten Commit. Gewöhnliches Pop rekonstruiert hier nicht automatisch die frühere teilweise Vormerkung.',
        'README appears under Changes; its index again matches the saved commit. Ordinary Pop does not automatically reconstruct its former partial staging here.',
      ],
      c('staging'),
      { prepare: seed('popped') },
    ),
    s(
      'note-returned',
      ['Die neue Notiz ist wieder unversioniert', 'The new note is untracked again'],
      [
        'notes.txt ist wieder im Arbeitsordner vorhanden und weiterhin neu. Die Aufnahme in einen Stash war kein normales Hinzufügen zum Index oder zu einem Commit.',
        'notes.txt is back in the working directory and remains untracked. Including it in a stash was not ordinary staging or committing.',
      ],
      c('untracked-files'),
      { prepare: seed('popped') },
    ),
    s(
      'open-diff',
      ['Prüfe die zurückgekehrte README', 'Inspect the restored README'],
      [
        'Öffne README unter Änderungen. Wir vergleichen den tatsächlich zurückgebrachten Inhalt mit dem gespeicherten Ausgangsstand.',
        'Open README under Changes. We will compare the contents actually restored against the saved starting revision.',
      ],
      stagingRow('unstaged', 'README.md'),
      { prepare: seed('popped'), completion: element(viewer('unstaged')) },
    ),
    s(
      'read-diff',
      ['Die Team-Begrüßung ist vollständig zurück', 'The team greeting has returned in full'],
      [
        'Der Diff ersetzt die gespeicherte Welt-Begrüßung durch Team. Zusammen mit der neuen Notiz bestätigt dies den wiederhergestellten Arbeitsinhalt.',
        'The diff replaces the saved world greeting with team. Together with the new note, this confirms the restored working contents.',
      ],
      viewer('unstaged'),
      { prepare: seed('popped', false, false, false, true) },
    ),
    s(
      'close-diff',
      ['Schließe die Inhaltskontrolle', 'Close the content inspection'],
      [
        'Schließe den Viewer mit X. Die zurückgebrachten Dateien bleiben offen und uncommittet.',
        'Close the viewer with X. The restored files remain uncommitted.',
      ],
      c('close-file'),
      { prepare: seed('popped', false, false, false, true), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'backup-removed',
      ['Die erfolgreich angewendete Sicherung ist entfernt', 'The successfully applied backup has been removed'],
      [
        'Die Stash-Liste ist leer. Pop hat den Eintrag nach dem erfolgreichen Anwenden entfernt. Das ist der Unterschied zum gewöhnlichen Anwenden der vorherigen Lektion.',
        'The stash list is empty. Pop removed the entry after successful application. This differs from ordinary Apply in the previous lesson.',
      ],
      emptyStashes,
      { prepare: seed('popped') },
    ),
    s(
      'history',
      ['main enthält weiterhin den ursprünglichen Commit', 'main still points to the original commit'],
      [
        'Die Sicherungsobjekte gehören nach dem entfernten Stash-Verweis nicht mehr zur sichtbaren Gesamthistorie. Die zurückgebrachte Arbeit ist weiterhin offen; ein normaler neuer Commit wurde nicht angelegt.',
        'After removing the stash reference, the backup objects no longer belong to visible all history. The restored work remains uncommitted; no ordinary new commit was created.',
      ],
      graphRow(4),
      { prepare: seed('popped') },
    ),
    s(
      'finish',
      ['Du kannst ein gesamtes Arbeitspaket sichern und zurückholen', 'You can save and restore a whole work bundle'],
      [
        'Du hast den Umfang einschließlich neuer Dateien geprüft, abgebrochen, gemeinsam gesichert, die Liste kontrolliert und Pop mit anschließendem Ergebnisvergleich verwendet. Weiter beendet diese Lektion.',
        'You inspected the scope including new files, cancelled, saved the bundle, checked the list and used Pop with an outcome comparison. Next completes this lesson.',
      ],
      c('staging'),
      { prepare: seed('popped') },
    ),
  ],
};
