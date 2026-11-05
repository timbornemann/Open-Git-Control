import type { TutorialChapter } from './types';
import {
  diffStep as s,
  diffControl as c,
  diffRow as row,
  block,
  selectionUnit as unit,
  selectionCount as count,
  diffRecipe as seed,
  diffState,
  viewer,
} from './diffLessonHelpers';
import { element } from './stagingLessonHelpers';
const selected = (index = 0) => `${unit(index)}[aria-pressed="true"]`;
const pair = seed('head', 'unstaged', { click: [unit()] });
const range = seed('head', 'unstaged', { click: [unit(), unit(1)] });
const two = `${viewer}:has(${selected()}):has(${selected(1)}):not(:has(${selected(2)})) ${count(2)}`;
const emptyIndex = seed('greeting', 'staged', { click: [unit()], submit: c('apply-line-selection'), ready: '.diff-empty-state' });

export const TUTORIAL_DIFF_LINES: TutorialChapter = {
  id: 'diff-lines',
  section: 'repo',
  title: ['Zeilenpaare auswählen und gezielt stagen', 'Select line pairs and stage precisely'],
  description: [
    'Ersetzungspaare, Abwählen, Auswahl aufheben, Umschalt-Bereich und gezieltes Stagen/Unstagen praktisch üben.',
    'Practice replacement pairs, deselecting, clearing, Shift ranges, and staging/unstaging selected changes.',
  ],
  question: ['Wie stage oder unstage ich einzelne Zeilen?', 'How do I stage or unstage individual lines?'],
  keywords: 'zeilen line selection pair auswahl umschalt shift range partial stage unstage diff',
  steps: [
    s(
      'overview',
      ['Ein Hunk kann noch weiter aufgeteilt werden', 'A hunk can be divided further'],
      [
        'Die frische README enthält mehrere Ersetzungen im ersten Hunk. Diesmal wählen wir einzelne Änderungspaare aus. So können beispielsweise Begrüßung und Autor in verschiedene Commits gelangen, obwohl sie direkt untereinander stehen.',
        'The fresh README has several replacements in its first hunk. This time we select individual change pairs. Greeting and author can then go into different commits even though their lines are adjacent.',
      ],
      row('unstaged'),
      { continue: false, openView: undefined },
    ),
    s(
      'open-diff',
      ['Öffne die README-Änderung', 'Open the README change'],
      [
        'Klicke README.md unter Änderungen. Links an den geänderten Zeilen erscheinen kleine Plus-Schaltflächen; oberhalb des Diffs steht die Zeilenauswahl.',
        'Click README.md under Changes. Small plus buttons appear beside changed lines, with the line selection bar above the diff.',
      ],
      row('unstaged'),
      { openView: undefined, completion: element(`${viewer} ${unit()}`) },
    ),
    s(
      'pairs',
      ['Eine Ersetzung gehört als Alt-Neu-Paar zusammen', 'A replacement is one old/new pair'],
      [
        'Eine ersetzte Zeile hat einen roten alten und grünen neuen Inhalt. Beide werden gemeinsam ausgewählt. Das vermeidet einen Zwischenstand, in dem nur die alte Zeile entfernt, ihre neue Fassung aber noch nicht übernommen ist.',
        'A replaced line has red old contents and green new contents. They are selected together, avoiding an intermediate version that removes the old line without taking its replacement.',
      ],
      block(),
    ),
    s(
      'select-first',
      ['Wähle nur die Begrüßungsänderung aus', 'Select the greeting change only'],
      [
        'Klicke das kleine Plus an Greeting: Hello! oder Greeting: Welcome!. Noch wird nichts gestagt; du stellst zunächst eine Auswahl zusammen.',
        'Click the small plus beside Greeting: Hello! or Greeting: Welcome!. Nothing is staged yet; first you build a selection.',
      ],
      unit(),
      { completion: element(selected()) },
    ),
    s(
      'pair-selected',
      ['Beide Seiten sind markiert', 'Both sides are selected'],
      [
        'Die alte und neue Begrüßungszeile sind gemeinsam hervorgehoben. Die Leiste zählt eine Änderung, nicht zwei Textzeilen. Autor, Status und der entfernte zweite Hunk bleiben unmarkiert.',
        'The old and new greeting lines are highlighted together. The bar counts one change, rather than two text lines. Author, status and the distant second hunk remain unselected.',
      ],
      count(1),
      { prepare: pair },
    ),
    s(
      'deselect-first',
      ['Wähle das Paar wieder ab', 'Deselect the pair'],
      [
        'Klicke dasselbe Zeilen-Plus noch einmal. Die Markierung soll verschwinden und die Auswahl wieder null Änderungen enthalten. Die Datei und der Index bleiben dabei unverändert.',
        'Click the same line button again. Highlighting should disappear and the selection return to zero changes. Neither the file nor the index changes.',
      ],
      unit(),
      { prepare: pair, completion: element(count(0)) },
    ),
    s(
      'select-again',
      ['Markiere die Begrüßung erneut', 'Select the greeting again'],
      [
        'Wähle das Begrüßungspaar noch einmal. Anschließend leeren wir die Auswahl über die gemeinsame Schaltfläche.',
        'Select the greeting pair once more. Next we will clear it using the shared button.',
      ],
      unit(),
      { completion: element(selected()) },
    ),
    s(
      'clear',
      ['Hebe die Auswahl über die Leiste auf', 'Clear the selection from the bar'],
      [
        'Klicke Auswahl aufheben. Diese Schaltfläche entfernt die Markierung sämtlicher ausgewählter Paare und verwirft keine Dateiänderungen.',
        'Click Clear selection. This removes all selected pairs without discarding any file edits.',
      ],
      c('clear-line-selection'),
      { prepare: pair, completion: element(count(0)) },
    ),
    s(
      'range-start',
      ['Setze den Anfang einer Bereichsauswahl', 'Set the start of a range'],
      [
        'Klicke zunächst das Plus an der Begrüßungsänderung. Dieser zuletzt angeklickte Eintrag wird zum Ausgangspunkt für den nächsten Umschalt-Klick.',
        'First click the greeting change’s plus. The most recently clicked entry becomes the anchor for the next Shift-click.',
      ],
      unit(),
      { completion: element(selected()) },
    ),
    s(
      'range-select',
      ['Erweitere mit Umschalt bis zum Autor', 'Extend to the author with Shift'],
      [
        'Halte Umschalt gedrückt und klicke das Plus am Paar Author: Team / Author: Learning team. Die Begrüßung und der Autor sollen ausgewählt sein; Status und der zweite Hunk bleiben unmarkiert.',
        'Hold Shift and click the plus on Author: Team / Author: Learning team. Greeting and author should be selected, while status and the second hunk remain unselected.',
      ],
      unit(1),
      { prepare: pair, completion: element(two) },
    ),
    s(
      'range-result',
      ['Die Leiste zählt jetzt zwei Änderungspaare', 'The bar now counts two change pairs'],
      [
        'Eine Bereichsauswahl umfasst die Änderungspaare zwischen dem Anker und dem angeklickten Paar. Sie wählt nicht pauschal den ganzen Hunk. Ein bereits ausgewählter Zieleintrag kann einen Bereich auch abwählen.',
        'A range includes the change pairs between the anchor and the clicked pair. It does not automatically select the entire hunk. Clicking an already selected destination can also deselect a range.',
      ],
      count(2),
      { prepare: range },
    ),
    s(
      'clear-range',
      ['Leere die Bereichsauswahl', 'Clear the range'],
      [
        'Klicke Auswahl aufheben, damit wir anschließend nur ein einzelnes Paar in den Index übernehmen.',
        'Click Clear selection so that we can stage just one pair next.',
      ],
      c('clear-line-selection'),
      { prepare: range, completion: element(count(0)) },
    ),
    s(
      'select-one',
      ['Wähle für den Commit nur die Begrüßung', 'Select only the greeting for the commit'],
      [
        'Markiere wieder nur das Begrüßungspaar. Die anderen Ersetzungen sollen noch nicht Teil des nächsten Commits werden.',
        'Select only the greeting pair again. The other replacements should not yet become part of the next commit.',
      ],
      unit(),
      { completion: element(selected()) },
    ),
    s(
      'apply-selection',
      ['Stage die ausgewählte Änderung', 'Stage the selected change'],
      [
        'Klicke Auswahl stagen. Nur Greeting: Welcome! soll in den Index gelangen. Autor, Status und Next steps bleiben ausschließlich Arbeitsänderungen.',
        'Click Stage selection. Only Greeting: Welcome! should enter the index. Author, status and Next steps remain worktree changes only.',
      ],
      c('apply-line-selection'),
      { prepare: pair, completion: diffState('greeting') },
    ),
    s(
      'remaining',
      ['Die Auswahl ist leer, die übrigen Änderungen bleiben', 'The selection is empty and the other edits remain'],
      [
        'Nach dem Anwenden wird die Auswahl geleert und der Diff neu gelesen. Die Begrüßung ist nicht mehr als Arbeitsänderung sichtbar; die anderen drei Änderungspaare sind noch vorhanden.',
        'After applying, the selection is cleared and the diff reloads. Greeting no longer appears as a worktree change; the other three change pairs remain.',
      ],
      count(0),
      { prepare: seed('greeting') },
    ),
    s(
      'close-working',
      ['Kehre zur Dateiauswahl zurück', 'Return to the file list'],
      [
        'Schließe den Viewer. README.md steht jetzt sowohl unter Vorgemerkt als auch unter Änderungen.',
        'Close the viewer. README.md now appears under both Staged and Changes.',
      ],
      c('close-file'),
      { prepare: seed('greeting'), completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'open-index',
      ['Untersuche die kleine Vormerkung', 'Inspect the small staged change'],
      [
        'Öffne README.md unter Vorgemerkt. Hier darf nur das ausgewählte Begrüßungspaar erscheinen.',
        'Open README.md under Staged. Only the selected greeting pair should appear here.',
      ],
      row('staged'),
      { openView: undefined, prepare: seed('greeting'), completion: element(`${viewer}[data-source="staged"] ${unit()}`) },
    ),
    s(
      'index-pair',
      ['Indexansicht und Arbeitsansicht haben verschiedene Inhalte', 'Index and worktree views contain different changes'],
      [
        'Der Index-Diff vergleicht mit dem letzten Commit und zeigt nur die Begrüßung. Die Minus-Schaltflächen wählen hier Änderungen zum Unstagen aus. Sie löschen keine Zeilen aus der Arbeitsdatei.',
        'The index diff compares against the last commit and shows only greeting. Its minus buttons select changes for unstaging. They do not delete lines from the working file.',
      ],
      block(),
      { prepare: seed('greeting', 'staged') },
    ),
    s(
      'select-index',
      ['Wähle das vorgemerkte Paar aus', 'Select the staged pair'],
      [
        'Klicke das Minus an der Begrüßung. Die Auswahl zählt eine Änderung und bietet Auswahl unstagen an.',
        'Click the minus beside greeting. The selection counts one change and offers Unstage selection.',
      ],
      unit(),
      { prepare: seed('greeting', 'staged'), completion: element(selected()) },
    ),
    s(
      'unstage-selection',
      ['Nimm nur dieses Paar aus dem Index', 'Unstage only this pair'],
      [
        'Klicke Auswahl unstagen. Der Index soll wieder dem letzten Commit entsprechen. Sämtliche vier Änderungspaare bleiben in der Arbeitsdatei erhalten.',
        'Click Unstage selection. The index should match the last commit again. All four change pairs remain in the working file.',
      ],
      c('apply-line-selection'),
      { prepare: seed('greeting', 'staged', { click: [unit()] }), completion: diffState('head') },
    ),
    s(
      'index-empty',
      ['Die Arbeitsdatei wurde nicht zurückgesetzt', 'The working file was not restored'],
      [
        'Die Indexansicht enthält keine Unterschiede mehr. Die vier Arbeitsänderungen sind weiterhin vorhanden. Wenn sich ein Diff vor dem Anwenden ändert, verlangt die App eine neue Auswahl statt veraltete Zeilen blind zu übernehmen.',
        'The index view has no differences now. All four worktree changes remain. If a diff changes before applying, the app asks for a new selection rather than blindly applying stale lines.',
      ],
      '.diff-empty-state',
      { prepare: emptyIndex },
    ),
    s(
      'close-index',
      ['Schließe den leeren Index-Diff', 'Close the empty index diff'],
      ['Schließe den Viewer. Die README steht wieder ausschließlich unter Änderungen.', 'Close the viewer. README appears only under Changes again.'],
      c('close-file'),
      { prepare: emptyIndex, completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'finish',
      ['Du kannst Inhalte präzise für einen Commit auswählen', 'You can select precise contents for a commit'],
      [
        'Du hast Paare gewählt, abgewählt, die Auswahl geleert, einen Umschalt-Bereich gebildet und eine einzelne Änderung gestagt und unstaged. Für Binärdateien, Konflikte und nicht sicher teilbare Diffs bleiben die passenden Dateiaktionen beziehungsweise die Konfliktauflösung zuständig.',
        'You selected and deselected pairs, cleared the selection, made a Shift range, and staged and unstaged one change. Binary files, conflicts and diffs that cannot safely be split use their corresponding file actions or conflict resolution.',
      ],
      c('staging'),
      { openView: undefined },
    ),
  ],
};
