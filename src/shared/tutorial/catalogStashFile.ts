import type { TutorialChapter, TutorialText } from './types';
import { branchControl as c, branchElement as element } from './branchLessonHelpers';
import { stagingRow, tree } from './stagingLessonHelpers';
import { historyViewer as viewer } from './historyLessonHelpers';
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
const seed = (stage: StashStage = 'start', extra: { name?: TutorialText; stashes?: boolean; files?: boolean; diff?: 'unstaged' } = {}) =>
  ordinaryStashRecipe({ scope: 'file', stage, ...extra });
const name = ordinaryName('file');
const saved = tree([], [], ['notes.txt'], { content: [{ path: 'README.md', source: 'worktree', value: { example: 'history-readme', version: 'latest' } }] });
const applied = tree([], ['README.md'], ['notes.txt'], {
  content: [
    { path: 'README.md', source: 'index', value: { example: 'history-readme', version: 'latest' } },
    { path: 'README.md', source: 'worktree', value: { example: 'history-readme', version: 'work' } },
  ],
});
export const TUTORIAL_STASH_FILE: TutorialChapter = {
  id: 'stash-file',
  section: 'repo',
  title: ['Eine Datei zwischenlagern und wieder anwenden', 'Set one file aside and apply it again'],
  description: [
    'Sichere eine teilweise gestagte Datei über ihr Kontextmenü, lasse andere Arbeit liegen und prüfe Anwenden sowie bewusstes Löschen der Sicherung.',
    'Save a partially staged file through its context menu, leave other work alone and inspect Apply and deliberate backup deletion.',
  ],
  question: ['Wie sichere ich nur eine Datei in einem Stash?', 'How do I save just one file in a stash?'],
  keywords: 'stash datei file einzeln zwischenlagern anwenden apply behalten löschen drop index optional name',
  steps: [
    s(
      'overview',
      ['Eine einzelne Datei soll vorübergehend aus dem Arbeitsstand verschwinden', 'One file should temporarily leave the working state'],
      [
        'Diese Übung verwendet einen gewöhnlichen Stash, ohne Branchwechsel. README ist teilweise gestagt; notes.txt ist unabhängig davon neu. Nur README soll zunächst gesichert und zurückgesetzt werden.',
        'This exercise uses an ordinary stash without switching branches. README is partially staged; notes.txt is independently new. Only README should initially be saved and reset.',
      ],
      c('staging'),
      { continue: false, prepare: seed() },
    ),
    s(
      'index',
      ['README besitzt eine vorgemerkte Fassung', 'README has a staged version'],
      [
        'Unter Vorgemerkt liegt die Staging-Begrüßung. Diese Fassung gehört bereits zum Index, ist aber noch kein Commit.',
        'Staged contains the staging greeting. This version is already in the index but is not a commit yet.',
      ],
      c('staged-files'),
      { prepare: seed() },
    ),
    s(
      'work',
      ['Die Arbeitsdatei enthält eine weitere Änderung', 'The working file contains a further edit'],
      [
        'Unter Änderungen steht dieselbe README mit der Team-Begrüßung. Ein Stash für diese Datei erfasst hier beide Fassungen, auch wenn du ihn aus dem ungestagten Bereich aufrufst.',
        'Changes contains the same README with the team greeting. A stash for this file captures both versions here, even when opened from the unstaged section.',
      ],
      stagingRow('unstaged', 'README.md'),
      { prepare: seed() },
    ),
    s(
      'notes',
      ['Die neue Notiz soll unangetastet bleiben', 'The new note should remain untouched'],
      [
        'notes.txt ist eine andere Datei. Die Auswahl Nur diese Datei soll sie weder sichern noch aus dem Arbeitsordner entfernen.',
        'notes.txt is a different file. Choosing just this file should neither save it nor remove it from the working directory.',
      ],
      c('untracked-files'),
      { prepare: seed() },
    ),
    s(
      'menu',
      ['Öffne das Kontextmenü der ungestagten README', 'Open the unstaged README context menu'],
      [
        'Öffne das Kontextmenü von README im Bereich Änderungen. Dort findest du die einzelne Datei und alle Änderungen als getrennte Stash-Aktionen.',
        'Open the context menu of README under Changes. It offers separate stash actions for the single file and for all changes.',
      ],
      stagingRow('unstaged', 'README.md'),
      { prepare: seed(), gesture: 'contextmenu', completion: element(c('stash-file')) },
    ),
    s(
      'scope',
      ['Wähle den Umfang bewusst', 'Choose the scope deliberately'],
      [
        'Datei stashen betrifft README einschließlich ihrer Index- und Arbeitsfassung. Alle Änderungen stashen würde zusätzlich notes.txt erfassen. Wir verwenden die einzelne Datei.',
        'Stash file affects README including its index and working versions. Stash all changes would also include notes.txt. We will use the single file.',
      ],
      c('stash-file'),
      { prepare: seed('menu') },
    ),
    s(
      'open',
      ['Öffne den Dialog für diese Datei', 'Open the dialog for this file'],
      [
        'Wähle Datei stashen. Prüfe im Dialog den Dateipfad und das Repository, bevor du einen Namen eingibst oder bestätigst.',
        'Choose Stash file. Check the file path and repository in the dialog before naming or confirming the backup.',
      ],
      c('stash-file'),
      { prepare: seed('menu'), completion: element(stashMessage) },
    ),
    s(
      'optional',
      ['Die Nachricht ist eine optionale Gedächtnisstütze', 'The message is an optional reminder'],
      [
        'Das Nachrichtenfeld benennt die Sicherung; es ist keine Commit-Nachricht und erstellt keinen Branch. Ohne eigene Nachricht verwendet Git eine Standardbeschreibung. Wir probieren zuerst Abbrechen.',
        'The message names the backup; it is not a commit message and creates no branch. Without a custom message Git uses a default description. We will try Cancel first.',
      ],
      stashMessage,
      { prepare: seed('dialog') },
    ),
    s(
      'cancel',
      ['Brich vor dem Sichern ab', 'Cancel before saving'],
      [
        'Wähle Abbrechen. Bis zur Bestätigung soll weder der Arbeitsstand zurückgesetzt noch ein Stash angelegt werden.',
        'Choose Cancel. Before confirmation, neither the working state nor the stash list should change.',
      ],
      stashCancel,
      { prepare: seed('dialog'), completion: { kind: 'absent', selector: '.dialog-modal' } },
    ),
    s(
      'unchanged',
      ['Index, Arbeitsdatei und neue Notiz sind noch vorhanden', 'Index, working file and new note are still present'],
      [
        'README steht weiterhin in beiden Änderungsbereichen und notes.txt bleibt neu. Wir beginnen den gleichen Dateivorgang noch einmal und bestätigen ihn diesmal bewusst.',
        'README still appears in both change sections and notes.txt remains new. We will start the same file operation again and deliberately confirm it this time.',
      ],
      c('staging'),
      { prepare: seed() },
    ),
    s(
      'reopen-menu',
      ['Öffne die README-Aktionen erneut', 'Open the README actions again'],
      [
        'Öffne wieder das Kontextmenü der ungestagten README. Die Auswahl bleibt auf diese Datei begrenzt.',
        'Open the unstaged README context menu again. The scope remains limited to this file.',
      ],
      stagingRow('unstaged', 'README.md'),
      { prepare: seed(), gesture: 'contextmenu', completion: element(c('stash-file')) },
    ),
    s(
      'reopen',
      ['Starte erneut Datei stashen', 'Start Stash file again'],
      [
        'Wähle Datei stashen. Der neue Dialog soll dieselbe Datei anzeigen und ein frisches Nachrichtenfeld anbieten.',
        'Choose Stash file. The new dialog should identify the same file and offer a fresh message field.',
      ],
      c('stash-file'),
      { prepare: seed('menu'), completion: element(stashMessage) },
    ),
    s(
      'name',
      ['Nenne die Sicherung README für später', 'Name the backup README for later'],
      [
        'Trage „README für später“ ein. Ein nachvollziehbarer Name hilft, mehrere Sicherungen auseinanderzuhalten.',
        'Enter “README for later”. A recognizable name helps distinguish multiple backups.',
      ],
      stashMessage,
      { prepare: seed('dialog'), completion: { kind: 'value', selector: stashMessage, value: name } },
    ),
    s(
      'save',
      ['Bestätige die einzelne Datei', 'Confirm the single file'],
      [
        'Wähle Stash erstellen. Erfolgreich ist die Übung erst, wenn README im aktuellen Arbeitsstand wieder der gespeicherten Fassung entspricht und notes.txt weiterhin neu ist.',
        'Choose Create stash. The exercise succeeds once README again matches its saved version in the current working state and notes.txt is still new.',
      ],
      stashConfirm,
      { prepare: seed('dialog', { name }), completion: saved },
    ),
    s(
      'saved',
      ['README ist gesichert, die unabhängige Notiz bleibt liegen', 'README is saved and the independent note remains'],
      [
        'Die beiden README-Einträge fehlen jetzt. notes.txt bleibt unversioniert im Arbeitsordner. Der aktive Branch ist weiterhin main; die Datei wurde nicht in einen normalen Branch-Commit übernommen.',
        'Both README entries are now gone. notes.txt remains untracked in the working directory. The active branch is still main; the file was not saved in an ordinary branch commit.',
      ],
      c('staging'),
      { prepare: seed('saved') },
    ),
    s(
      'open-stashes',
      ['Finde die benannte Sicherung', 'Find the named backup'],
      [
        'Klappe Stashes auf. Dort soll der Eintrag für README mit dem eben eingegebenen Namen erscheinen.',
        'Expand Stashes. The README entry should appear with the name you just entered.',
      ],
      c('stash-panel-toggle'),
      { prepare: seed('saved'), completion: element(entry) },
    ),
    s(
      'entry',
      ['Name, Herkunft und Stapelposition gehören zum Eintrag', 'Name, origin and stack position identify the entry'],
      [
        'Der Eintrag enthält README für später, die Herkunft main und die Position stash@{0}. Eine weitere Sicherung könnte diese Position verschieben; der Inhalt dieses Eintrags bleibt dabei eigenständig.',
        'The entry contains README for later, its origin main and its stack position stash@{0}. Another backup could shift that position; this entry’s contents remain independent.',
      ],
      entry,
      { prepare: seed('saved', { stashes: true }) },
    ),
    s(
      'files',
      ['Lies den Dateiinhalt des Stapels als Liste', 'Inspect the stack entry’s file list'],
      [
        'Wähle Dateien. Diese Schaltfläche liest zunächst nur die gespeicherten Dateinamen und verändert keine Arbeitsdatei.',
        'Choose Files. This button initially reads only the saved filenames and changes no working file.',
      ],
      action('files'),
      { prepare: seed('saved', { stashes: true }), completion: element(file('README.md')) },
    ),
    s(
      'file-list',
      ['Diese Sicherung enthält nur README', 'This backup contains only README'],
      [
        'Die Liste zeigt README.md; notes.txt gehört nicht zu diesem Dateistash. Die separate Anwenden-Schaltfläche an einer Dateizeile ist eine andere Aktion als das Anwenden des gesamten Stashes und folgt in einer eigenen Lektion.',
        'The list shows README.md; notes.txt is not part of this file stash. The separate Apply button on a file row is a different action from applying the whole stash and is covered in its own lesson.',
      ],
      entry + ' .stash-file-list',
      { prepare: seed('saved', { stashes: true, files: true }) },
    ),
    s(
      'hide-files',
      ['Schließe nur die Dateiliste', 'Close only the file list'],
      [
        'Wähle Dateien ausblenden. Der Sicherungseintrag bleibt erhalten und kann anschließend als Ganzes angewendet werden.',
        'Choose Hide files. The backup entry remains available and can then be applied as a whole.',
      ],
      action('files'),
      { prepare: seed('saved', { stashes: true, files: true }), completion: { kind: 'absent', selector: entry + ' .stash-file-list' } },
    ),
    s(
      'apply',
      ['Wende den gewöhnlichen Stash an', 'Apply the ordinary stash'],
      [
        'Wähle Anwenden am Eintrag. Dadurch soll die gespeicherte Arbeitsfassung zurückkehren; die Sicherung selbst bleibt bestehen. Die unabhängige Notiz wird dabei nicht überschrieben.',
        'Choose Apply on the entry. The saved working version should return while the backup itself remains. The independent note must not be overwritten.',
      ],
      action('apply'),
      { prepare: seed('saved', { stashes: true }), completion: applied },
    ),
    s(
      'ordinary-index',
      ['Gewöhnliches Anwenden stellt hier nicht den alten Index wieder her', 'Ordinary application does not restore the old index here'],
      [
        'README erscheint jetzt nur unter Änderungen. Bei dieser vorhandenen Datei stellt gewöhnliches Anwenden die Arbeitsfassung wieder her; die frühere teilweise Vormerkung wird nicht automatisch rekonstruiert. Die geführte Branchwechsel-Wiederherstellung arbeitet ausdrücklich anders.',
        'README now appears only under Changes. For this existing file, ordinary application restores the working version without automatically reconstructing the former partial staging. Guided branch-switch restoration explicitly behaves differently.',
      ],
      c('staging'),
      { prepare: seed('applied') },
    ),
    s(
      'open-diff',
      ['Kontrolliere den zurückgekehrten README-Diff', 'Inspect the restored README diff'],
      [
        'Öffne README im Bereich Änderungen. Der Vergleich soll die gespeicherte Welt-Begrüßung gegen die zurückgebrachte Team-Begrüßung zeigen.',
        'Open README under Changes. The diff should compare the saved world greeting against the restored team greeting.',
      ],
      stagingRow('unstaged', 'README.md'),
      { prepare: seed('applied'), completion: element(viewer('unstaged')) },
    ),
    s(
      'read-diff',
      ['Die gesamte Arbeitsbearbeitung ist wieder da', 'The complete working edit is back'],
      [
        'Entfernt wird die Welt-Begrüßung, hinzu kommt Team. Die Staging-Zwischenfassung ist weiterhin in der Sicherung gespeichert, aber durch dieses gewöhnliche Anwenden nicht als eigener Index-Zustand zurückgekehrt.',
        'The world greeting is removed and team is added. The intermediate staging version remains stored in the backup but this ordinary application did not restore it as a separate index state.',
      ],
      viewer('unstaged'),
      { prepare: seed('applied', { diff: 'unstaged' }) },
    ),
    s(
      'close-diff',
      ['Schließe den Diff wieder', 'Close the diff again'],
      [
        'Schließe den Viewer mit X. Damit kehrst du zur Stash-Liste zurück, ohne die wiederhergestellte Arbeit zu verändern.',
        'Close the viewer with X. This returns to the stash list without changing the restored work.',
      ],
      c('close-file'),
      { prepare: seed('applied', { diff: 'unstaged' }), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'keep',
      ['Anwenden hat die Sicherung behalten', 'Apply retained the backup'],
      [
        'Der Stash ist noch vorhanden. Er ist eine zusätzliche Sicherung; seine erneute Anwendung auf inzwischen bearbeitete Dateien ist kein notwendiger nächster Schritt. Wir entfernen ihn jetzt bewusst nach der Inhaltskontrolle.',
        'The stash still exists. It is an additional backup; applying it again onto edited files is not a necessary next step. We will deliberately remove it after inspecting the contents.',
      ],
      entry,
      { prepare: seed('applied') },
    ),
    s(
      'drop',
      ['Fordere das Löschen des Sicherungseintrags an', 'Request deletion of the backup entry'],
      [
        'Wähle Löschen beziehungsweise Drop am Stash. Die nachfolgende Rückfrage betrifft die Sicherung, nicht das Verwerfen der bereits zurückgebrachten Arbeitsdatei.',
        'Choose Drop on the stash. The confirmation concerns the backup, not discarding the working file already restored.',
      ],
      action('drop'),
      { prepare: seed('applied'), completion: element(action('confirm-drop')) },
    ),
    s(
      'cancel-drop',
      ['Brich die Löschbestätigung zuerst ab', 'Cancel deletion first'],
      [
        'Wähle Abbrechen an der Rückfrage. Der Stash und die wiederhergestellte README sollen beide erhalten bleiben.',
        'Choose Cancel on the confirmation. The stash and the restored README should both remain.',
      ],
      action('cancel-drop'),
      { prepare: seed('drop-dialog'), completion: element(action('drop')) },
    ),
    s(
      'retry-drop',
      ['Öffne die Löschbestätigung erneut', 'Open the deletion confirmation again'],
      [
        'Wähle erneut Drop. Wir bestätigen erst im nächsten Schritt, nachdem die Bedeutung der Sicherung geklärt ist.',
        'Choose Drop again. We will confirm in the next step after clarifying the backup’s role.',
      ],
      action('drop'),
      { prepare: seed('applied'), completion: element(action('confirm-drop')) },
    ),
    s(
      'confirm-drop',
      ['Entferne nur die geprüfte Sicherung', 'Remove only the reviewed backup'],
      [
        'Bestätige Löschen. Der Stash soll verschwinden, während README ungestagt und notes.txt weiterhin neu bleiben.',
        'Confirm Delete. The stash should disappear while README remains unstaged and notes.txt remains new.',
      ],
      action('confirm-drop'),
      { prepare: seed('drop-dialog'), completion: { kind: 'all', conditions: [element(emptyStashes), applied] } },
    ),
    s(
      'finish',
      ['Du hast eine einzelne Datei gesichert und bewusst zurückgebracht', 'You saved and deliberately restored one file'],
      [
        'Du hast Umfang und Nachricht geprüft, Abbrechen erprobt, README einzeln gesichert, gewöhnlich angewendet und die zusätzliche Sicherung nach Kontrolle gelöscht. Die offene Arbeit bleibt für weitere Übungen erhalten. Weiter beendet diese Lektion.',
        'You inspected scope and message, tried Cancel, saved README alone, applied it normally and deleted the additional backup after inspection. The uncommitted work remains for further exercises. Next completes this lesson.',
      ],
      c('staging'),
      { prepare: seed('dropped') },
    ),
  ],
};
