import type { TutorialChapter } from './types';
import { withTextViewSteps } from './fileTextViewSteps';
import {
  searchStep as s,
  searchRecipe as seed,
  searchSeed as p,
  searchState as state,
  searchResults as results,
  searchHit as hit,
  searchValue as value,
  searchAll as all,
  searchViewer as viewer,
  c,
  element,
} from './searchLessonHelpers';
const query = c('file-search-query');
export const TUTORIAL_SEARCH_CONTENT: TutorialChapter = {
  id: 'search-content',
  section: 'repo',
  title: ['Textstellen in Projektdateien finden', 'Find text inside project files'],
  description: [
    'Inhaltssuche, Treffergruppen, Vorschau, Zeile/Spalte, Groß-/Kleinschreibung und wörtliche Suchzeichen praktisch untersuchen.',
    'Explore content search, file groups, previews, line/column, case sensitivity and literal search characters.',
  ],
  question: ['Wie suche ich Text in mehreren Dateien?', 'How do I search for text across files?'],
  keywords: 'inhaltssuche content text finden treffer match line zeile column spalte case literal',
  steps: [
    s(
      'overview',
      ['Inhaltstreffer sind keine Dateinamentreffer', 'Content matches are different from filename matches'],
      [
        'Die Beispieldateien enthalten planet in verschiedenen Schreibweisen. Wir suchen nach gespeichertem Dateiinhalt und lesen die Fundstellen. Ungespeicherte Editorentwürfe gehören nicht zum Suchbestand.',
        'The sample files contain planet in several cases. We will search saved file contents and read their matches. Unsaved editor drafts are not part of the searched contents.',
      ],
      c('file-search-toggle'),
      { continue: false },
    ),
    s(
      'open',
      ['Öffne die Dateisuche', 'Open file search'],
      ['Klicke die Lupe in Working Directory.', 'Click the magnifying glass in Working Directory.'],
      c('file-search-toggle'),
      { completion: element('.working-search') },
    ),
    s(
      'content-mode',
      ['Wechsle zu File contents', 'Switch to File contents'],
      [
        'Klicke File contents. Unter dem Suchfeld erscheinen ein Ersetzungsfeld und die All-Schaltfläche. Zunächst verwenden wir nur die Suche.',
        'Click File contents. A replacement field and the All button appear below the query. For now we use search only.',
      ],
      c('file-search-contents'),
      {
        prepare: seed('base', { mode: 'filename', query: '' }),
        completion: all(element(`${c('file-search-contents')}[aria-selected="true"]`), element(c('file-search-replacement'))),
      },
    ),
    s(
      'query',
      ['Suche planet im Inhalt', 'Search for planet in contents'],
      [
        'Trage planet ein und warte auf die Antwort. Die Suche soll fünf Textstellen in drei Dateien finden. Ein einzelner Dateiname kann mehrere Inhaltstreffer liefern.',
        'Enter planet and wait for the response. Search should find five occurrences in three files. A single filename can have multiple content matches.',
      ],
      query,
      { prepare: seed('base', { query: '' }), completion: all(value(query, 'planet', 5), element(results(5, 3))) },
    ),
    s(
      'summary',
      ['Trefferzahl und Dateizahl beantworten verschiedene Fragen', 'Match count and file count answer different questions'],
      [
        'Die Zusammenfassung nennt fünf Treffer in drei Dateien. guides/Planet.md enthält drei davon; die Notiz und der Quelltext enthalten jeweils einen. Der Dateiname zählt hier nicht als Inhaltstreffer.',
        'The summary says five matches in three files. guides/Planet.md contains three; the note and source contain one each. The filename does not count as a content match here.',
      ],
      c('file-search-summary'),
      { prepare: seed() },
    ),
    s(
      'groups',
      ['Jede Gruppe gehört zu einem Dateipfad', 'Each group belongs to a file path'],
      [
        'Die Gruppenüberschrift zeigt den relativen Dateipfad und ihre Trefferzahl. Darunter stehen die einzelnen Fundstellen dieser Datei.',
        'A group header shows its relative file path and match count. Its individual occurrences appear underneath.',
      ],
      '[data-search-path="guides/Planet.md"] .working-search-result-group__file',
      { prepare: seed() },
    ),
    s(
      'location',
      ['3:1 bedeutet dritte Zeile, erste Spalte', '3:1 means third line, first column'],
      [
        'Diese Fundstelle beginnt mit planet in Zeile 3. Zeile und Spalte werden ab eins gezählt. Die Vorschau markiert den gefundenen Text und zeigt etwas Kontext.',
        'This occurrence starts with planet on line 3. Lines and columns are counted from one. The preview highlights the matched text and shows some context.',
      ],
      `${hit()} .working-search-match__location`,
      { prepare: seed() },
    ),
    s(
      'preview',
      ['Die Markierung zeigt den tatsächlichen Suchtext', 'The highlight shows the actual matched text'],
      [
        'In der Vorschau ist planet markiert; blau ist Kontext. Eine Vorschau ist nur ein Ausschnitt. Für den vollständigen Inhalt öffnest du die Datei.',
        'The preview highlights planet; blue is context. A preview is only an excerpt. Open the file to read its full contents.',
      ],
      `${hit()} .working-search-match__preview`,
      { prepare: seed() },
    ),
    s(
      'open-match',
      ['Öffne die Datei über ihre Fundstelle', 'Open the file through its match'],
      [
        'Klicke die Vorschau bei 3:1. Der Datei-Viewer öffnet guides/Planet.md. Die Trefferposition hilft beim Einordnen; der Viewer zeigt die ganze Datei.',
        'Click the preview at 3:1. The file viewer opens guides/Planet.md. The match position helps you locate the text; the viewer shows the whole file.',
      ],
      `${hit()} .working-search-match__open`,
      { prepare: seed(), completion: element(viewer) },
    ),
    s(
      'saved-source',
      ['Die Suche liest die gespeicherte Arbeitsdatei', 'Search reads the saved working file'],
      [
        'Die Quellenangabe lautet Arbeitsdatei. Ein Editorentwurf müsste erst gespeichert werden, bevor sein Text bei einer neuen Inhaltssuche berücksichtigt wird. Die Suche liest keinen beliebigen Commit.',
        'The source label says Working file. An editor draft must be saved before its text is included in a new content search. Search does not read an arbitrary commit.',
      ],
      c('file-source'),
      { prepare: seed('base', { file: true }) },
    ),
    s(
      'close-file',
      ['Schließe die Datei', 'Close the file'],
      ['Schließe den Viewer mit X. Die Suchtreffer bleiben rechts verfügbar.', 'Close the viewer with X. The search results remain available on the right.'],
      c('close-file'),
      { prepare: seed('base', { file: true }), completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'case',
      ['Begrenze die Suche auf kleines planet', 'Limit search to lowercase planet'],
      [
        'Aktiviere Aa. Bei unverändertem planet sollen nur die zwei kleinen planet-Zeilen im Handbuch und der eine Quelltexttreffer übrig bleiben: drei Treffer.',
        'Enable Aa. With planet unchanged, only the two lowercase guide lines and one source occurrence should remain: three matches.',
      ],
      c('file-search-case'),
      { prepare: seed(), completion: all(element(`${c('file-search-case')}[aria-pressed="true"]`), element(results(3)), state()) },
    ),
    s(
      'uppercase',
      ['Suche mit aktivem Aa nach PLANET', 'Search for PLANET with Aa enabled'],
      [
        'Ersetze planet durch PLANET. Jetzt soll nur die Notiz notes/planet.txt gefunden werden. Die Schreibweise des Dateinamens ist im Inhaltsmodus nicht entscheidend.',
        'Replace planet with PLANET. Now only notes/planet.txt should match. Filename case is not what matters in content mode.',
      ],
      query,
      { prepare: seed('base', { matchCase: true, count: 3 }), completion: value(query, 'PLANET', 1) },
    ),
    s(
      'literal',
      ['Suche die eckigen Klammern wörtlich', 'Search for square brackets literally'],
      [
        'Trage ["planet"] ein, einschließlich Klammern und Anführungszeichen. Die Suche behandelt diese Zeichen als Text. Sie sollen genau einen Treffer im Quelltext liefern.',
        'Enter ["planet"], including brackets and quotation marks. Search treats these characters as text. They should produce exactly one source-code match.',
      ],
      query,
      { prepare: seed('base', { query: 'PLANET', matchCase: true, count: 1 }), completion: value(query, '["planet"]', 1) },
    ),
    s(
      'literal-result',
      ['Suchzeichen sind hier kein regulärer Ausdruck', 'Search characters are not a regular expression here'],
      [
        'Die Vorschau markiert das vollständige ["planet"]. Klammern und andere Sonderzeichen werden wörtlich gesucht. Die Suche verändert dabei keine Datei.',
        'The preview highlights the complete ["planet"]. Brackets and other special characters are searched literally. Searching does not change any file.',
      ],
      '[data-search-path="src/planet.ts"] .working-search-match__preview',
      { prepare: seed('base', { query: '["planet"]', matchCase: true, count: 1 }) },
    ),
    s(
      'clear',
      ['Leere die Inhaltssuche', 'Clear content search'],
      [
        'Entferne den Suchtext vollständig. Die Trefferliste soll leer werden; das Ersetzungsfeld gehört weiterhin zum Inhaltsmodus.',
        'Remove the query completely. The result list should become empty; the replacement field still belongs to content mode.',
      ],
      query,
      { prepare: seed('base', { query: '["planet"]', matchCase: true, count: 1 }), completion: value(query, '', 0) },
    ),
    s(
      'close-search',
      ['Kehre zum Baum zurück', 'Return to the tree'],
      ['Schließe die Suche mit dem X neben dem Projektnamen.', 'Close search with the X beside the project name.'],
      c('file-search-toggle'),
      { prepare: seed('base', { query: '', matchCase: true }), completion: all(element(`${c('file-search-toggle')}[aria-pressed="false"]`), state()) },
    ),
    s(
      'finish',
      ['Ein Treffer ist eine Textstelle in einer gespeicherten Datei', 'A match is an occurrence in a saved file'],
      [
        'Du hast Trefferzahlen, Dateigruppen, Zeile/Spalte, Kontext und wörtliche Suchzeichen geprüft. Die nächsten Lektionen ersetzen gezielt eine Fundstelle und danach alle passenden Vorkommen.',
        'You explored match counts, file groups, line/column, context and literal search characters. The next lessons replace a specific occurrence and then every matching occurrence.',
      ],
      c('file-search-toggle'),
      { prepare: p() },
    ),
  ].flatMap(withTextViewSteps({ 'open-match': 'guides/Planet.md' })),
};
