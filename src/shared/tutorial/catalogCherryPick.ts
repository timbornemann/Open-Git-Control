import type { TutorialChapter } from './types';
import { replayStep as s, replayRecipe, replayMenu } from './replayLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer, fileRow, fileTab } from './historyLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
import { fileControl } from './fileLessonHelpers';
const recipe = (stage: Parameters<typeof replayRecipe>[1] = 'start') => replayRecipe('cherry-pick', stage);
const closed = { kind: 'absent' as const, selector: '.file-viewer' };
export const TUTORIAL_CHERRY_PICK: TutorialChapter = {
  id: 'cherry-pick',
  section: 'repo',
  title: ['Einen einzelnen Commit mit Cherry-pick übernehmen', 'Copy one commit with cherry-pick'],
  description: [
    'Quelle und Ziel prüfen, den ursprünglichen Diff lesen, Cherry-pick ausführen und den neuen Commit untersuchen.',
    'Check source and destination, read the original diff, cherry-pick and inspect the new commit.',
  ],
  question: ['Wie übernehme ich einen einzelnen Commit aus einem anderen Branch?', 'How do I copy a single commit from another branch?'],
  keywords: 'cherry-pick cherrypick einzelner commit übernehmen kopieren patch quelle ziel autor branch diff',
  steps: [
    s(
      'scope',
      ['Eine ausgewählte Änderung nach main kopieren', 'Copy one selected change onto main'],
      [
        'Der Beispielbranch feature/begruessung enthält bereits die App. main steht noch am ersten Commit. Wir übernehmen genau den App-Commit als neuen Commit auf main.',
        'The sample feature/begruessung branch already contains the app. main still points to the first commit. We will copy exactly the app commit as a new commit on main.',
      ],
      '[data-tutorial="graph"]',
      { prepare: recipe() },
    ),
    s(
      'destination',
      ['HEAD ist das Ziel des Cherry-picks', 'HEAD is the cherry-pick destination'],
      [
        'main am ersten Commit ist der aktive Branch. Cherry-pick hängt die ausgewählte Änderung an diesen HEAD an; es wechselt nicht zur Quelle.',
        'main at the first commit is the active branch. Cherry-pick appends the selected change to this HEAD; it does not switch to the source.',
      ],
      mergeHead(1),
      { prepare: recipe() },
    ),
    s(
      'source-branch',
      ['Der andere Branch hält den Quellcommit erreichbar', 'The other branch keeps the source commit reachable'],
      [
        'feature/begruessung und der Tag stehen am zweiten Commit. Diese Referenzen bleiben beim Kopieren an ihrem bisherigen Commit.',
        'feature/begruessung and the tag point to the second commit. Copying keeps these references at their existing commit.',
      ],
      graphRow(2) + ' .commit-refs',
      { prepare: recipe() },
    ),
    s(
      'select',
      ['Wähle den App-Commit', 'Select the app commit'],
      [
        'Klicke den zweiten Commit mit dem Titel zum Anlegen der App. Seine Details zeigen die Änderung, die wir übernehmen wollen.',
        'Click the second commit whose title adds the app. Its details show the change we intend to copy.',
      ],
      graphRow(2),
      { prepare: recipe(), completion: element(commitPanel(2)) },
    ),
    s(
      'message',
      ['Lies die Beschreibung der Quelle', 'Read the source description'],
      [
        'Die Beschreibung nennt Anwendung und Paketkonfiguration. Cherry-pick übernimmt standardmäßig die vorhandene Commit-Nachricht.',
        'The description names the application and package configuration. Cherry-pick keeps the existing commit message by default.',
      ],
      '.commit-details-description',
      { prepare: recipe('source') },
    ),
    s(
      'author',
      ['Die Urheberschaft gehört zur übernommenen Änderung', 'Authorship belongs to the copied change'],
      [
        'Sam Beispiel ist der Autor des App-Commits. Beim normalen Cherry-pick bleibt dieser Autor erhalten, auch wenn jemand anderes den neuen Commit erstellt.',
        'Sam Beispiel authored the app commit. A normal cherry-pick retains that author even when someone else creates the new commit.',
      ],
      graphRow(2) + ' .commit-author',
      { prepare: recipe('source') },
    ),
    s(
      'files',
      ['Die Dateiliste grenzt den Umfang ein', 'The file list defines the scope'],
      [
        'Die Liste zeigt nur die Änderungen dieses Commits gegenüber seinem Vorgänger. Cherry-pick kopiert dessen Patch und nicht automatisch spätere Arbeiten des Quellbranches.',
        'The list shows this commit’s changes against its parent. Cherry-pick copies that patch without automatically copying later work from the source branch.',
      ],
      '.commit-details-files',
      { prepare: recipe('source') },
    ),
    s(
      'open-source',
      ['Öffne den ursprünglichen README-Diff', 'Open the original README diff'],
      [
        'Klicke README.md in den Commit-Details. Prüfe den Inhalt vor der Übernahme.',
        'Click README.md in commit details. Inspect the contents before copying.',
      ],
      commitPanel(2) + ' ' + commitFile(),
      { prepare: recipe('source'), completion: element(historyViewer(2)) },
    ),
    s(
      'source-tab',
      ['Wähle die Diff-Ansicht', 'Choose the diff view'],
      [
        'Wähle Diff, um den gespeicherten App-Commit mit seinem ersten Vorgänger zu vergleichen.',
        'Choose Diff to compare the saved app commit with its first parent.',
      ],
      fileTab('diff'),
      { prepare: recipe('source-diff'), completion: element(historyViewer(2) + '[data-tab="diff"]') },
    ),
    s(
      'source-diff',
      ['Der Diff markiert die Ergänzungen zur README', 'The diff marks additions to the README'],
      [
        'Die bestehende Überschrift bleibt erhalten. Die mit Plus markierten Zeilen ergänzen den kurzen Projekttext. Hier werden keine bisherigen Zeilen entfernt. Diese Ergänzung gehört zum zu kopierenden Patch.',
        'The existing heading remains. Lines marked with a plus add the short project text. No previous lines are removed here. This addition belongs to the patch we will copy.',
      ],
      '.file-viewer-diff',
      { prepare: recipe('source-diff') },
    ),
    s(
      'close-source',
      ['Schließe den ursprünglichen Diff', 'Close the original diff'],
      [
        'Schließe den Dateibetrachter, um zur Commit-Auswahl zurückzukehren. Das Lesen des Diffs verändert keine Dateien.',
        'Close the file viewer to return to commit selection. Reading the diff changes no files.',
      ],
      fileControl('close-file'),
      { prepare: recipe('source-diff'), completion: closed },
    ),
    s(
      'menu',
      ['Öffne das Kontextmenü der Quelle', 'Open the source context menu'],
      [
        'Öffne am zweiten Commit das Kontextmenü mit der rechten Maustaste oder Umschalt+F10. Der angeklickte Commit ist die Quelle, HEAD bleibt das Ziel.',
        'Open the second commit’s context menu with a right-click or Shift+F10. The selected commit is the source; HEAD remains the destination.',
      ],
      graphRow(2),
      { prepare: recipe('source'), gesture: 'contextmenu', completion: element(replayMenu('cherry-pick')) },
    ),
    s(
      'purpose',
      ['Cherry-pick gilt genau diesem Quellcommit', 'Cherry-pick applies exactly this source commit'],
      [
        'Prüfe den Kurz-Hash im Menüeintrag. Die Aktion übernimmt die Änderung dieses Commits auf main, ohne die Branches zu verschmelzen.',
        'Check the short hash in the menu entry. The action copies this commit’s change onto main without merging the branches.',
      ],
      replayMenu('cherry-pick'),
      { prepare: recipe('menu') },
    ),
    s(
      'execution',
      ['Der Menüeintrag führt die Aktion direkt aus', 'The menu entry executes the action immediately'],
      [
        'Hier folgt kein eigener Nachrichteneditor. Nach dem Klick wendet die App den Patch an und erstellt bei Erfolg den Commit. In echten Projekten können dabei Konflikte entstehen.',
        'There is no separate message editor here. Clicking applies the patch and creates the commit on success. Real projects can encounter conflicts.',
      ],
      replayMenu('cherry-pick'),
      { prepare: recipe('menu') },
    ),
    s(
      'apply',
      ['Übernimm den App-Commit nach main', 'Cherry-pick the app commit onto main'],
      [
        'Klicke Cherry-pick. Die Übung wartet auf einen neuen HEAD auf main. Die gesamte Aktion bleibt innerhalb der Beispieldaten.',
        'Click Cherry-pick. The exercise waits for a new HEAD on main. The entire action stays within the sample data.',
      ],
      replayMenu('cherry-pick'),
      { prepare: recipe('menu'), completion: element(mergeHead(5)) },
    ),
    s(
      'new-hash',
      ['Die übernommene Änderung hat einen neuen Commit-Hash', 'The copied change has a new commit hash'],
      [
        'main zeigt jetzt auf den neuen Commit. Sein eigener Hash unterscheidet ihn vom ursprünglichen App-Commit; Autor und Nachricht können trotzdem übereinstimmen.',
        'main now points to the new commit. Its own hash distinguishes it from the original app commit, even though author and message can match.',
      ],
      graphRow(5) + ' .commit-hash',
      { prepare: recipe('result') },
    ),
    s(
      'parent',
      ['Der neue Commit baut auf dem bisherigen HEAD auf', 'The new commit builds on the previous HEAD'],
      [
        'Die Graphlinie führt vom neuen Commit zum ersten Commit auf main. Es entsteht ein einzelner Commit mit einem Vorgänger und kein Merge-Commit.',
        'The graph line connects the new commit to main’s first commit. This creates one commit with one parent, rather than a merge commit.',
      ],
      mergeHead(5),
      { prepare: recipe('result') },
    ),
    s(
      'source-remains',
      ['Die ursprüngliche Quelle bleibt erhalten', 'The original source remains intact'],
      [
        'feature/begruessung und v1.0.0 zeigen weiterhin auf den ursprünglichen zweiten Commit. Cherry-pick hat diesen Commit nicht verschoben oder umgeschrieben.',
        'feature/begruessung and v1.0.0 still point to the original second commit. Cherry-pick did not move or rewrite that commit.',
      ],
      graphRow(2) + ' .commit-refs',
      { prepare: recipe('result') },
    ),
    s(
      'select-result',
      ['Wähle den neuen Commit auf main', 'Select the new commit on main'],
      ['Klicke den neuen HEAD. Seine Details gehören jetzt zur kopierten Fassung.', 'Click the new HEAD. Its details now belong to the copied version.'],
      graphRow(5),
      { prepare: recipe('result'), completion: element(commitPanel(5)) },
    ),
    s(
      'copied-message',
      ['Die Beschreibung wurde übernommen', 'The description was copied'],
      [
        'Die neue Beschreibung erklärt weiterhin Anwendung und Paketkonfiguration. Für diesen Cherry-pick musste keine neue Nachricht eingetragen werden.',
        'The new description still explains the application and package configuration. This cherry-pick needed no new message.',
      ],
      '.commit-details-description',
      { prepare: recipe('selected-result') },
    ),
    s(
      'copied-author',
      ['Sam bleibt als Autor sichtbar', 'Sam remains visible as the author'],
      [
        'Die Zeile des neuen Commits nennt weiterhin Sam Beispiel. Der neue Commit gehört zur Historie von main und bewahrt die Urheberschaft der Änderung.',
        'The new commit’s row still names Sam Beispiel. The new commit belongs to main’s history and preserves the change’s authorship.',
      ],
      graphRow(5) + ' .commit-author',
      { prepare: recipe('selected-result') },
    ),
    s(
      'open-result',
      ['Prüfe den Diff der übernommenen Fassung', 'Inspect the copied version’s diff'],
      [
        'Öffne README.md im neuen Commit. So lässt sich prüfen, welche Änderung tatsächlich auf main gespeichert wurde.',
        'Open README.md in the new commit to inspect the change actually saved on main.',
      ],
      commitPanel(5) + ' ' + commitFile(),
      { prepare: recipe('selected-result'), completion: element(historyViewer(5)) },
    ),
    s(
      'result-diff',
      ['Der neue Diff enthält den übernommenen Patch', 'The new diff contains the copied patch'],
      [
        'Der Vergleich gilt dem neuen Commit gegen seinen Vorgänger auf main. In diesem vorbereiteten Beispiel entspricht die README-Änderung dem zuvor gelesenen Quell-Patch.',
        'This comparison is between the new commit and its parent on main. In this prepared example the README change matches the source patch read earlier.',
      ],
      '.file-viewer-diff',
      { prepare: recipe('result-diff') },
    ),
    s(
      'close-result',
      ['Schließe auch diesen Vergleich', 'Close this comparison too'],
      ['Schließe den Diff, bevor wir die aktuellen Arbeitsdateien ansehen.', 'Close the diff before inspecting current working files.'],
      fileControl('close-file'),
      { prepare: recipe('result-diff'), completion: closed },
    ),
    s(
      'working-area',
      ['Der Inspektor bietet wieder die Arbeitsansichten an', 'The inspector offers working views again'],
      [
        'Mit dem geschlossenen Vergleich sind wir zurück im Graphen. Die Kopfzeile des Inspektors bietet jetzt Staging Area und Working Directory für den aktuellen Branch an.',
        'Closing the comparison returned us to the graph. The inspector header now offers Staging Area and Working Directory for the current branch.',
      ],
      '[data-tutorial="open-files"]',
      { prepare: recipe('working') },
    ),
    s(
      'tree',
      ['Öffne das Working Directory', 'Open the working directory'],
      [
        'Wähle Working Directory im Inspektor. Hier liegen die aktuellen Dateien des aktiven main-Branches.',
        'Choose Working Directory in the inspector. It contains the active main branch’s current files.',
      ],
      '[data-tutorial="open-files"]',
      { prepare: recipe('working'), completion: element('[data-tutorial="open-files"][aria-pressed="true"]') },
    ),
    s(
      'open-work',
      ['Öffne die aktuelle README-Datei', 'Open the current README file'],
      [
        'Klicke README.md im Dateibaum. Die Arbeitsdatei wurde beim erfolgreichen Cherry-pick auf den neuen Stand gebracht.',
        'Click README.md in the file tree. The successful cherry-pick updated the working file to the new revision.',
      ],
      fileRow('README.md'),
      { prepare: recipe('tree'), completion: element(historyViewer()) },
    ),
    s(
      'work-text',
      ['Lies den aktuellen Inhalt', 'Read the current contents'],
      [
        'Wähle Text. Die aktuelle README beschreibt jetzt die App; die gespeicherte Änderung ist im Arbeitsordner angekommen.',
        'Choose Text. The current README now describes the app; the saved change is present in the working directory.',
      ],
      fileTab('text'),
      { prepare: recipe('work'), completion: element(historyViewer() + '[data-tab="text"]') },
    ),
    s(
      'close-work',
      ['Schließe die Arbeitsdatei', 'Close the working file'],
      [
        'Schließe den Betrachter. Es wurden keine zusätzlichen offenen Änderungen angelegt.',
        'Close the viewer. No additional uncommitted changes were created.',
      ],
      fileControl('close-file'),
      { prepare: recipe('work'), completion: closed },
    ),
    s(
      'done',
      ['Einzelnen Patch übernommen und Ergebnis geprüft', 'Copied one patch and checked the result'],
      [
        'main enthält den neuen App-Commit. Die Quelle bleibt erhalten und es wurde nichts gepusht. Weiter beendet diese Lektion; Konflikte und laufende Sequenzen brauchen eigene Übungen.',
        'main contains the new app commit. The source remains intact and nothing was pushed. Next finishes this lesson; conflicts and in-progress sequences need separate exercises.',
      ],
      mergeHead(5),
      { prepare: recipe('result') },
    ),
  ],
};
