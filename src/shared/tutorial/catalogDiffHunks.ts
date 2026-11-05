import type { TutorialChapter } from './types';
import { diffStep as s, diffControl as c, diffRow as row, block, blockControl as button, diffRecipe as seed, diffState, viewer } from './diffLessonHelpers';
import { element } from './stagingLessonHelpers';
const emptyIndex = seed('first', 'staged', { click: [button('unstage')], ready: '.diff-empty-state' });

export const TUTORIAL_DIFF_HUNKS: TutorialChapter = {
  id: 'diff-hunks',
  section: 'repo',
  title: ['Hunks einzeln vormerken und zurücknehmen', 'Stage and unstage individual hunks'],
  description: [
    'Zwei getrennte Änderungsblöcke lesen, zwischen ihnen navigieren und nur einen Block in den Index übernehmen.',
    'Read two separate change blocks, navigate between them and stage just one block.',
  ],
  question: ['Wie stage ich nur einen Teil einer Datei?', 'How do I stage only part of a file?'],
  keywords: 'hunk block teil datei partial stage unstage index diff @@ zeilennummer navigation',
  steps: [
    s(
      'overview',
      ['Eine Datei kann mehrere unabhängige Änderungen haben', 'One file can contain several independent changes'],
      [
        'Die frische README.md enthält zwei getrennte Änderungsblöcke. Oben wurden Begrüßung, Autor und Status geändert, weiter unten ein nächster Schritt. Mit Hunks kannst du zusammenhängende Änderungen getrennt für einen Commit auswählen.',
        'The fresh README.md has two separate change blocks. Greeting, author and status changed at the top; a next step changed farther down. Hunks let you select related changes independently for a commit.',
      ],
      row('unstaged'),
      { continue: false, openView: undefined },
    ),
    s(
      'open-diff',
      ['Öffne die geänderte README.md', 'Open modified README.md'],
      [
        'Klicke README.md unter Änderungen. Der Diff zeigt beide Blöcke; noch ist keiner vorgemerkt.',
        'Click README.md under Changes. The diff shows both blocks; neither is staged yet.',
      ],
      row('unstaged'),
      { openView: undefined, completion: element(`${viewer}[data-source="unstaged"] ${block(2)}`) },
    ),
    s(
      'header',
      ['Die Hunk-Kopfzeile beschreibt einen Ausschnitt', 'The hunk header describes a section'],
      [
        'Die Zeile mit @@ nennt Start und Länge des Ausschnitts im alten und neuen Stand. Ein Hunk enthält geänderte Zeilen und etwas unveränderten Kontext. Er ist nicht automatisch die ganze Datei.',
        'The @@ header gives the section’s start and length in the old and new versions. A hunk contains changed lines and some unchanged context. It is not automatically the entire file.',
      ],
      `${block()} .diff-hunk-header`,
    ),
    s(
      'first-block',
      ['Im ersten Block gehören drei Ersetzungen zusammen', 'The first block contains three replacements'],
      [
        'Rot zeigt Greeting: Hello!, Author: Team und Status: Draft. Grün zeigt ihre neuen Fassungen. Die Hunk-Aktion würde alle drei Ersetzungen gemeinsam übernehmen; einzelne Zeilenpaare üben wir in einer eigenen Lektion.',
        'Red shows Greeting: Hello!, Author: Team and Status: Draft. Green shows their replacements. The hunk action would take all three replacements together; individual pairs have their own lesson.',
      ],
      block(),
    ),
    s(
      'next-block',
      ['Springe zum zweiten Hunk', 'Jump to the second hunk'],
      [
        'Klicke den rechten kleinen Pfeil neben der Hunk-Anzeige. Er bewegt die Diffansicht zum nächsten Änderungsblock und verändert keine Datei.',
        'Click the small right arrow beside the hunk counter. It moves the diff view to the next change block without changing a file.',
      ],
      c('next-hunk'),
      { completion: element(`${block(2)}.active`) },
    ),
    s(
      'second-block',
      ['Der zweite Block ändert nur einen nächsten Schritt', 'The second block changes one next step'],
      [
        'Hier wird „Check files“ durch „Compare changes“ ersetzt. Die unveränderten Zeilen dazwischen gehören nicht als neue Änderungen in den Commit. Du kannst diesen Block unabhängig vom ersten behandeln.',
        'Here “Check files” becomes “Compare changes”. The unchanged lines between the blocks are not new changes for the commit. This block can be handled independently.',
      ],
      block(2),
      { prepare: seed('head', 'unstaged', { click: [c('next-hunk')] }) },
    ),
    s(
      'previous-block',
      ['Kehre zum ersten Hunk zurück', 'Return to the first hunk'],
      [
        'Klicke den linken Pfeil an der Hunk-Anzeige. Wir werden nur den oberen Block vormerken.',
        'Click the left arrow beside the hunk counter. We will stage only the upper block.',
      ],
      c('previous-hunk'),
      { prepare: seed('head', 'unstaged', { click: [c('next-hunk')] }), completion: element(`${block()}.active`) },
    ),
    s(
      'scope',
      ['Nutze die Aktion am Hunk', 'Use the action on the hunk'],
      [
        'Der hervorgehobene Stage-Button gehört zum ersten Änderungsblock. Das Plus an der Datei würde dagegen den aktuellen Inhalt der gesamten Datei übernehmen. Achte vor dem Klick darauf, auf welcher Ebene die Aktion steht.',
        'The highlighted Stage button belongs to the first change block. The file’s plus button would stage the entire current file instead. Check the action’s scope before clicking.',
      ],
      button('stage'),
    ),
    s(
      'stage-first',
      ['Stage nur den ersten Hunk', 'Stage the first hunk only'],
      [
        'Klicke Stage im Kopf des ersten Hunks. Begrüßung, Autor und Status sollen in den Index gelangen. Die Änderung bei Next steps bleibt ausschließlich im Arbeitsordner.',
        'Click Stage in the first hunk’s header. Greeting, author and status should enter the index. The Next steps change stays only in the working directory.',
      ],
      button('stage'),
      { completion: diffState('first') },
    ),
    s(
      'close-working',
      ['Kehre zur Dateiauswahl zurück', 'Return to the file list'],
      [
        'Schließe den Datei-Viewer mit seinem X. Das Vormerken hat die Arbeitsdatei nicht verändert.',
        'Close the file viewer with its X. Staging did not change the working file.',
      ],
      c('close-file'),
      { prepare: seed('first'), completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'split-state',
      ['README.md steht jetzt in zwei Bereichen', 'README.md now appears in two sections'],
      [
        'Vorgemerkt enthält den oberen Block, Änderungen die verbleibende Änderung unten. Dieselbe Datei darf in beiden Bereichen stehen: Arbeitsordner, Index und letzter Commit besitzen unterschiedliche Inhalte.',
        'Staged contains the upper block; Changes contains the remaining edit below. The same file may appear in both sections because worktree, index and last commit contain different versions.',
      ],
      row('staged'),
      { openView: undefined, prepare: seed('first') },
    ),
    s(
      'open-index',
      ['Öffne die vorgemerkte Fassung', 'Open the staged version'],
      [
        'Klicke README.md im Bereich Vorgemerkt. Jetzt vergleichst du den Index mit dem letzten Commit.',
        'Click README.md in Staged. You are now comparing the index with the last commit.',
      ],
      row('staged'),
      { openView: undefined, prepare: seed('first'), completion: element(`${viewer}[data-source="staged"] ${block()}`) },
    ),
    s(
      'index-diff',
      ['Im Index-Diff ist nur der ausgewählte Block', 'The index diff contains only the selected block'],
      [
        'Hier erscheinen nur die drei oberen Ersetzungen. Die Änderung bei Next steps fehlt, weil sie noch nicht vorgemerkt ist. Unstage nimmt diesen Block aus dem Index zurück und erhält die Arbeitsdatei.',
        'Only the three upper replacements appear here. The Next steps change is absent because it is not staged. Unstage removes this block from the index while preserving the working file.',
      ],
      block(),
      { prepare: seed('first', 'staged') },
    ),
    s(
      'unstage-first',
      ['Nimm den Hunk wieder aus dem Index', 'Remove the hunk from the index'],
      [
        'Klicke Unstage am Hunk. Danach soll der Index wieder dem letzten Commit entsprechen; beide Änderungen bleiben im Arbeitsordner erhalten.',
        'Click Unstage on the hunk. The index should match the last commit again; both changes must remain in the working directory.',
      ],
      button('unstage'),
      { prepare: seed('first', 'staged'), completion: diffState('head') },
    ),
    s(
      'empty-index',
      ['Kein Index-Diff heißt nicht keine Arbeitsänderung', 'An empty index diff does not mean a clean worktree'],
      [
        'Der geöffnete Index-Diff zeigt jetzt keine Unterschiede. Die Arbeitsdatei enthält weiterhin beide Änderungsblöcke. Unstage hat keine Bearbeitung verworfen.',
        'The open index diff now shows no differences. The working file still contains both change blocks. Unstage did not discard any edits.',
      ],
      '.diff-empty-state',
      { prepare: emptyIndex },
    ),
    s(
      'close-index',
      ['Schließe die Indexansicht', 'Close the index view'],
      [
        'Schließe den Datei-Viewer. README.md soll wieder nur unter Änderungen stehen.',
        'Close the file viewer. README.md should appear only under Changes again.',
      ],
      c('close-file'),
      { prepare: emptyIndex, completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'finish',
      ['Du kannst einen Commit aus passenden Blöcken zusammensetzen', 'You can build a commit from related blocks'],
      [
        'Du hast Hunks gelesen, zwischen ihnen navigiert und einen Block vorgemerkt und zurückgenommen. Beide Bearbeitungen sind noch vorhanden. Die nächsten Lektionen üben gezieltes Verwerfen und noch kleinere Zeilenauswahlen.',
        'You read hunks, navigated between them, staged one and unstaged it. Both edits remain intact. The next lessons practice targeted discard and smaller line selections.',
      ],
      c('staging'),
      { openView: undefined },
    ),
  ],
};
