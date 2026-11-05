import type { TutorialChapter } from './types';
import { replayStep as s } from './replayLessonHelpers';
import {
  mergeRevertRecipe as recipe,
  mergeRevertMenu,
  mergeRevertDialog as dialog,
  mergeRevertConfirm as confirm,
  mergeRevertCancel as cancel,
} from './mergeRevertLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer, fileRow, fileTab } from './historyLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
import { fileControl } from './fileLessonHelpers';
const closed = { kind: 'absent' as const, selector: '.file-viewer' };
export const TUTORIAL_MERGE_REVERT: TutorialChapter = {
  id: 'merge-revert',
  section: 'repo',
  title: ['Einen Merge mit Parent 1 als Hauptlinie reverten', 'Revert a merge using parent 1 as the mainline'],
  description: [
    'Beide Vorgänger unterscheiden, den Merge-Diff lesen, die feste Hauptlinie prüfen und den Gegencommit samt Arbeitsdateien untersuchen.',
    'Distinguish both parents, read the merge diff, check the fixed mainline and inspect the inverse commit and working files.',
  ],
  question: ['Wie nehme ich einen Merge zurück, ohne die Historie umzuschreiben?', 'How do I undo a merge without rewriting history?'],
  keywords: 'merge revert mainline parent hauptlinie vorgänger gegenänderung rückgängig historienerhaltend',
  steps: [
    s(
      'scope',
      ['Ein fertiger Merge auf main', 'A completed merge on main'],
      [
        'Im vorbereiteten Beispiel hat main die unabhängige Lizenznotiz aus feature/begruessung übernommen. Der fertige sechste Commit ist ein Merge. Wir nehmen seine Ergänzung mit einem neuen Commit zurück.',
        'In this prepared example main merged the independent license note from feature/begruessung. The completed sixth commit is a merge. We will undo its addition with a new commit.',
      ],
      '[data-tutorial="graph"]',
      { prepare: recipe() },
    ),
    s(
      'head',
      ['HEAD steht am Merge-Commit', 'HEAD points to the merge commit'],
      [
        'main und HEAD zeigen auf den sechsten Commit. Der Arbeitsbaum ist sauber; die folgende Gegenänderung wird auf diesem gespeicherten Merge aufbauen.',
        'main and HEAD point to the sixth commit. The working tree is clean; the inverse change will build on this saved merge.',
      ],
      mergeHead(6),
      { prepare: recipe() },
    ),
    s(
      'parents',
      ['Ein Merge besitzt hier zwei Vorgänger', 'This merge has two parents'],
      [
        'Die zwei Graphlinien verbinden den Merge mit dem bisherigen main und dem übernommenen Quellcommit. Für einen Revert muss klar sein, welcher Vorgänger als Hauptlinie gilt.',
        'The two graph lines connect the merge to the former main and the merged source commit. Reverting requires knowing which parent is the mainline.',
      ],
      graphRow(6),
      { prepare: recipe() },
    ),
    s(
      'first-parent',
      ['Parent 1 ist main vor diesem Merge', 'Parent 1 is main before this merge'],
      [
        'Der vierte Commit ist der erste Vorgänger. Gegen ihn enthält der Merge die neu übernommene Lizenznotiz.',
        'The fourth commit is the first parent. Relative to it, the merge contains the newly merged license note.',
      ],
      graphRow(4),
      { prepare: recipe() },
    ),
    s(
      'second-parent',
      ['Parent 2 gehört zum übernommenen Branch', 'Parent 2 belongs to the merged branch'],
      [
        'Der fünfte Commit ist der zweite Vorgänger und bleibt über feature/begruessung erreichbar. Ein anderer Vergleichsvorgänger würde eine andere Gegenänderung ergeben.',
        'The fifth commit is the second parent and remains reachable through feature/begruessung. Choosing a different comparison parent would produce a different inverse change.',
      ],
      graphRow(5),
      { prepare: recipe() },
    ),
    s(
      'select',
      ['Wähle den Merge-Commit', 'Select the merge commit'],
      ['Klicke den sechsten Commit, um seine Dateiliste gegen Parent 1 zu prüfen.', 'Click the sixth commit to inspect its file list against parent 1.'],
      graphRow(6),
      { prepare: recipe(), completion: element(commitPanel(6)) },
    ),
    s(
      'files',
      ['Die wirksame Merge-Änderung betrifft LICENSE', 'The effective merge change affects LICENSE'],
      [
        'Die Dateiliste vergleicht den Merge gegen seinen ersten Vorgänger. Hier wurde eine Projektnotiz in LICENSE ergänzt; main hatte seine vorherige Begrüßung bereits.',
        'The file list compares the merge against its first parent. A project note was added to LICENSE; main already had its previous greeting.',
      ],
      '.commit-details-files',
      { prepare: recipe('source') },
    ),
    s(
      'open-source',
      ['Öffne den ursprünglichen Merge-Diff', 'Open the original merge diff'],
      ['Öffne LICENSE in den Commit-Details, bevor wir die Ergänzung zurücknehmen.', 'Open LICENSE in commit details before undoing the addition.'],
      commitPanel(6) + ' ' + commitFile('LICENSE'),
      { prepare: recipe('source'), completion: element(historyViewer(6, 'LICENSE')) },
    ),
    s(
      'source-tab',
      ['Wähle den Merge-Diff', 'Choose the merge diff'],
      ['Wähle Diff, um die gespeicherte Änderung gegen Parent 1 zu lesen.', 'Choose Diff to read the saved change against parent 1.'],
      fileTab('diff'),
      { prepare: recipe('source-diff'), completion: element(historyViewer(6, 'LICENSE') + '[data-tab="diff"]') },
    ),
    s(
      'source-diff',
      ['Der Merge-Diff ergänzt die Projektnotiz', 'The merge diff adds the project note'],
      [
        'Die Plus-Zeilen ergänzen die Übungsnotiz. Gegen Parent 1 wird hier nichts aus der bisherigen Lizenz entfernt.',
        'The plus lines add the practice note. Relative to parent 1, nothing is removed from the existing license here.',
      ],
      '.file-viewer-diff',
      { prepare: recipe('source-diff') },
    ),
    s(
      'close-source',
      ['Schließe den Merge-Vergleich', 'Close the merge comparison'],
      ['Kehre zum Graphen zurück, um die Git-Aktion am Merge auszuwählen.', 'Return to the graph to choose the Git action on the merge.'],
      fileControl('close-file'),
      { prepare: recipe('source-diff'), completion: closed },
    ),
    s(
      'menu',
      ['Öffne das Kontextmenü des Merge-Commits', 'Open the merge commit’s context menu'],
      ['Öffne das Menü am sechsten Commit mit der rechten Maustaste oder Umschalt+F10.', 'Open the sixth commit’s menu with a right-click or Shift+F10.'],
      graphRow(6),
      { prepare: recipe('source'), gesture: 'contextmenu', completion: element(mergeRevertMenu) },
    ),
    s(
      'purpose',
      ['Für den Merge gibt es einen eigenen Revert-Eintrag', 'The merge has its own revert entry'],
      [
        'Wähle die Aktion zum Revert dieses Merge. Sie berücksichtigt die Hauptlinie; der normale Revert eines einzelnen Vorgängercommits wäre eine andere Änderung.',
        'Choose the action to revert this merge. It accounts for the mainline; reverting one of the parent commits would be a different change.',
      ],
      mergeRevertMenu,
      { prepare: recipe('menu') },
    ),
    s(
      'open',
      ['Öffne die Merge-Revert-Bestätigung', 'Open merge-revert confirmation'],
      [
        'Klicke Merge reverten. Der Dialog zeigt den ausgewählten Merge und die verwendete Hauptlinie.',
        'Click Revert merge. The dialog shows the selected merge and mainline.',
      ],
      mergeRevertMenu,
      { prepare: recipe('menu'), completion: element(dialog) },
    ),
    s(
      'message',
      ['Diese Aktion verwendet ausdrücklich Parent 1', 'This action explicitly uses parent 1'],
      [
        'Die Beschreibung nennt Parent 1 als Hauptlinie. In diesem Beispiel ist das main unmittelbar vor dem Merge.',
        'The description names parent 1 as the mainline. Here that is main immediately before the merge.',
      ],
      dialog + ' .dialog-message',
      { prepare: recipe('dialog') },
    ),
    s(
      'target',
      ['Prüfe den Merge-Hash', 'Check the merge hash'],
      [
        'Der erste Kontextwert nennt den sechsten Commit. Die Aktion betrifft den fertigen Merge und nicht den fünften Quellcommit allein.',
        'The first context value identifies the sixth commit. The action applies to the completed merge rather than only the fifth source commit.',
      ],
      dialog + ' .dialog-context-list dd:nth-of-type(1)',
      { prepare: recipe('dialog') },
    ),
    s(
      'mainline',
      ['Die Hauptlinie ist in diesem Dialog fest vorgegeben', 'This dialog fixes the mainline'],
      [
        'Der angezeigte Wert 1 ist hier keine Eingabe. Die Aktion nimmt die Merge-Änderung relativ zum ersten Vorgänger zurück. Prüfe deshalb vor dem Bestätigen die beiden Graphvorgänger.',
        'The displayed value 1 is not an input here. This action undoes the merge change relative to its first parent. Review both graph parents before confirming.',
      ],
      dialog + ' .dialog-context-list dd:nth-of-type(2)',
      { prepare: recipe('dialog') },
    ),
    s(
      'impact',
      ['Es entsteht ein zusätzlicher Commit', 'An additional commit will be created'],
      [
        'Der ursprüngliche Merge bleibt in der Historie. Die App legt einen Gegencommit an; bei anderen Inhalten können dabei Konflikte auftreten.',
        'The original merge remains in history. The app creates an inverse commit; other contents can cause conflicts.',
      ],
      dialog + ' .dialog-impact',
      { prepare: recipe('dialog') },
    ),
    s(
      'cancel',
      ['Behalte den Merge zunächst bei', 'Keep the merge for now'],
      [
        'Klicke Abbrechen. Die Bestätigung wird geschlossen und die integrierte Lizenznotiz bleibt vorerst erhalten.',
        'Click Cancel. Confirmation closes and the merged license note remains for now.',
      ],
      cancel,
      { prepare: recipe('dialog'), completion: { kind: 'absent', selector: dialog } },
    ),
    s(
      'kept',
      ['main bleibt am unveränderten Merge', 'main remains at the unchanged merge'],
      [
        'Es wurde noch kein Revert-Commit erstellt. main steht weiter am sechsten Commit mit seinen beiden Vorgängern.',
        'No revert commit has been created yet. main still points to the sixth commit with its two parents.',
      ],
      mergeHead(6),
      { prepare: recipe('cancelled') },
    ),
    s(
      'menu-again',
      ['Öffne die Aktion am selben Merge erneut', 'Open the action on the same merge again'],
      ['Öffne erneut das Kontextmenü des sechsten Commits.', 'Open the sixth commit’s context menu again.'],
      graphRow(6),
      { prepare: recipe('cancelled'), gesture: 'contextmenu', completion: element(mergeRevertMenu) },
    ),
    s(
      'open-again',
      ['Öffne die geprüfte Bestätigung erneut', 'Open the reviewed confirmation again'],
      ['Wähle erneut Merge reverten. Hauptlinie und Ziel bleiben gleich.', 'Choose Revert merge again. Mainline and target remain the same.'],
      mergeRevertMenu,
      { prepare: recipe('menu'), completion: element(dialog) },
    ),
    s(
      'confirm',
      ['Speichere die Gegenänderung des Merge', 'Save the merge’s inverse change'],
      [
        'Bestätige Merge-Revert. Die Übung wartet auf einen neuen HEAD nach dem ursprünglichen Merge.',
        'Confirm Revert merge. The exercise waits for a new HEAD after the original merge.',
      ],
      confirm,
      { prepare: recipe('dialog'), completion: { kind: 'all', conditions: [element(mergeHead(7)), { kind: 'absent', selector: dialog }] } },
    ),
    s(
      'new-head',
      ['Der Revert hat nur einen Vorgänger', 'The revert has only one parent'],
      [
        'Der neue siebte Commit folgt dem sechsten Merge-Commit. Der Revert selbst ist kein weiterer Merge.',
        'The new seventh commit follows the sixth merge commit. The revert itself is not another merge.',
      ],
      mergeHead(7),
      { prepare: recipe('result') },
    ),
    s(
      'original',
      ['Der ursprüngliche Merge bleibt vollständig erhalten', 'The original merge remains intact'],
      [
        'Der sechste Commit besitzt weiterhin beide ursprünglichen Vorgänger. Die Historie wurde ergänzt und nicht umgeschrieben.',
        'The sixth commit still has both original parents. History was extended rather than rewritten.',
      ],
      graphRow(6),
      { prepare: recipe('result') },
    ),
    s(
      'source-remains',
      ['Der Quellbranch bleibt am fünften Commit', 'The source branch stays at the fifth commit'],
      [
        'feature/begruessung wird durch den Gegencommit auf main nicht verschoben. Auch die übrigen gespeicherten Referenzen bleiben erhalten.',
        'The inverse commit on main does not move feature/begruessung. Other saved references remain intact too.',
      ],
      graphRow(5) + ' .commit-refs',
      { prepare: recipe('result') },
    ),
    s(
      'select-result',
      ['Wähle den neuen Revert-Commit', 'Select the new revert commit'],
      ['Klicke den neuen HEAD, um die erzeugte Nachricht und Gegenänderung zu lesen.', 'Click the new HEAD to read the generated message and inverse change.'],
      graphRow(7),
      { prepare: recipe('result'), completion: element(commitPanel(7)) },
    ),
    s(
      'description',
      ['Die Beschreibung nennt Merge und Hauptlinie', 'The description identifies the merge and mainline'],
      [
        'Die erzeugte Nachricht verweist auf den ursprünglichen Merge-Hash und den vierten Commit als gewählte Hauptlinie. So bleibt die Bezugsrichtung dokumentiert.',
        'The generated message refers to the original merge hash and the fourth commit as the selected mainline, documenting the comparison direction.',
      ],
      '.commit-details-description',
      { prepare: recipe('commit') },
    ),
    s(
      'open-result',
      ['Öffne die Gegenänderung an LICENSE', 'Open the inverse LICENSE change'],
      [
        'Öffne LICENSE im neuen Commit. Der Vergleich zeigt das Ergebnis gegen den zuvor integrierten Merge.',
        'Open LICENSE in the new commit. The comparison shows the result against the previously completed merge.',
      ],
      commitPanel(7) + ' ' + commitFile('LICENSE'),
      { prepare: recipe('commit'), completion: element(historyViewer(7, 'LICENSE')) },
    ),
    s(
      'result-tab',
      ['Wähle den Diff des Gegencommits', 'Choose the inverse commit’s diff'],
      ['Wähle Diff, um die gespeicherte Gegenänderung zu sehen.', 'Choose Diff to see the saved inverse change.'],
      fileTab('diff'),
      { prepare: recipe('result-diff'), completion: element(historyViewer(7, 'LICENSE') + '[data-tab="diff"]') },
    ),
    s(
      'result-diff',
      ['Die hinzugefügte Notiz wird wieder entfernt', 'The added note is removed again'],
      [
        'Die Minus-Zeilen nehmen die Projektnotiz zurück. Der vorherige Lizenztext bleibt erhalten. In diesem Beispiel enthält die Gegenänderung keine zusätzlichen Plus-Zeilen.',
        'The minus lines undo the project note. The previous license text remains intact. This example’s inverse change adds no new plus lines.',
      ],
      '.file-viewer-diff',
      { prepare: recipe('result-diff') },
    ),
    s(
      'close-result',
      ['Schließe den Gegenvergleich', 'Close the inverse comparison'],
      ['Kehre zum Graphen und seinen Arbeitsansichten zurück.', 'Return to the graph and its working views.'],
      fileControl('close-file'),
      { prepare: recipe('result-diff'), completion: closed },
    ),
    s(
      'working-area',
      ['Die Arbeitsansichten gelten dem neuen HEAD', 'The working views refer to the new HEAD'],
      [
        'Working Directory zeigt jetzt den Zustand nach dem Revert. Wir prüfen sowohl die zurückgenommene Notiz als auch die erhaltene Begrüßung von main.',
        'Working Directory now shows the revision after revert. We will check both the undone note and main’s retained greeting.',
      ],
      fileControl('open-files'),
      { prepare: recipe('working') },
    ),
    s(
      'tree',
      ['Öffne das Working Directory', 'Open the working directory'],
      ['Wechsle zur aktuellen Dateiansicht.', 'Switch to the current file view.'],
      fileControl('open-files'),
      { prepare: recipe('working'), completion: element(fileControl('open-files') + '[aria-pressed="true"]') },
    ),
    s(
      'open-license',
      ['Öffne die aktuelle Lizenzdatei', 'Open the current license file'],
      ['Öffne LICENSE aus dem Dateibaum.', 'Open LICENSE from the file tree.'],
      fileRow('LICENSE'),
      { prepare: recipe('tree'), completion: element(historyViewer('unstaged', 'LICENSE')) },
    ),
    s(
      'license-text',
      ['Lies den wiederhergestellten Lizenzinhalt', 'Read the restored license contents'],
      [
        'Wähle Text. Der ursprüngliche Lizenztext ist vorhanden; die über den Merge hinzugefügte Projektnotiz ist entfernt.',
        'Choose Text. The original license text remains; the project note added through the merge is removed.',
      ],
      fileTab('text'),
      { prepare: recipe('work'), completion: element(historyViewer('unstaged', 'LICENSE') + '[data-tab="text"]') },
    ),
    s(
      'close-license',
      ['Schließe die Lizenzdatei', 'Close the license file'],
      ['Schließe den Betrachter, um eine andere aktuelle Datei zu prüfen.', 'Close the viewer to inspect another current file.'],
      fileControl('close-file'),
      { prepare: recipe('work'), completion: closed },
    ),
    s(
      'open-readme',
      ['Öffne zusätzlich die aktuelle README', 'Also open the current README'],
      [
        'Klicke README.md im Dateibaum. Diese Begrüßungsänderung bestand auf main bereits vor dem Merge.',
        'Click README.md in the file tree. This greeting change existed on main before the merge.',
      ],
      fileRow('README.md'),
      { prepare: recipe('tree'), completion: element(historyViewer()) },
    ),
    s(
      'readme-text',
      ['Wähle den aktuellen README-Text', 'Choose the current README text'],
      [
        'Wähle Text. Die Datei ist im neuen HEAD unverändert und braucht hier keinen leeren Arbeits-Diff.',
        'Choose Text. The file is unchanged against the new HEAD and does not need an empty working diff here.',
      ],
      fileTab('text'),
      { prepare: recipe('readme'), completion: element(historyViewer() + '[data-tab="text"]') },
    ),
    s(
      'readme',
      ['Die frühere main-Änderung bleibt erhalten', 'The earlier main change remains intact'],
      [
        'Die README begrüßt weiterhin die Welt. Zurückgenommen wurde die Merge-Ergänzung relativ zu main, nicht die vorherige eigenständige Arbeit dieses Branches.',
        'The README still greets the world. The merge addition relative to main was undone, while this branch’s earlier independent work remains.',
      ],
      historyViewer(),
      { prepare: recipe('readme') },
    ),
    s(
      'close-readme',
      ['Schließe die zweite Dateiprüfung', 'Close the second file check'],
      ['Kehre zum Graphen zurück.', 'Return to the graph.'],
      fileControl('close-file'),
      { prepare: recipe('readme'), completion: closed },
    ),
    s(
      'done',
      ['Hauptlinie, Gegencommit und erhaltene Arbeit geprüft', 'Checked the mainline, inverse commit and retained work'],
      [
        'Der neue Revert nimmt die Merge-Ergänzung zurück und erhält die ursprüngliche Historie. Nichts wurde gepusht. Weiter beendet diese Lektion.',
        'The new revert undoes the merge addition and retains the original history. Nothing was pushed. Next finishes this lesson.',
      ],
      mergeHead(7),
      { prepare: recipe('result') },
    ),
  ],
};
