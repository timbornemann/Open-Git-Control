import type { TutorialChapter } from './types';
import { tagStep as s, tagRecipe as seed, tagPanel as panel, tagToggle as toggle, tagControl as c, tagRow as row, element, value } from './tagLessonHelpers';
import { branchControl } from './branchLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileControl, fileTab } from './fileLessonHelpers';
export const TUTORIAL_TAGS_NAVIGATION: TutorialChapter = {
  id: 'tags-navigation',
  section: 'repo',
  title: ['Tags finden und ihren gespeicherten Stand untersuchen', 'Find tags and inspect their saved revision'],
  description: [
    'Öffne die Tag-Karte, filtere die Namen und untersuche den markierten Commit, ohne den aktiven Branch zu wechseln.',
    'Open the tag card, filter its names and inspect the marked commit without changing the active branch.',
  ],
  question: ['Wie finde ich den Commit und Dateiinhalt eines Tags?', 'How do I find a tag’s commit and file contents?'],
  keywords: 'tag tags version markierung referenz release finden suchen filter graph commit inhalt kein checkout',
  steps: [
    s(
      'overview',
      ['Ein Tag benennt einen festen gespeicherten Stand', 'A tag names a fixed saved revision'],
      [
        'Das Beispiel enthält v1.0.0 am zweiten Commit. main steht inzwischen am vierten. Wir lesen den älteren Tag, ohne main zurückzusetzen oder die Arbeitsdateien zu wechseln.',
        'The example has v1.0.0 at the second commit. main has since reached the fourth. We will read the older tag without resetting main or switching working files.',
      ],
      branchControl('sidebar-toggle'),
      { continue: false, prepare: seed({ sidebarCollapsed: true, collapsed: true }) },
    ),
    s(
      'sidebar',
      ['Öffne die Git-Seitenleiste', 'Open the Git sidebar'],
      ['Öffne oben links die Seitenleiste mit den Git-Karten.', 'Open the sidebar with the Git cards at the upper left.'],
      branchControl('sidebar-toggle'),
      { prepare: seed({ sidebarCollapsed: true, collapsed: true }), completion: element(panel) },
    ),
    s('expand', ['Klappe die Tag-Karte auf', 'Expand the tag card'], ['Öffne Tags über die Kartenüberschrift.', 'Open Tags using its card heading.'], toggle, {
      prepare: seed({ collapsed: true }),
      completion: element(toggle + '[aria-expanded="true"]'),
    }),
    s(
      'card',
      ['Die Namen gehören zum ausgewählten Repository', 'The names belong to the selected repository'],
      [
        'Hier stehen die lokal bekannten Tags. Ein Tag-Name bewegt sich bei späteren Commits nicht automatisch mit dem aktiven Branch.',
        'These are the locally known tags. A tag name does not automatically move with the active branch when later commits are made.',
      ],
      panel,
      { prepare: seed() },
    ),
    s(
      'filter',
      ['Suche ohne Beachtung der Großschreibung', 'Search without case sensitivity'],
      ['Schreibe V1.0 in die Suche. Der vorhandene Name v1.0.0 bleibt sichtbar.', 'Enter V1.0 in Search. The existing v1.0.0 name remains visible.'],
      c('filter'),
      { prepare: seed(), completion: value(c('filter'), 'V1.0') },
    ),
    s(
      'match',
      ['Der Filter blendet nur Einträge aus', 'The filter only hides entries'],
      [
        'Suchen benennt nichts um und verändert keine Referenz. v1.0.0 ist weiterhin derselbe lokale Tag.',
        'Searching neither renames anything nor changes a reference. v1.0.0 is still the same local tag.',
      ],
      row('v1.0.0'),
      { prepare: seed({ query: 'V1.0' }) },
    ),
    s(
      'missing',
      ['Probiere einen Namen ohne Treffer', 'Try a name without a match'],
      ['Schreibe keine-version. Die Karte soll keinen passenden Tag mehr anzeigen.', 'Enter keine-version. The card should show no matching tag.'],
      c('filter'),
      {
        prepare: seed({ query: 'V1.0' }),
        completion: { kind: 'all', conditions: [value(c('filter'), 'keine-version'), { kind: 'absent', selector: row('v1.0.0') }] },
      },
    ),
    s(
      'empty',
      ['Kein Treffer bedeutet keine Löschung', 'No match does not mean deletion'],
      [
        'Der Hinweis betrifft den Suchfilter. Der Tag ist weiterhin im Repository vorhanden.',
        'The message concerns the search filter. The tag still exists in the repository.',
      ],
      panel + ' .repo-state-text',
      { prepare: seed({ query: 'keine-version' }) },
    ),
    s(
      'clear',
      ['Leere die Suche wieder', 'Clear the search again'],
      ['Entferne den Suchtext, damit v1.0.0 zurückkehrt.', 'Remove the search text to show v1.0.0 again.'],
      c('filter'),
      { prepare: seed({ query: 'keine-version' }), completion: { kind: 'all', conditions: [value(c('filter'), ''), element(row('v1.0.0'))] } },
    ),
    s(
      'select',
      ['Öffne den Tag mit Enter', 'Open the tag with Enter'],
      [
        'Fokussiere v1.0.0 und drücke Enter. Ein Klick öffnet denselben gespeicherten Commit.',
        'Focus v1.0.0 and press Enter. Clicking opens the same saved commit.',
      ],
      row('v1.0.0'),
      { prepare: seed(), gesture: 'enter', completion: element(commitPanel(2)) },
    ),
    s(
      'reference',
      ['v1.0.0 zeigt auf den zweiten Commit', 'v1.0.0 points to the second commit'],
      ['Der Graph zeigt die Tag-Referenz am markierten älteren Stand.', 'The graph shows the tag reference at the marked older revision.'],
      graphRow(2) + ' .commit-refs',
      { prepare: seed({ selected: 'old' }) },
    ),
    s(
      'head',
      ['main und HEAD bleiben am vierten Commit', 'main and HEAD remain at the fourth commit'],
      [
        'Die Auswahl dient der Untersuchung. Sie checkt den Tag nicht aus und verschiebt den aktiven Branch nicht.',
        'Selection is for inspection. It neither checks out the tag nor moves the active branch.',
      ],
      graphRow(4),
      { prepare: seed({ selected: 'old' }) },
    ),
    s(
      'open-file',
      ['Öffne die README des markierten Commits', 'Open the marked commit’s README'],
      ['Öffne README.md in der Commit-Dateiliste.', 'Open README.md in the commit file list.'],
      commitPanel(2) + ' ' + commitFile(),
      { prepare: seed({ selected: 'old' }), completion: element(historyViewer(2)) },
    ),
    s(
      'diff',
      ['Der Diff gehört zum älteren Tag-Commit', 'The diff belongs to the older tagged commit'],
      [
        'Der Vergleich zeigt dessen Änderung gegenüber seinem Vorgänger. Er zeigt keine ungespeicherte Arbeitsdatei und setzt main nicht zurück.',
        'The comparison shows its change from its parent. It is not an unsaved working file and does not reset main.',
      ],
      historyViewer(2),
      { prepare: seed({ selected: 'old', file: 'diff' }) },
    ),
    s(
      'text',
      ['Lies den vollständigen gespeicherten Text', 'Read the complete saved text'],
      ['Öffne Text für den Inhalt, auf den v1.0.0 verweist.', 'Open Text for the contents referenced by v1.0.0.'],
      fileTab('text'),
      { prepare: seed({ selected: 'old', file: 'diff' }), completion: element(historyViewer(2) + '[data-tab="text"]') },
    ),
    s(
      'contents',
      ['Der Tag bewahrt die frühere Begrüßung', 'The tag preserves the earlier greeting'],
      [
        'Der zweite Commit enthält Hallo statt der späteren Welt-Begrüßung. Diese gespeicherte Fassung bleibt über den Tag auffindbar.',
        'The second commit contains Hello rather than the later world greeting. This saved version remains discoverable through the tag.',
      ],
      historyViewer(2),
      { prepare: seed({ selected: 'old', file: 'text' }) },
    ),
    s(
      'close-file',
      ['Schließe die alte Dateiansicht', 'Close the old file viewer'],
      ['Kehre zum aktuellen Arbeitsbereich zurück.', 'Return to the current workspace.'],
      fileControl('close-file'),
      { prepare: seed({ selected: 'old', file: 'text' }), completion: { kind: 'absent', selector: historyViewer(2) } },
    ),
    s(
      'current',
      ['Wähle den aktuellen Commit wieder aus', 'Select the current commit again'],
      [
        'Öffne den vierten Commit im Graphen, um den neuesten gespeicherten main zu untersuchen.',
        'Open the fourth commit in the graph to inspect the latest saved main.',
      ],
      graphRow(4),
      { prepare: seed(), completion: element(commitPanel(4)) },
    ),
    s(
      'publishing',
      ['Lokal markieren und veröffentlichen sind getrennte Aktionen', 'Marking locally and publishing are separate actions'],
      [
        'Der Pfeil in der Tag-Karte öffnet die Tag-Veröffentlichung. Das bloße Lesen eines Tags überträgt nichts. Übertragungen behandeln die Synchronisierungslektionen.',
        'The arrow in the tag card opens tag publishing. Reading a tag alone transfers nothing. The synchronization lessons cover transfers.',
      ],
      c('push'),
      { prepare: seed() },
    ),
    s(
      'finish',
      ['Ein alter Tag lässt sich untersuchen, ohne den Arbeitsstand zu wechseln', 'An old tag can be inspected without switching the working revision'],
      [
        'Du hast die Karte geöffnet, gefiltert und den zugehörigen Commit samt Datei geprüft. main, Index und Arbeitsdateien sind erhalten. Weiter beendet die Lektion.',
        'You opened the card, filtered it and inspected its commit and file. main, the index and working files are preserved. Next finishes the lesson.',
      ],
      panel,
      { prepare: seed() },
    ),
  ],
};
