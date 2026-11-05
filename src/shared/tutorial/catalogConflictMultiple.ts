import type { TutorialChapter, TutorialCompletion } from './types';
import { conflictStep as s, conflictControl as c, conflictOpen } from './conflictLessonHelpers';
import {
  conflictMultipleRecipe as seed,
  multipleContent as content,
  multipleEditor as editor,
  multiplePosition as position,
  multipleDraft as draft,
  multipleResolved,
} from './conflictMultipleHelpers';
import { mergeHead, mergeDialog, mergeCancel, mergeContext, element } from './mergeLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer, blameLine, historyEntry, historyList } from './historyLessonHelpers';
import { fileControl, fileTab } from './fileLessonHelpers';
const partialSaved: TutorialCompletion = {
  kind: 'all',
  conditions: [
    element(editor('README.md', 1) + '[data-conflict-dirty="false"]'),
    { kind: 'working-tree', staged: [], content: [{ path: 'README.md', source: 'worktree', value: content('first-incoming') }] },
  ],
};
const readmeResolved: TutorialCompletion = {
  kind: 'all',
  conditions: [
    element(editor('LICENSE', 0)),
    element(c('section') + '[data-conflict-files="1"]'),
    { kind: 'working-tree', staged: ['README.md'], content: [{ path: 'README.md', source: 'index', value: content('mixed') }] },
  ],
};
export const TUTORIAL_CONFLICT_MULTIPLE: TutorialChapter = {
  id: 'conflicts-multiple',
  section: 'repo',
  title: ['Mehrere Konfliktdateien und Blöcke nacheinander auflösen', 'Resolve multiple conflict files and blocks in order'],
  description: [
    'Navigiere durch zwei README-Blöcke und eine zweite Konfliktdatei. Schütze einen Entwurf beim Dateiwechsel, speichere einen Zwischenstand und kombiniere gezielt die Inhalte.',
    'Navigate two README blocks and a second conflict file. Protect a draft when switching files, save an intermediate revision and deliberately combine the contents.',
  ],
  question: [
    'Wie löse ich mehrere Konfliktblöcke und Dateien, ohne meinen Entwurf zu verlieren?',
    'How do I resolve multiple conflict blocks and files without losing my draft?',
  ],
  keywords: 'konflikt conflict mehrere dateien blöcke navigation next previous vor zurück entwurf dateiwechsel modify delete blame',
  steps: [
    s(
      'overview',
      ['Zwei Dateien, zwei Textblöcke und ein Löschkonflikt', 'Two files, two text blocks and a deletion conflict'],
      [
        'Ein neuer Übungs-Merge ist vorbereitet. README.md enthält zwei getrennte Textkonflikte. LICENSE wurde auf main geändert und im Quellbranch gelöscht. Wir lösen erst die README und behalten diesmal die geänderte LICENSE.',
        'A new practice merge is prepared. README.md has two separate text conflicts. LICENSE was modified on main and deleted in the source branch. We resolve README first and keep the modified LICENSE this time.',
      ],
      '[data-tutorial="graph"]',
      { continue: false, prepare: seed() },
    ),
    s(
      'counts',
      ['Datei- und Blockanzahl bedeuten etwas anderes', 'File and block counts mean different things'],
      [
        'Der Konfliktbereich enthält zwei Dateien. Die beiden erkannten Textblöcke liegen in der README. Ein Ändern/Löschen-Konflikt wie LICENSE benötigt ebenfalls eine Entscheidung, enthält aber keine Textmarker.',
        'The conflict section contains two files. The two detected text blocks are in README. A modify/delete conflict such as LICENSE also needs a choice but has no text markers.',
      ],
      c('section'),
      { prepare: seed() },
    ),
    s(
      'open',
      ['Öffne README.md mit ihren zwei Konfliktblöcken', 'Open README.md with its two conflict blocks'],
      ['Öffne die README aus der Konfliktliste im Staging.', 'Open README from the conflict list in Staging.'],
      conflictOpen,
      { prepare: seed(), completion: element(editor('README.md', 2)) },
    ),
    s(
      'position',
      ['Die Navigation nennt Datei und Block getrennt', 'Navigation identifies the file and block separately'],
      [
        'README ist hier die zweite Datei der sortierten Liste und zeigt Block 1 von 2. Die Pfeile wechseln zunächst zwischen Blöcken derselben Datei und danach zur benachbarten Konfliktdatei.',
        'README is the second file in the sorted list and shows block 1 of 2. The arrows first move between blocks in the same file, then to the adjacent conflict file.',
      ],
      c('position'),
      { prepare: seed('open') },
    ),
    s(
      'next-block',
      ['Gehe zum zweiten README-Block', 'Go to the second README block'],
      [
        'Klicke Weiter in der Konfliktnavigation. Der Entwurf bleibt unverändert; nur der ausgewählte Block wechselt.',
        'Click Next in the conflict navigation. The draft stays unchanged; only the selected block changes.',
      ],
      c('next'),
      { prepare: seed('open'), completion: element(position(2)) },
    ),
    s(
      'closing',
      ['Der zweite Block betrifft den Abschluss', 'The second block concerns the closing'],
      [
        'Oben vergleichst du jetzt Auf Wiedersehen mit Bis morgen. Die Begrüßung im ersten Block ist weiterhin offen. Die Navigation speichert oder löst noch nichts auf.',
        'You now compare Goodbye with See you tomorrow above. The greeting in the first block is still open. Navigation does not save or resolve anything.',
      ],
      c('comparison'),
      { prepare: seed('second') },
    ),
    s(
      'previous-block',
      ['Kehre zum ersten Block zurück', 'Return to the first block'],
      [
        'Klicke Zurück in der Konfliktnavigation. Wir entscheiden zuerst über die Begrüßung.',
        'Click Previous in the conflict navigation. We will choose the greeting first.',
      ],
      c('previous'),
      { prepare: seed('second'), completion: element(position(1)) },
    ),
    s(
      'take-greeting',
      ['Übernimm Eingehend nur für die Begrüßung', 'Take Incoming only for the greeting'],
      [
        'Übernimm im ausgewählten ersten Block die eingehende Team-Begrüßung. Der zweite Block bleibt mit seinen Markern bestehen.',
        'Take the incoming team greeting for the selected first block. The second block remains with its markers.',
      ],
      c('take-theirs'),
      { prepare: seed('first'), completion: draft('first-incoming') },
    ),
    s(
      'partial',
      ['Ein Block ist gelöst, die Datei noch nicht', 'One block is resolved, the file is not'],
      [
        'Der Editor enthält die Team-Begrüßung und noch einen offenen Abschlussblock. Diese Auswahl ist weiterhin ein ungespeicherter Entwurf; die ganze Datei kann noch nicht als gelöst markiert werden.',
        'The editor contains the team greeting and one open closing block. This choice is still an unsaved draft; the whole file cannot yet be marked resolved.',
      ],
      c('editor'),
      { prepare: seed('chosen') },
    ),
    s(
      'request-switch',
      ['Versuche zur vorherigen Konfliktdatei zu wechseln', 'Try switching to the previous conflict file'],
      [
        'Es gibt nur noch einen README-Block. Zurück würde jetzt zur vorherigen Datei LICENSE wechseln. Klicke den Pfeil, um den Schutz des ungespeicherten Entwurfs zu sehen.',
        'Only one README block remains. Previous would now switch to LICENSE, the previous file. Click the arrow to see the unsaved-draft guard.',
      ],
      c('previous'),
      { prepare: seed('chosen'), completion: element(mergeDialog) },
    ),
    s(
      'switch-source',
      ['Der Entwurf gehört weiterhin zu README.md', 'The draft still belongs to README.md'],
      [
        'Die Bestätigung nennt die aktuelle Datei. Der Entwurf wurde noch nicht gespeichert und würde beim bestätigten Wechsel verworfen.',
        'The confirmation names the current file. The draft has not been saved and would be discarded by a confirmed switch.',
      ],
      mergeContext(1),
      { prepare: seed('review') },
    ),
    s(
      'switch-target',
      ['LICENSE ist das gewünschte Wechselziel', 'LICENSE is the requested destination'],
      [
        'Die zweite Zeile nennt die Zieldatei. Die Bestätigung betrifft den Editor-Entwurf und den Dateiwechsel, nicht den gesamten Merge.',
        'The second row names the destination file. The confirmation concerns the editor draft and file switch, not the whole merge.',
      ],
      mergeContext(2),
      { prepare: seed('review') },
    ),
    s(
      'cancel-switch',
      ['Behalte den Entwurf und bleibe in der README', 'Keep the draft and stay in README'],
      [
        'Brich die Dateiwechselbestätigung ab. Wir speichern den Teilfortschritt zuerst.',
        'Cancel the file-switch confirmation. We will save the partial progress first.',
      ],
      mergeCancel,
      { prepare: seed('review'), completion: { kind: 'absent', selector: '[data-dialog-action="confirm"]' } },
    ),
    s(
      'kept',
      ['Die Team-Begrüßung ist noch im Entwurf vorhanden', 'The team greeting is still in the draft'],
      [
        'Du bleibst in README.md. Die gewählte Team-Begrüßung und der offene Abschlussblock sind erhalten. Es wurde keine Konfliktdatei aufgelöst.',
        'You remain in README.md. The chosen team greeting and open closing block are intact. No conflict file was resolved.',
      ],
      c('content'),
      { prepare: seed('cancelled') },
    ),
    s(
      'save-partial',
      ['Speichere den Teilfortschritt ohne Auflösung', 'Save partial progress without resolving'],
      [
        'Klicke Speichern. Auch ein Zwischenstand mit verbleibenden Markern kann als Arbeitsdatei gespeichert werden. Die README bleibt im Index als Konflikt offen.',
        'Click Save. An intermediate revision with remaining markers can be saved as a working file too. README remains conflicted in the index.',
      ],
      c('save'),
      { prepare: seed('cancelled'), completion: partialSaved },
    ),
    s(
      'previous-file',
      ['Wechsle nun ohne Entwurfsverlust zu LICENSE', 'Now switch to LICENSE without losing the draft'],
      [
        'Klicke erneut Zurück in der Konfliktnavigation. Der aktuelle Entwurf ist gespeichert; der Dateiwechsel braucht deshalb keine Verwerfungsbestätigung.',
        'Click Previous in the conflict navigation again. The current draft is saved, so switching files no longer needs a discard confirmation.',
      ],
      c('previous'),
      { prepare: seed('saved'), completion: element(editor('LICENSE', 0)) },
    ),
    s(
      'no-markers',
      ['Ein Löschkonflikt benötigt keine Textmarker', 'A deletion conflict does not need text markers'],
      [
        'LICENSE zeigt die geänderte aktuelle Datei. Die andere Seite hat sie gelöscht. Deshalb gibt es keinen Vergleichsblock, trotzdem ist die Datei noch nicht als gelöst entschieden.',
        'LICENSE shows the modified current file. The other side deleted it. There is no comparison block, but the file still needs an explicit resolution.',
      ],
      c('editor'),
      { prepare: seed('license') },
    ),
    s(
      'next-file',
      ['Kehre über die Navigation zur README zurück', 'Return to README using navigation'],
      [
        'Weiter funktioniert auch von einer Datei ohne Textblöcke aus. Wechsle zurück zur README und ihrem gespeicherten Zwischenstand.',
        'Next works from a file without text blocks too. Return to README and its saved intermediate revision.',
      ],
      c('next'),
      { prepare: seed('license'), completion: element(editor('README.md', 1)) },
    ),
    s(
      'restored-partial',
      ['Der Teilfortschritt wurde aus der Arbeitsdatei geladen', 'Partial progress was loaded from the working file'],
      [
        'Die Team-Begrüßung ist bereits gespeichert. Offen ist weiterhin der Abschlussblock. Du musst die erste Entscheidung nach dem Dateiwechsel nicht erneut treffen.',
        'The team greeting is already saved. The closing block is still open. You do not need to make the first choice again after switching files.',
      ],
      c('content'),
      { prepare: seed('returned') },
    ),
    s(
      'take-closing',
      ['Behalte für den Abschluss die aktuelle Fassung', 'Keep the current version for the closing'],
      [
        'Übernimm diesmal die aktuelle Fassung Auf Wiedersehen. Damit kombinierst du eine Entscheidung aus der Quelle mit einer aus main, statt pauschal die ganze Datei von einer Seite zu nehmen.',
        'This time take the current Goodbye version. You combine a choice from the source with one from main instead of taking the whole file from one side.',
      ],
      c('take-ours'),
      { prepare: seed('returned'), completion: draft('mixed') },
    ),
    s(
      'save-readme',
      ['Speichere und löse nur README.md auf', 'Save and resolve only README.md'],
      [
        'Speichere den markerfreien Entwurf mit Speichern + gelöst. Nur diese Datei wird aufgelöst. LICENSE benötigt weiterhin eine eigene Entscheidung.',
        'Save the marker-free draft with Save + resolved. Only this file is resolved. LICENSE still needs its own choice.',
      ],
      c('save-resolved'),
      { prepare: seed('mixed'), completion: readmeResolved },
    ),
    s(
      'remaining',
      ['Die zweite Datei bleibt ein Konflikt', 'The second file remains conflicted'],
      [
        'README.md ist vorgemerkt. Der Konfliktlöser zeigt nun die verbleibende LICENSE. Eine aufgelöste Datei beendet weder die anderen Konflikte noch den gesamten Merge.',
        'README.md is staged. The resolver now shows the remaining LICENSE. Resolving one file finishes neither the other conflicts nor the whole merge.',
      ],
      c('editor'),
      { prepare: seed('readme-resolved') },
    ),
    s(
      'keep-license',
      ['Behalte diesmal die geänderte LICENSE', 'Keep the modified LICENSE this time'],
      [
        'Die aktuelle LICENSE ist hier die gewünschte Lösung. Klicke Als gelöst markieren, ohne sie zu löschen. Da ihr Inhalt bereits dem bisherigen main entspricht, entsteht für diese Datei kein neuer Index-Diff.',
        'The current LICENSE is the desired resolution here. Click Mark as resolved without deleting it. Its contents already match the old main, so this file creates no new index diff.',
      ],
      c('mark'),
      { prepare: seed('readme-resolved'), completion: multipleResolved },
    ),
    s(
      'index',
      ['Nur die gemischte README ist neu vorgemerkt', 'Only the mixed README is newly staged'],
      [
        'Es gibt keine offene Konfliktdatei mehr. README.md enthält die Kombination beider Entscheidungen. LICENSE bleibt erhalten und unverändert gegenüber dem bisherigen main.',
        'No conflict file remains. README.md contains the combination of both choices. LICENSE is retained unchanged relative to the old main.',
      ],
      '[data-tutorial="staged-files"]',
      { prepare: seed('resolved') },
    ),
    s(
      'continue',
      ['Schließe jetzt den gesamten Merge ab', 'Now finish the whole merge'],
      ['Setze den Merge nach beiden Datei-Entscheidungen fort.', 'Continue the merge after both file resolutions.'],
      c('continue'),
      { prepare: seed('resolved'), completion: element(mergeHead(6)) },
    ),
    s(
      'select-commit',
      ['Wähle den neuen Merge-Commit', 'Select the new merge commit'],
      ['Öffne den Commit-Inspektor für die endgültige Kombination.', 'Open the commit inspector for the final combination.'],
      graphRow(6),
      { prepare: seed('continued'), completion: element(commitPanel(6)) },
    ),
    s(
      'open-diff',
      ['Öffne den gespeicherten README-Diff', 'Open the saved README diff'],
      ['Prüfe den Unterschied zum bisherigen main.', 'Inspect the difference from the old main.'],
      commitPanel(6) + ' ' + commitFile(),
      { prepare: seed('commit'), completion: element(historyViewer(6)) },
    ),
    s(
      'read-diff',
      ['Die Begrüßung ist geändert, der aktuelle Abschluss bleibt', 'The greeting changed while the current closing remains'],
      [
        'Der Diff zeigt die übernommene Team-Begrüßung. Für den aktuellen Abschluss gibt es gegenüber main keine neue Änderung. Im nächsten Schritt prüfen wir zusätzlich den vollständigen Text.',
        'The diff shows the accepted team greeting. The current closing has no new change relative to main. Next we also check the whole text.',
      ],
      historyViewer(6),
      { prepare: seed('diff') },
    ),
    s(
      'text',
      ['Wechsle zum vollständigen gespeicherten Text', 'Switch to the complete saved text'],
      ['Öffne Text, um Begrüßung und Abschluss gemeinsam zu lesen.', 'Open Text to read the greeting and closing together.'],
      fileTab('text'),
      { prepare: seed('diff'), completion: element(historyViewer(6) + '[data-tab="text"]') },
    ),
    s(
      'contents',
      ['Zwei unterschiedliche Entscheidungen sind gemeinsam gespeichert', 'Two different choices are saved together'],
      [
        'Im gespeicherten Text stehen die Team-Begrüßung und Auf Wiedersehen. Die gemeinsamen Arbeitsweise-Zeilen sind erhalten. Es sind keine Konfliktmarker übrig.',
        'The saved text contains the team greeting and Goodbye. The common workflow lines remain. No conflict markers are left.',
      ],
      historyViewer(6),
      { prepare: seed('text') },
    ),
    s(
      'blame',
      ['Prüfe die Herkunft der beiden übernommenen Zeilen', 'Check the origins of the two retained lines'],
      [
        'Öffne Blame. Der Merge speichert die Kombination, aber unverändert übernommene Zeilen behalten ihre ursprünglichen Quellen-Commits.',
        'Open Blame. The merge saves the combination, but unchanged inherited lines retain their original source commits.',
      ],
      fileTab('blame'),
      { prepare: seed('text'), completion: element(blameLine(3, 5)) },
    ),
    s(
      'greeting-origin',
      ['Die Team-Begrüßung stammt vom Quellen-Commit', 'The team greeting comes from the source commit'],
      ['Zeile 3 wird dem fünften Commit von feature/begruessung zugeordnet.', 'Line 3 is attributed to the fifth commit on feature/begruessung.'],
      blameLine(3, 5),
      { prepare: seed('blame') },
    ),
    s(
      'closing-origin',
      ['Der Abschluss stammt vom bisherigen main', 'The closing comes from the previous main'],
      [
        'Zeile 10 bleibt dem vierten Commit zugeordnet. Die Kombination macht diese Zeile nicht neu verfasst.',
        'Line 10 remains attributed to the fourth commit. Combining the file does not make this line newly authored.',
      ],
      blameLine(10, 4),
      { prepare: seed('blame') },
    ),
    s(
      'file-history',
      ['Öffne den Dateiverlauf nach dem Merge', 'Open the file history after the merge'],
      [
        'Wechsle zu Historie. Der Dateiverlauf folgt den Änderungen der README auch über beide Vorgänger des Merges.',
        'Switch to History. The file history follows README changes through both parents of the merge.',
      ],
      fileTab('history'),
      { prepare: seed('blame'), completion: element(historyList(5, 4, 3, 2, 1)) },
    ),
    s(
      'source-history',
      ['Die Änderung des Quellen-Branches ist auffindbar', 'The source branch change can be found'],
      [
        'Der fünfte Commit von feature/begruessung erscheint im Dateiverlauf. Die Historie beschränkt sich nach dem Merge nicht auf den bisherigen main.',
        'The fifth commit on feature/begruessung appears in the file history. After the merge, history is not limited to the previous main.',
      ],
      historyEntry(5),
      { prepare: seed('history') },
    ),
    s(
      'current-history',
      ['Auch die Änderung des bisherigen main bleibt sichtbar', 'The previous main change also remains visible'],
      [
        'Der vierte Commit enthält den beibehaltenen Abschluss. Dieser Dateiverlauf führt die beiden Quellen und ihre gemeinsame Vorgeschichte auf. Der verbindende Merge ist hier kein zusätzlicher Dateieintrag; im Graphen bleibt er als sechster Commit sichtbar.',
        'The fourth commit contains the retained closing. This file history lists both sources and their common history. The joining merge is not an additional file entry here; it remains visible as the sixth commit in the graph.',
      ],
      historyEntry(4),
      { prepare: seed('history') },
    ),
    s(
      'close-file',
      ['Schließe die Ergebnisprüfung', 'Close the result check'],
      ['Kehre zum abgeschlossenen Merge im Graphen zurück.', 'Return to the completed merge in the graph.'],
      fileControl('close-file'),
      { prepare: seed('history'), completion: { kind: 'absent', selector: historyViewer(6) } },
    ),
    s(
      'finish',
      ['Blöcke, Dateien und Merge getrennt abschließen', 'Finish blocks, files and the merge separately'],
      [
        'Du hast zwischen Blöcken und Dateien navigiert, einen Entwurf vor Verlust geschützt, Teilfortschritt gespeichert und zwei Datei-Entscheidungen abgeschlossen. Diff, Text, Zeilenherkunft und Dateiverlauf bestätigen das Ergebnis. Weiter beendet diese Lektion.',
        'You navigated blocks and files, protected a draft, saved partial progress and completed two file resolutions. Diff, text, line origins and file history confirm the result. Next finishes this lesson.',
      ],
      '[data-tutorial="graph"]',
      { prepare: seed('continued') },
    ),
  ],
};
