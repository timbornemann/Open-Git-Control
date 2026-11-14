import type { TutorialChapter } from './types';
import { withTextViewSteps } from './fileTextViewSteps';
import {
  searchStep as s,
  searchRecipe as seed,
  searchSeed as p,
  searchState as state,
  searchResults as results,
  searchResult as result,
  searchValue as value,
  searchAll as all,
  searchViewer as viewer,
  c,
  editor,
  element,
} from './searchLessonHelpers';
const query = c('file-search-query');
export const TUTORIAL_SEARCH_NAMES: TutorialChapter = {
  id: 'search-names',
  section: 'repo',
  title: ['Dateien nach Namen und Pfad finden', 'Find files by name and path'],
  description: [
    'Dateisuche öffnen, nach Namen und Ordnerpfad suchen, Groß-/Kleinschreibung und leere Ergebnisse prüfen.',
    'Open file search, search by filename and folder path, and explore case sensitivity and empty results.',
  ],
  question: ['Wie finde ich eine Datei im Projektbaum?', 'How do I find a file in the project tree?'],
  keywords: 'dateisuche filename file names dateiname pfad path suche suchen match case groß klein',
  steps: [
    s(
      'overview',
      ['Die Suche kann den Projektbaum ersetzen', 'Search can replace the project tree'],
      [
        'Das frische Beispiel enthält guides/Planet.md, notes/planet.txt und src/planet.ts. Wir finden die Dateien über Namen und Pfad. Dabei ändern wir keine Datei und keinen Git-Stand.',
        'The fresh sample contains guides/Planet.md, notes/planet.txt and src/planet.ts. We will find them by name and path without changing files or Git versions.',
      ],
      c('file-search-toggle'),
      { continue: false },
    ),
    s(
      'open',
      ['Öffne die Dateisuche', 'Open file search'],
      [
        'Klicke die Lupe neben dem Projektnamen in Working Directory. Die Suchansicht nimmt den Platz des Projektbaums ein.',
        'Click the magnifying glass beside the project name in Working Directory. Search replaces the project tree.',
      ],
      c('file-search-toggle'),
      { completion: element('.working-search') },
    ),
    s(
      'mode',
      ['File names sucht nach Namen und Pfaden', 'File names searches names and paths'],
      [
        'File names ist anfangs ausgewählt. Dieser Modus sucht Dateinamen und relative Pfade, keine Textstellen im Dateiinhalt. File contents bekommt eine eigene Lektion.',
        'File names is initially selected. This mode searches filenames and relative paths rather than text inside files. File contents has a separate lesson.',
      ],
      c('file-search-names'),
      { prepare: seed('base', { mode: 'filename', query: '' }) },
    ),
    s(
      'query',
      ['Suche nach planet', 'Search for planet'],
      [
        'Trage planet in das Suchfeld ein. Warte kurz auf die Antwort: Es sollen drei Dateien erscheinen. Ein Treffer muss nicht exakt den ganzen Namen abdecken.',
        'Enter planet in the search field. Wait briefly for the response: three files should appear. A match does not need to cover the entire name.',
      ],
      query,
      { prepare: seed('base', { mode: 'filename', query: '' }), completion: value(query, 'planet', 3) },
    ),
    s(
      'results',
      ['Drei Pfade enthalten denselben Suchtext', 'Three paths contain the same search text'],
      [
        'Die Ergebnisse zeigen Planet.md, planet.txt und planet.ts samt Ordnerpfaden. Unterschiedliche Dateiendungen sind eigene Dateien. Die Suche blendet die übrigen Projektdateien nur aus.',
        'The results show Planet.md, planet.txt and planet.ts with their folder paths. Different extensions identify different files. Search only hides the other project files.',
      ],
      '.working-search__results',
      { prepare: seed('base', { mode: 'filename' }) },
    ),
    s(
      'case-purpose',
      ['Aa steuert die Groß-/Kleinschreibung', 'Aa controls case sensitivity'],
      [
        'Ohne Aa findet planet auch Planet.md. Mit aktivem Aa muss die Schreibweise genau passen. Wir aktivieren Aa, während das kleine p im Suchfeld stehen bleibt.',
        'Without Aa, planet also finds Planet.md. With Aa enabled, case must match exactly. We will enable Aa while keeping the lowercase p in the field.',
      ],
      c('file-search-case'),
      { prepare: seed('base', { mode: 'filename' }) },
    ),
    s(
      'case',
      ['Aktiviere Aa', 'Enable Aa'],
      [
        'Klicke Aa. Nur notes/planet.txt und src/planet.ts sollen gefunden werden; guides/Planet.md hat ein großes P.',
        'Click Aa. Only notes/planet.txt and src/planet.ts should match; guides/Planet.md has an uppercase P.',
      ],
      c('file-search-case'),
      { prepare: seed('base', { mode: 'filename' }), completion: all(element(`${c('file-search-case')}[aria-pressed="true"]`), element(results(2)), state()) },
    ),
    s(
      'capital',
      ['Suche jetzt mit großem P', 'Search with uppercase P now'],
      [
        'Ersetze planet durch Planet. Bei aktivem Aa soll nur guides/Planet.md übrig bleiben.',
        'Replace planet with Planet. With Aa enabled, only guides/Planet.md should remain.',
      ],
      query,
      { prepare: seed('base', { mode: 'filename', matchCase: true, count: 2 }), completion: value(query, 'Planet', 1) },
    ),
    s(
      'open-file',
      ['Öffne den gefundenen Dateipfad', 'Open the matching file path'],
      [
        'Klicke Planet.md im Ergebnis. Der normale Datei-Viewer öffnet ihren gespeicherten Arbeitsinhalt.',
        'Click Planet.md in the result. The normal file viewer opens its saved worktree contents.',
      ],
      `button${result()}`,
      { prepare: seed('base', { mode: 'filename', query: 'Planet', matchCase: true, count: 1 }), completion: element(viewer) },
    ),
    s(
      'contents',
      ['Das Ergebnis öffnet eine normale Arbeitsdatei', 'The result opens a normal working file'],
      [
        'Der Viewer zeigt das Planet-Handbuch und die beiden planet-Zeilen. Die Namenssuche hat diesen Inhalt nicht verändert oder in den Index übernommen.',
        'The viewer shows the Planet guide and its two planet lines. Searching by name did not change the contents or add anything to the index.',
      ],
      editor,
      { prepare: seed('base', { mode: 'filename', query: 'Planet', matchCase: true, count: 1, file: true }) },
    ),
    s(
      'close-file',
      ['Schließe die Datei', 'Close the file'],
      ['Schließe den Viewer mit X. Die Dateisuche und ihre Eingaben bleiben geöffnet.', 'Close the viewer with X. File search and its inputs remain open.'],
      c('close-file'),
      { prepare: seed('base', { mode: 'filename', query: 'Planet', matchCase: true, count: 1, file: true }), completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'case-off',
      ['Schalte Aa wieder aus', 'Turn Aa off again'],
      [
        'Klicke Aa erneut. Planet soll jetzt unabhängig von der Groß-/Kleinschreibung alle drei Dateinamen finden.',
        'Click Aa again. Planet should now find all three filenames regardless of case.',
      ],
      c('file-search-case'),
      {
        prepare: seed('base', { mode: 'filename', query: 'Planet', matchCase: true, count: 1 }),
        completion: all(element(`${c('file-search-case')}[aria-pressed="false"]`), element(results(3))),
      },
    ),
    s(
      'path',
      ['Suche nach einem Ordnerpfad', 'Search for a folder path'],
      [
        'Ersetze den Suchtext durch guides/. Der Pfadanteil soll nur guides/Planet.md finden, obwohl guides nicht Teil ihres Dateinamens ist.',
        'Replace the query with guides/. The path component should find only guides/Planet.md, although guides is not part of its filename.',
      ],
      query,
      { prepare: seed('base', { mode: 'filename' }), completion: value(query, 'guides/', 1) },
    ),
    s(
      'no-results',
      ['Probiere einen nicht vorhandenen Namen', 'Try a missing name'],
      [
        'Trage missing-planet ein. Die Suche soll keine Treffer melden. Das ist ein Suchergebnis und kein gelöschtes Projekt.',
        'Enter missing-planet. Search should report no matches. This is a search result, not a deleted project.',
      ],
      query,
      { prepare: seed('base', { mode: 'filename', query: 'guides/', count: 1 }), completion: value(query, 'missing-planet', 0) },
    ),
    s(
      'clear',
      ['Leere das Suchfeld', 'Clear the search field'],
      [
        'Entferne den Suchtext vollständig. Ein leeres Feld wartet auf einen Namen; es listet nicht automatisch alle Dateien auf.',
        'Remove the query completely. An empty field waits for a name; it does not automatically list every file.',
      ],
      query,
      { prepare: seed('base', { mode: 'filename', query: 'missing-planet', count: 0 }), completion: value(query, '', 0) },
    ),
    s(
      'close-search',
      ['Kehre zum Projektbaum zurück', 'Return to the project tree'],
      [
        'Klicke das X der Dateisuche neben dem Projektnamen. Die Ordner guides, notes und src sollen wieder im Baum stehen.',
        'Click the search X beside the project name. guides, notes and src should reappear in the tree.',
      ],
      c('file-search-toggle'),
      {
        prepare: seed('base', { mode: 'filename', query: '' }),
        completion: all(element(`${c('file-search-toggle')}[aria-pressed="false"]`), element('[data-file-path="guides"]'), state()),
      },
    ),
    s(
      'finish',
      ['Die Suche verändert die Anzeige, nicht die Dateien', 'Searching changes the view, not the files'],
      [
        'Du hast nach Namen und Pfaden gesucht, die Schreibweise eingegrenzt, eine Datei geöffnet und den Suchmodus wieder geschlossen. Als Nächstes untersuchen wir Treffer innerhalb der Dateien.',
        'You searched names and paths, narrowed matches by case, opened a file and closed search. Next we examine matches inside files.',
      ],
      c('file-search-toggle'),
      { prepare: p() },
    ),
  ].flatMap(withTextViewSteps({ 'open-file': 'guides/Planet.md' })),
};
