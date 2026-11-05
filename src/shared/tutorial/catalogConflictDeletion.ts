import type { TutorialChapter } from './types';
import { conflictStep as s, conflictControl as c } from './conflictLessonHelpers';
import { conflictDeletionRecipe as seed, deletionResolved } from './conflictDeletionHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileControl } from './fileLessonHelpers';
import { stagingRow } from './stagingLessonHelpers';
export const TUTORIAL_CONFLICT_DELETION: TutorialChapter = {
  id: 'conflicts-deletion',
  section: 'repo',
  title: ['Ändern/Löschen-Konflikt: eine Datei bewusst entfernen', 'Modify/delete conflict: deliberately remove a file'],
  description: [
    'Entscheide einen vorbereiteten Löschkonflikt. Prüfe das vorgemerkte Entfernen und seinen Diff, bevor du den Merge abschließt und das gespeicherte Ergebnis kontrollierst.',
    'Resolve a prepared deletion conflict. Check the staged removal and its diff before finishing the merge and inspecting the saved result.',
  ],
  question: ['Wie übernehme ich bei einem Ändern/Löschen-Konflikt die Löschung?', 'How do I accept deletion in a modify/delete conflict?'],
  keywords: 'konflikt conflict löschen deletion delete modify deleted theirs ud license datei entfernen index diff',
  steps: [
    s(
      'overview',
      ['Die README ist vorbereitet, LICENSE bleibt als Konflikt offen', 'README is prepared; LICENSE remains conflicted'],
      [
        'Die README wurde für diese Lektion bereits mit der eingehenden Fassung aufgelöst. Offen bleibt LICENSE: main hat ihren Projekthinweis geändert, der Quellbranch hat die Datei gelöscht. Wir entscheiden uns diesmal für die Löschung.',
        'README has already been resolved with its incoming version for this lesson. LICENSE remains open: main changed its project note while the source branch deleted the file. This time we choose deletion.',
      ],
      c('editor'),
      { continue: false, prepare: seed() },
    ),
    s(
      'status',
      ['UD bedeutet: Die eingehende Seite hat die Datei gelöscht', 'UD means the incoming side deleted the file'],
      [
        'Die Konfliktliste zeigt Gelöscht durch die andere Seite. Die geänderte main-Fassung liegt weiterhin als Arbeitsdatei vor, bis du ausdrücklich Behalten oder Löschen entscheidest.',
        'The conflict list indicates deletion by the other side. The modified main version remains as a working file until you explicitly choose to keep or delete it.',
      ],
      c('file') + '[data-conflict-path="LICENSE"]',
      { prepare: seed() },
    ),
    s(
      'contents',
      ['Der sichtbare Text ist die beibehaltene aktuelle Fassung', 'The visible text is the retained current version'],
      [
        'Der Editor zeigt den Beispiel-Lizenztext mit main-Projekthinweis. Es gibt keinen eingehenden Textblock, weil die andere Seite keine Datei mehr enthält. Fehlende Marker bedeuten hier noch keinen gelösten Konflikt.',
        'The editor shows the sample license text with main’s project note. There is no incoming text block because the other side has no file. The absence of markers does not yet mean the conflict is resolved.',
      ],
      c('content'),
      { prepare: seed() },
    ),
    s(
      'choices',
      ['Behalten und Löschen sind unterschiedliche Entscheidungen', 'Keeping and deleting are different choices'],
      [
        'Als gelöst markieren würde den sichtbaren aktuellen Dateiinhalt behalten. Löschung übernehmen entfernt dagegen die Datei und merkt diese Entfernung im Index vor. Wir wählen jetzt gezielt die zweite Möglichkeit.',
        'Mark as resolved would retain the visible current contents. Take deleted side instead removes the file and stages its removal. We deliberately choose the second option now.',
      ],
      c('editor'),
      { prepare: seed() },
    ),
    s(
      'delete',
      ['Übernimm die gelöschte Seite', 'Take the deleted side'],
      [
        'Klicke Löschung übernehmen. LICENSE wird aus Arbeitsbaum und Index entfernt. Der Konflikt dieser Datei ist damit entschieden, der Merge bleibt zunächst aktiv.',
        'Click Take deleted side. LICENSE is removed from the working tree and index. This resolves the file conflict while the merge initially remains active.',
      ],
      c('delete'),
      { prepare: seed(), completion: deletionResolved },
    ),
    s(
      'index',
      ['Die Löschung ist im Index vorgemerkt', 'The deletion is staged in the index'],
      [
        'Unter Vorgemerkte Änderungen steht LICENSE mit D für gelöscht. Die bereits vorbereitete README bleibt ebenfalls vorgemerkt. Noch wurde kein neuer Commit erstellt.',
        'LICENSE appears in Staged changes with D for deleted. The prepared README remains staged too. No new commit has been created yet.',
      ],
      stagingRow('staged', 'LICENSE'),
      { prepare: seed('deleted') },
    ),
    s(
      'open-staged',
      ['Öffne den vorgemerkten Löschdiff', 'Open the staged deletion diff'],
      [
        'Öffne LICENSE aus den vorgemerkten Änderungen, um die Entfernung vor dem Commit zu prüfen.',
        'Open LICENSE from Staged changes to inspect its removal before committing.',
      ],
      stagingRow('staged', 'LICENSE'),
      { prepare: seed('deleted'), completion: element(historyViewer('staged', 'LICENSE')) },
    ),
    s(
      'read-staged',
      ['Rot zeigt den vollständig entfernten Inhalt', 'Red shows the fully removed contents'],
      [
        'Der Diff enthält entfernte Zeilen des bisherigen main einschließlich seines Projekthinweises. Eine neue Dateifassung gibt es nicht. Ein Löschdiff lässt sich auch prüfen, wenn die Datei im Index fehlt.',
        'The diff contains removed lines from the old main, including its project note. There is no new file version. A deletion diff can be inspected even though the file is absent from the index.',
      ],
      historyViewer('staged', 'LICENSE'),
      { prepare: seed('deleted', { stagedDiff: true }) },
    ),
    s(
      'close-staged',
      ['Schließe die vorgemerkte Prüfung', 'Close the staged check'],
      ['Kehre zum noch aktiven Merge zurück. Die Entfernung bleibt vorgemerkt.', 'Return to the still-active merge. The removal remains staged.'],
      fileControl('close-file'),
      { prepare: seed('deleted', { stagedDiff: true }), completion: { kind: 'absent', selector: historyViewer('staged', 'LICENSE') } },
    ),
    s(
      'operation',
      ['Eine Dateientscheidung erstellt noch keinen Merge-Commit', 'A file resolution does not create a merge commit'],
      [
        'Alle Konfliktdateien sind entschieden. Fortsetzen ist weiterhin nötig, um README-Änderung und LICENSE-Löschung als gemeinsames Ergebnis zu speichern.',
        'All conflict files are resolved. Continue is still needed to save the README change and LICENSE deletion as one combined result.',
      ],
      c('section'),
      { prepare: seed('deleted') },
    ),
    s(
      'continue',
      ['Speichere den Merge mit der Löschentscheidung', 'Save the merge with the deletion choice'],
      [
        'Setze den Merge fort. Der neue Commit speichert beide Vorgänger und die fehlende LICENSE.',
        'Continue the merge. The new commit saves both parents and the absence of LICENSE.',
      ],
      c('continue'),
      { prepare: seed('deleted'), completion: element(mergeHead(6)) },
    ),
    s(
      'parents',
      ['Beide Entwicklungslinien bleiben erhalten', 'Both development lines are retained'],
      [
        'main und HEAD stehen am sechsten Commit mit zwei Vorgängern. Die Quellhistorie bleibt nachvollziehbar, obwohl die endgültige Dateientscheidung eine Löschung ist.',
        'main and HEAD point to the sixth commit with two parents. The source history remains traceable even though the final file decision is deletion.',
      ],
      mergeHead(6),
      { prepare: seed('continued') },
    ),
    s(
      'select-commit',
      ['Öffne den abgeschlossenen Merge', 'Open the completed merge'],
      ['Wähle den neuen Commit im Graphen.', 'Select the new commit in the graph.'],
      graphRow(6),
      { prepare: seed('continued'), completion: element(commitPanel(6)) },
    ),
    s(
      'files',
      ['Die Commit-Dateiliste enthält Änderung und Löschung', 'The commit file list contains a change and a deletion'],
      [
        'README.md ist geändert; LICENSE ist entfernt. Die Liste vergleicht das gespeicherte Ergebnis mit dem bisherigen main, seinem ersten Vorgänger.',
        'README.md is modified; LICENSE is removed. The list compares the saved result against the old main, its first parent.',
      ],
      commitPanel(6),
      { prepare: seed('commit') },
    ),
    s(
      'open-diff',
      ['Öffne die gespeicherte LICENSE-Löschung', 'Open the saved LICENSE deletion'],
      ['Öffne LICENSE aus der Commit-Dateiliste.', 'Open LICENSE from the commit file list.'],
      commitPanel(6) + ' ' + commitFile('LICENSE'),
      { prepare: seed('commit'), completion: element(historyViewer(6, 'LICENSE')) },
    ),
    s(
      'read-diff',
      ['Die Entfernung gehört jetzt zum gespeicherten Merge', 'The removal now belongs to the saved merge'],
      [
        'Der gespeicherte Diff zeigt dieselben entfernten Inhalte. Er hängt nun am Merge-Commit und benötigt keine noch vorhandene Arbeitsdatei.',
        'The saved diff shows the same removed contents. It now belongs to the merge commit and does not require a surviving working file.',
      ],
      historyViewer(6, 'LICENSE'),
      { prepare: seed('diff') },
    ),
    s(
      'close-file',
      ['Schließe den gespeicherten Diff', 'Close the saved diff'],
      ['Kehre zum Verlauf zurück.', 'Return to history.'],
      fileControl('close-file'),
      { prepare: seed('diff'), completion: { kind: 'absent', selector: historyViewer(6, 'LICENSE') } },
    ),
    s(
      'open-tree',
      ['Prüfe den Arbeitsbaum nach dem Merge', 'Check the working tree after the merge'],
      ['Wechsle im Inspektor zu Working Directory.', 'Switch the inspector to Working Directory.'],
      fileControl('open-files'),
      { prepare: seed('continued'), completion: element(fileControl('open-files') + '[aria-pressed="true"]') },
    ),
    s(
      'absence',
      ['LICENSE fehlt jetzt auch im Dateibaum', 'LICENSE is now absent from the file tree too'],
      [
        'Die README und die übrigen Projektdateien bleiben vorhanden. LICENSE ist durch die ausdrücklich gewählte Löschauflösung nicht mehr Teil dieses gespeicherten Projektstands.',
        'README and the other project files remain. Because of your explicit deletion choice, LICENSE is no longer part of this saved project revision.',
      ],
      fileControl('open-files'),
      { prepare: seed('continued', { tree: true }) },
    ),
    s(
      'finish',
      ['Die Löschentscheidung ist geprüft und gespeichert', 'The deletion choice is checked and saved'],
      [
        'Du hast einen Ändern/Löschen-Konflikt erkannt, die Entfernung vorgemerkt, beide Diffs geprüft und erst danach den Merge abgeschlossen. Weiter beendet diese Lektion.',
        'You recognized a modify/delete conflict, staged removal, checked both diffs and only then finished the merge. Next completes this lesson.',
      ],
      '[data-tutorial="graph"]',
      { prepare: seed('continued') },
    ),
  ],
};
