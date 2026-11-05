import type { TutorialChapter } from './types';
import { branchControl as c, branchElement as element } from './branchLessonHelpers';
import { stagingRow, tree } from './stagingLessonHelpers';
import { graphRow, historyViewer as viewer } from './historyLessonHelpers';
import { stashStep as s, ordinaryEntry as entry, ordinaryAction as action, ordinaryFile as file, emptyStashes } from './stashLessonHelpers';
import { stashFilesRecipe as seed } from './stashFilesHelpers';
const tracked = tree(['README.md'], [], [], {
  absent: ['notes.txt'],
  content: [
    { path: 'README.md', source: 'index', value: { example: 'history-readme', version: 'work' } },
    { path: 'README.md', source: 'worktree', value: { example: 'history-readme', version: 'work' } },
  ],
});
const both = tree(['README.md', 'notes.txt'], [], [], {
  content: [
    { path: 'README.md', source: 'index', value: { example: 'history-readme', version: 'work' } },
    { path: 'README.md', source: 'worktree', value: { example: 'history-readme', version: 'work' } },
    { path: 'notes.txt', source: 'index', value: { example: 'tree-files', version: 'note' } },
    { path: 'notes.txt', source: 'worktree', value: { example: 'tree-files', version: 'note' } },
  ],
});
export const TUTORIAL_STASH_FILES: TutorialChapter = {
  id: 'stash-files',
  section: 'repo',
  title: ['Einzelne Dateien aus einer Sicherung übernehmen', 'Restore individual files from a backup'],
  description: [
    'Übernimm die gespeicherte Arbeitsfassung einer Datei und danach eine neue Datei, kontrolliere ihre Vormerkung und entferne die Sicherung bewusst.',
    'Restore a saved working file and then a new file, inspect their staged state and deliberately remove the backup.',
  ],
  question: ['Wie hole ich einzelne Dateien aus einem Stash zurück?', 'How do I restore individual files from a stash?'],
  keywords: 'stash einzeldatei dateien file wiederherstellen übernehmen index vorgemerkt checkout neue datei sicherung',
  steps: [
    s(
      'overview',
      ['Ein frisches Arbeitspaket liegt als Stash bereit', 'A fresh work bundle is ready in Stashes'],
      [
        'Der Arbeitsstand ist sauber. Das vorbereitete Arbeitspaket enthält eine teilweise gestagte README und eine neue notes.txt. Wir übernehmen die Dateien einzeln, damit du den Unterschied zum Anwenden des ganzen Stashes siehst.',
        'The working state is clean. The prepared work bundle contains a partially staged README and a new notes.txt. We will restore the files separately to show how this differs from applying the whole stash.',
      ],
      c('staging'),
      { continue: false, prepare: seed() },
    ),
    s(
      'open-list',
      ['Öffne die gespeicherte Dateiliste', 'Open the saved file list'],
      [
        'Wähle Dateien am Arbeitspaket. Die Liste ist zunächst nur eine Leseansicht; erst Anwenden an einer Zeile übernimmt deren Inhalt.',
        'Choose Files on the work bundle. The list is initially read-only; Apply on a row restores that file’s contents.',
      ],
      action('files'),
      { prepare: seed(), completion: element(file('README.md')) },
    ),
    s(
      'scope',
      ['Jede Dateizeile besitzt eine eigene Übernahme', 'Each file row has its own restore action'],
      [
        'Die Anwenden-Schaltfläche direkt neben README betrifft nur diese Datei. Die Schaltfläche am gesamten Eintrag würde den Stash als Ganzes anwenden. Wir bleiben bei der einzelnen Dateizeile.',
        'The Apply button directly beside README affects only that file. The button on the whole entry would apply the entire stash. We will use the individual file row.',
      ],
      entry + ' .stash-file-list',
      { prepare: seed('files') },
    ),
    s(
      'before-tracked',
      ['Die Einzeldatei-Übernahme befüllt auch den Index', 'Restoring one file also fills the index'],
      [
        'Diese Aktion übernimmt die gespeicherte Arbeitsfassung gleichzeitig in Arbeitsdatei und Index. Sie rekonstruiert nicht die frühere teilweise Vormerkung. Für README wird daher die Team-Begrüßung vollständig vorgemerkt.',
        'This action copies the saved working version into both the working file and index. It does not reconstruct the former partial staging. README’s team greeting will therefore be staged in full.',
      ],
      file('README.md') + ' button',
      { prepare: seed('files') },
    ),
    s(
      'apply-tracked',
      ['Übernimm nur README aus der Sicherung', 'Restore only README from the backup'],
      [
        'Wähle Anwenden direkt an README.md. Die Notiz soll noch in der Sicherung bleiben und nicht im aktuellen Arbeitsordner erscheinen.',
        'Choose Apply directly beside README.md. The note should remain only in the backup and should not yet appear in the working directory.',
      ],
      file('README.md') + ' button',
      { prepare: seed('files'), completion: tracked },
    ),
    s(
      'tracked-result',
      ['README ist vollständig vorgemerkt', 'README is staged in full'],
      [
        'README steht unter Vorgemerkt und hat keine weitere ungestagte Fassung. notes.txt fehlt noch im Arbeitsordner. Die Dateiliste wird nach der Aktion geschlossen und bei erneutem Öffnen frisch gelesen.',
        'README appears under Staged with no further unstaged version. notes.txt is still absent from the working directory. The file list closes after the operation and is read afresh when reopened.',
      ],
      c('staged-files'),
      { prepare: seed('tracked') },
    ),
    s(
      'open-diff',
      ['Prüfe den neu befüllten Index', 'Inspect the newly filled index'],
      [
        'Öffne README unter Vorgemerkt. Der Diff soll den gespeicherten Commit gegen den jetzt vollständig übernommenen Inhalt vergleichen.',
        'Open README under Staged. The diff should compare the saved commit against the contents just restored in full.',
      ],
      stagingRow('staged', 'README.md'),
      { prepare: seed('tracked'), completion: element(viewer('staged')) },
    ),
    s(
      'read-diff',
      ['Die Team-Begrüßung liegt jetzt im Index', 'The team greeting is now in the index'],
      [
        'Welt wird durch Team ersetzt. Die ursprüngliche Staging-Zwischenfassung wurde bei dieser Einzeldatei-Aktion nicht separat zurückgebracht; stattdessen ist der gespeicherte Arbeitsinhalt vollständig vorgemerkt.',
        'World is replaced with team. This single-file action did not separately restore the original intermediate staging version; instead, the saved working contents are staged in full.',
      ],
      viewer('staged'),
      { prepare: seed('tracked', true) },
    ),
    s(
      'close-diff',
      ['Schließe den vorgemerkten Diff', 'Close the staged diff'],
      [
        'Schließe den Viewer mit X. Die vorgemerkte README bleibt erhalten; wir betrachten danach die noch nicht übernommene Notiz.',
        'Close the viewer with X. The staged README remains; we will next inspect the note not yet restored.',
      ],
      c('close-file'),
      { prepare: seed('tracked', true), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'backup-kept',
      ['Die einzelne Übernahme verbraucht den Stash nicht', 'Restoring one file does not consume the stash'],
      [
        'Das Arbeitspaket ist noch vorhanden. Es enthält weiterhin beide gespeicherten Dateien, auch wenn README bereits in den Arbeitsstand übernommen wurde.',
        'The work bundle still exists. It still contains both saved files even though README has already been restored into the working state.',
      ],
      entry,
      { prepare: seed('tracked') },
    ),
    s(
      'open-again',
      ['Öffne die Dateiliste für die Notiz erneut', 'Reopen the file list for the note'],
      [
        'Wähle erneut Dateien. So findest du die neue notes.txt auch nach der abgeschlossenen README-Übernahme wieder.',
        'Choose Files again. This lets you find the new notes.txt after restoring README.',
      ],
      action('files'),
      { prepare: seed('tracked'), completion: element(file('notes.txt')) },
    ),
    s(
      'before-new',
      ['Auch die neue Datei wird in Arbeitsordner und Index übernommen', 'The new file also goes into the working directory and index'],
      [
        'notes.txt wurde als neue Datei gesichert. Die Einzeldatei-Übernahme erstellt sie hier im Arbeitsordner und merkt ihren Inhalt vor. Das unterscheidet sich vom gewöhnlichen Pop, bei dem diese Notiz unversioniert zurückkam.',
        'notes.txt was saved as a new file. Restoring it individually creates it in the working directory and stages its contents. This differs from ordinary Pop, which brought this note back as untracked.',
      ],
      file('notes.txt') + ' button',
      { prepare: seed('tracked-files') },
    ),
    s(
      'apply-new',
      ['Übernimm jetzt notes.txt', 'Restore notes.txt now'],
      [
        'Wähle Anwenden direkt an notes.txt. Erfolgreich ist die Übung erst, wenn beide Dateien vorgemerkt sind und keine neue, unversionierte Notiz mehr übrig ist.',
        'Choose Apply directly beside notes.txt. The exercise succeeds once both files are staged and no untracked note remains.',
      ],
      file('notes.txt') + ' button',
      { prepare: seed('tracked-files'), completion: both },
    ),
    s(
      'both-staged',
      ['Beide Dateiinhalte sind jetzt vorgemerkt', 'Both file contents are now staged'],
      [
        'README enthält vorgemerkt die Team-Begrüßung; notes.txt ist als neue Datei zum Hinzufügen vorgemerkt. Es gibt keine weitere ungestagte Bearbeitung. Ein normaler Commit wurde trotzdem noch nicht erstellt.',
        'README stages the team greeting; notes.txt is staged as a new file to add. There is no further unstaged edit. An ordinary commit has still not been created.',
      ],
      c('staged-files'),
      { prepare: seed('all') },
    ),
    s(
      'still-kept',
      ['Die Sicherung bleibt auch nach beiden Übernahmen bestehen', 'The backup remains after restoring both files'],
      [
        'Die beiden Einzeldatei-Aktionen haben das Arbeitspaket nicht gelöscht. Nach der Kontrolle kannst du die zusätzliche Sicherung bewusst entfernen.',
        'The two single-file actions did not delete the work bundle. After inspection, you can deliberately remove the additional backup.',
      ],
      entry,
      { prepare: seed('all') },
    ),
    s(
      'drop',
      ['Fordere das Entfernen der Sicherung an', 'Request removal of the backup'],
      [
        'Wähle Drop am Arbeitspaket. Die Rückfrage betrifft nur den Sicherungseintrag; die beiden bereits vorgemerkten Dateien sollen erhalten bleiben.',
        'Choose Drop on the work bundle. The confirmation concerns only the backup entry; both files already staged should remain.',
      ],
      action('drop'),
      { prepare: seed('all'), completion: element(action('confirm-drop')) },
    ),
    s(
      'cancel-drop',
      ['Probiere Abbrechen an der Sicherungsrückfrage', 'Try Cancel on the backup confirmation'],
      [
        'Wähle Abbrechen. Dadurch bleiben sowohl der Stash als auch die beiden vorgemerkten Dateien unverändert.',
        'Choose Cancel. This leaves both the stash and the two staged files unchanged.',
      ],
      action('cancel-drop'),
      { prepare: seed('drop-dialog'), completion: element(action('drop')) },
    ),
    s(
      'retry-drop',
      ['Öffne die Rückfrage erneut', 'Open the confirmation again'],
      [
        'Wähle erneut Drop. Wir bestätigen anschließend ausschließlich das Entfernen dieser Sicherung.',
        'Choose Drop again. We will then confirm removing only this backup.',
      ],
      action('drop'),
      { prepare: seed('all'), completion: element(action('confirm-drop')) },
    ),
    s(
      'confirm-drop',
      ['Entferne die Sicherung nach der Dateikontrolle', 'Remove the backup after inspecting the files'],
      [
        'Bestätige Löschen. Die Liste soll leer werden; README und notes.txt müssen trotzdem mit ihren geprüften Inhalten vorgemerkt bleiben.',
        'Confirm Delete. The list should become empty while README and notes.txt remain staged with their inspected contents.',
      ],
      action('confirm-drop'),
      { prepare: seed('drop-dialog'), completion: { kind: 'all', conditions: [element(emptyStashes), both] } },
    ),
    s(
      'history',
      ['Die vorgemerkten Dateien sind noch kein Commit', 'The staged files are not yet a commit'],
      [
        'main bleibt am bisherigen Commit. Nach dem entfernten Stash-Verweis zeigt die Gesamthistorie wieder nur die vier vorbereiteten Commits. Die beiden Dateiinhalte liegen jetzt im Index.',
        'main stays at its previous commit. After removing the stash reference, all history again shows only the four prepared commits. Both file contents are now in the index.',
      ],
      graphRow(4),
      { prepare: seed('dropped') },
    ),
    s(
      'finish',
      ['Du kannst Dateien gezielt aus einem Stash übernehmen', 'You can restore selected files from a stash'],
      [
        'Du hast die gespeicherte Arbeitsfassung und eine neue Datei einzeln in Arbeitsordner und Index übernommen, den Diff geprüft und die zusätzliche Sicherung nach Kontrolle gelöscht. Weiter beendet diese Lektion.',
        'You restored the saved working file and a new file separately into the working directory and index, inspected the diff and deleted the additional backup after review. Next completes this lesson.',
      ],
      c('staging'),
      { prepare: seed('dropped') },
    ),
  ],
};
