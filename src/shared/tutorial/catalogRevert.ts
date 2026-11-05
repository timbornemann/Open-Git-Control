import type { TutorialChapter } from './types';
import { replayStep as s, replayRecipe, replayMenu } from './replayLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer, fileRow, fileTab } from './historyLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
import { fileControl } from './fileLessonHelpers';
const recipe = (stage: Parameters<typeof replayRecipe>[1] = 'start') => replayRecipe('revert', stage);
const closed = { kind: 'absent' as const, selector: '.file-viewer' };
export const TUTORIAL_REVERT: TutorialChapter = {
  id: 'revert',
  section: 'repo',
  title: ['Eine Änderung mit einem Revert-Commit rückgängig machen', 'Undo a change with a revert commit'],
  description: [
    'Original-Diff, direkte Menüaktion, Gegenänderung, neue Nachricht und erhaltene Historie einzeln untersuchen.',
    'Inspect the original diff, immediate menu action, inverse patch, new message and retained history separately.',
  ],
  question: ['Wie mache ich einen Commit rückgängig, ohne die Historie umzuschreiben?', 'How do I undo a commit without rewriting history?'],
  keywords: 'revert rückgängig gegenänderung undo commit historienerhaltend zurücknehmen patch diff',
  steps: [
    s(
      'scope',
      ['Die letzte Begrüßungsänderung zurücknehmen', 'Undo the latest greeting change'],
      [
        'main steht am vierten Commit. Wir nehmen dessen Änderung mit einem neuen Revert-Commit zurück und erhalten alle bisherigen Commits.',
        'main points to the fourth commit. We will undo its change with a new revert commit while retaining every existing commit.',
      ],
      '[data-tutorial="graph"]',
      { prepare: recipe() },
    ),
    s(
      'head',
      ['main und HEAD markieren den Ausgangsstand', 'main and HEAD mark the starting revision'],
      [
        'Der vierte Commit ist aktuell auf main ausgecheckt. Die Beispieldateien und der Index sind sauber; der Revert wird auf diesem HEAD aufbauen.',
        'The fourth commit is currently checked out on main. Sample files and the index are clean; the revert will build on this HEAD.',
      ],
      mergeHead(4),
      { prepare: recipe() },
    ),
    s(
      'history',
      ['Ein Revert ergänzt die vorhandene Historie', 'A revert appends to the existing history'],
      [
        'Wir verschieben main nicht auf einen alten Commit zurück. Der ursprüngliche vierte Commit bleibt erhalten und erhält einen neuen Nachfolger mit der Gegenänderung.',
        'We will not reset main to an old commit. The original fourth commit remains and receives a new descendant containing the inverse change.',
      ],
      '[data-tutorial="graph"]',
      { prepare: recipe() },
    ),
    s(
      'select',
      ['Wähle den zurückzunehmenden Commit', 'Select the commit to undo'],
      [
        'Klicke den vierten Commit mit der Begrüßungsänderung. Das Revert-Menü wird sich genau auf diesen Commit beziehen.',
        'Click the fourth commit containing the greeting change. The revert menu will apply to exactly this commit.',
      ],
      graphRow(4),
      { prepare: recipe(), completion: element(commitPanel(4)) },
    ),
    s(
      'description',
      ['Lies die Beschreibung der ursprünglichen Änderung', 'Read the original change’s description'],
      [
        'Die gespeicherte Beschreibung erklärt den Begrüßungscommit. Diese Nachricht bleibt am Original erhalten, wenn ein Revert hinzukommt.',
        'The saved description explains the greeting commit. That message stays with the original when a revert is added.',
      ],
      '.commit-details-description',
      { prepare: recipe('source') },
    ),
    s(
      'files',
      ['Prüfe, welche Dateien der Commit geändert hat', 'Check which files the commit changed'],
      [
        'Die Liste beschreibt die gespeicherte Änderung gegen den Vorgänger. Der Revert versucht, genau diesen Patch in umgekehrter Richtung anzuwenden.',
        'The list describes the saved change against its parent. Revert attempts to apply exactly that patch in reverse.',
      ],
      '.commit-details-files',
      { prepare: recipe('source') },
    ),
    s(
      'open-source',
      ['Öffne README.md im Originalcommit', 'Open README.md in the original commit'],
      [
        'Klicke README.md in den Commit-Details und prüfe zuerst den ursprünglichen Vergleich.',
        'Click README.md in commit details and inspect the original comparison first.',
      ],
      commitPanel(4) + ' ' + commitFile(),
      { prepare: recipe('source'), completion: element(historyViewer(4)) },
    ),
    s(
      'source-tab',
      ['Wähle den ursprünglichen Diff', 'Choose the original diff'],
      [
        'Wähle Diff. Der Vergleich zeigt den vierten Commit gegen den dritten Commit.',
        'Choose Diff. The comparison shows the fourth commit against the third commit.',
      ],
      fileTab('diff'),
      { prepare: recipe('source-diff'), completion: element(historyViewer(4) + '[data-tab="diff"]') },
    ),
    s(
      'source-diff',
      ['Merke dir die Richtung der Änderung', 'Observe the direction of the change'],
      [
        'Die entfernten Zeilen gehören zum dritten Stand, die hinzugefügten zum vierten. Im Revert werden wir für diese Datei die Gegenrichtung wiederfinden.',
        'Removed lines belong to revision three and added lines to revision four. The revert will show the opposite direction for this file.',
      ],
      '.file-viewer-diff',
      { prepare: recipe('source-diff') },
    ),
    s(
      'close-source',
      ['Schließe den ursprünglichen Vergleich', 'Close the original comparison'],
      [
        'Schließe den Dateibetrachter, damit du die Git-Aktion am Commit auswählen kannst.',
        'Close the file viewer so you can choose the Git action on the commit.',
      ],
      fileControl('close-file'),
      { prepare: recipe('source-diff'), completion: closed },
    ),
    s(
      'menu',
      ['Öffne das Kontextmenü des vierten Commits', 'Open the fourth commit’s context menu'],
      [
        'Öffne das Menü mit der rechten Maustaste oder Umschalt+F10 am vierten Commit. Prüfe vor der Aktion den ausgewählten Commit.',
        'Open the menu with a right-click or Shift+F10 on the fourth commit. Check the selected commit before acting.',
      ],
      graphRow(4),
      { prepare: recipe('source'), gesture: 'contextmenu', completion: element(replayMenu('revert')) },
    ),
    s(
      'purpose',
      ['Der Revert-Eintrag nennt den Quell-Hash', 'The revert entry identifies the source hash'],
      [
        'Prüfe den Kurz-Hash im Eintrag Revert. Die Gegenänderung gilt diesem Commit; das aktuelle main ist der Branch, auf dem sie gespeichert wird.',
        'Check the short hash in Revert. The inverse change applies to this commit; the current main is the branch where it will be saved.',
      ],
      replayMenu('revert'),
      { prepare: recipe('menu') },
    ),
    s(
      'execution',
      ['Diese Aktion speichert direkt einen Revert-Commit', 'This action directly saves a revert commit'],
      [
        'Der Eintrag verwendet die automatisch erzeugte Revert-Nachricht und öffnet keinen Nachrichteneditor. In anderen Projektständen können beim Anwenden der Gegenänderung Konflikte entstehen.',
        'The entry uses the automatically generated revert message and opens no message editor. Applying the inverse change to other project revisions can cause conflicts.',
      ],
      replayMenu('revert'),
      { prepare: recipe('menu') },
    ),
    s(
      'apply',
      ['Führe den Revert aus', 'Execute the revert'],
      [
        'Klicke Revert. Die Übung erkennt den neuen Commit auf main, sobald die Gegenänderung gespeichert wurde.',
        'Click Revert. The exercise detects the new commit on main once the inverse change has been saved.',
      ],
      replayMenu('revert'),
      { prepare: recipe('menu'), completion: element(mergeHead(5)) },
    ),
    s(
      'new-head',
      ['Der Revert ist ein neuer HEAD', 'The revert is a new HEAD'],
      [
        'main zeigt nun auf einen zusätzlichen Commit. Er hat einen eigenen Hash und baut auf dem ursprünglichen vierten Commit auf.',
        'main now points to an additional commit. It has its own hash and builds on the original fourth commit.',
      ],
      mergeHead(5),
      { prepare: recipe('result') },
    ),
    s(
      'original-remains',
      ['Der ursprüngliche Commit bleibt in der Kette', 'The original commit remains in the chain'],
      [
        'Der vierte Commit steht weiter direkt unter dem Revert. Seine Nachricht und sein gespeicherter Inhalt wurden nicht verändert.',
        'The fourth commit remains directly below the revert. Its message and saved contents were not changed.',
      ],
      graphRow(4),
      { prepare: recipe('result') },
    ),
    s(
      'references',
      ['Andere Referenzen werden nicht verschoben', 'Other references do not move'],
      [
        'origin/main und v1.0.0 bleiben im Beispiel am zweiten Commit. Der lokale Revert führt keinen Push aus.',
        'origin/main and v1.0.0 remain at the second commit in this example. The local revert performs no push.',
      ],
      graphRow(2) + ' .commit-refs',
      { prepare: recipe('result') },
    ),
    s(
      'title',
      ['Der Titel nennt die zurückgenommene Änderung', 'The title names the change being undone'],
      [
        'Der neue Titel beginnt mit Revert und enthält den ursprünglichen Titel in Anführungszeichen. So bleibt der Zweck in der Historie erkennbar.',
        'The new title begins with Revert and includes the original title in quotation marks, making its purpose visible in history.',
      ],
      graphRow(5) + ' .commit-subject',
      { prepare: recipe('result') },
    ),
    s(
      'select-result',
      ['Wähle den Revert-Commit', 'Select the revert commit'],
      ['Klicke den neuen HEAD, um seine Beschreibung und seine Gegenänderung zu prüfen.', 'Click the new HEAD to inspect its description and inverse change.'],
      graphRow(5),
      { prepare: recipe('result'), completion: element(commitPanel(5)) },
    ),
    s(
      'message',
      ['Die Beschreibung verweist auf den Originalcommit', 'The description refers to the original commit'],
      [
        'This reverts commit nennt den vollständigen Hash des zurückgenommenen Commits. Die Nachricht verbindet den Revert mit seinem Anlass.',
        'This reverts commit names the full hash of the commit being undone. The message links the revert to its reason.',
      ],
      '.commit-details-description',
      { prepare: recipe('selected-result') },
    ),
    s(
      'open-result',
      ['Öffne die README-Gegenänderung', 'Open the inverse README change'],
      [
        'Öffne README.md im Revert-Commit. Dieser Vergleich zeigt die tatsächlich gespeicherte Rücknahme gegen den ursprünglichen vierten Stand.',
        'Open README.md in the revert commit. This comparison shows the actual saved undo against the original fourth revision.',
      ],
      commitPanel(5) + ' ' + commitFile(),
      { prepare: recipe('selected-result'), completion: element(historyViewer(5)) },
    ),
    s(
      'result-diff',
      ['Der Diff zeigt die umgekehrte Änderung', 'The diff shows the inverse change'],
      [
        'Die Zeilen aus dem vierten Stand werden entfernt, die Zeilen des dritten Stands wieder hinzugefügt. In diesem sauberen Beispiel entspricht der neue Dateiinhalt dem dritten Commit.',
        'Lines from revision four are removed and lines from revision three are added back. In this clean example the resulting file contents match the third commit.',
      ],
      '.file-viewer-diff',
      { prepare: recipe('result-diff') },
    ),
    s(
      'close-result',
      ['Schließe den Gegenvergleich', 'Close the inverse comparison'],
      ['Schließe den Diff, bevor wir die aktuellen Arbeitsdateien prüfen.', 'Close the diff before checking the current working files.'],
      fileControl('close-file'),
      { prepare: recipe('result-diff'), completion: closed },
    ),
    s(
      'working-area',
      ['Die Kopfzeile zeigt wieder die Arbeitsansichten', 'The header shows working views again'],
      [
        'Nach dem Schließen des Vergleichs sind Staging Area und Working Directory wieder erreichbar. Beide beziehen sich auf den aktuellen Branch mit seinem neuen Revert-Commit.',
        'After closing the comparison, Staging Area and Working Directory are available again. Both refer to the current branch with its new revert commit.',
      ],
      '[data-tutorial="open-files"]',
      { prepare: recipe('working') },
    ),
    s(
      'tree',
      ['Öffne das Working Directory', 'Open the working directory'],
      [
        'Wähle Working Directory. Der Revert hat neben dem neuen Commit auch die aktuellen erfassten Arbeitsdateien angepasst.',
        'Choose Working Directory. Along with creating the new commit, revert updated current tracked working files.',
      ],
      '[data-tutorial="open-files"]',
      { prepare: recipe('working'), completion: element('[data-tutorial="open-files"][aria-pressed="true"]') },
    ),
    s(
      'open-work',
      ['Öffne die aktuelle README-Datei', 'Open the current README file'],
      [
        'Klicke README.md im Dateibaum, um den Inhalt nach dem Revert direkt zu lesen.',
        'Click README.md in the file tree to read its contents after the revert.',
      ],
      fileRow('README.md'),
      { prepare: recipe('tree'), completion: element(historyViewer()) },
    ),
    s(
      'work-text',
      ['Lies den wiederhergestellten Dateiinhalt', 'Read the restored file contents'],
      [
        'Wähle Text. Die Datei enthält wieder den dritten gespeicherten Stand. Der neue HEAD bleibt trotzdem der zusätzliche Revert-Commit.',
        'Choose Text. The file contains the third saved revision again, while the new HEAD is still the additional revert commit.',
      ],
      fileTab('text'),
      { prepare: recipe('work'), completion: element(historyViewer() + '[data-tab="text"]') },
    ),
    s(
      'close-work',
      ['Schließe die Arbeitsdatei', 'Close the working file'],
      [
        'Schließe den Dateibetrachter. Die Gegenänderung ist bereits committet und muss nicht erneut vorgemerkt werden.',
        'Close the file viewer. The inverse change is already committed and does not need staging again.',
      ],
      fileControl('close-file'),
      { prepare: recipe('work'), completion: closed },
    ),
    s(
      'done',
      ['Gegenänderung gespeichert und Historie erhalten', 'Saved the inverse change and retained history'],
      [
        'Der neue Revert nimmt die Begrüßungsänderung zurück; der Originalcommit bleibt nachvollziehbar. Es wurde nichts veröffentlicht. Weiter beendet diese Lektion.',
        'The new revert undoes the greeting change while keeping the original commit traceable. Nothing was published. Next finishes this lesson.',
      ],
      mergeHead(5),
      { prepare: recipe('result') },
    ),
  ],
};
