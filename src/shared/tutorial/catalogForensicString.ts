import type { TutorialChapter } from './types';
import {
  forensicStep as s,
  forensicRecipe as seed,
  forensicState as state,
  forensicValue as value,
  forensicResult as result,
  overviewTerm,
  c,
  element,
  commitPanel as panel,
  commitFile as file,
  historyViewer as viewer,
  graphRow as row,
} from './forensicLessonHelpers';
import { commitSearchRecipe } from './commitSearchLessonHelpers';
const path = c('forensic-path'),
  query = c('forensic-query'),
  run = c('forensic-run');
const lowercase = ['projektübersicht', 'project overview'] as const;
const heading = ['# OGC-Lernprojekt', '# OGC-Lernprojekt'] as const;
const source = { path: 'src/app.ts', term: ['Hallo', 'Hallo'] as const };
export const TUTORIAL_FORENSIC_STRING: TutorialChapter = {
  id: 'history-forensic-string',
  section: 'repo',
  title: ['Frühere Textänderungen einer Datei finden', 'Find earlier text changes in a file'],
  description: [
    'Forensische Historie öffnen, Pfad und wörtlichen Suchtext setzen, Hinzufügen/Entfernen vergleichen und die Anzahlregel von Git -S ausprobieren.',
    'Open forensic history, set a path and literal text, compare addition/removal and try Git -S occurrence-count semantics.',
  ],
  question: ['Wann wurde ein bestimmter Text hinzugefügt oder entfernt?', 'When was a particular text added or removed?'],
  keywords: 'forensic forensisch history historie text string literal wörtlich pickaxe git -S hinzufügen entfernen occurrence anzahl',
  steps: [
    s(
      'overview',
      ['Früherer Dateiinhalt ist kein Commit-Betreff', 'Earlier file contents are different from commit subjects'],
      [
        'Die forensische Suche untersucht gespeicherte Dateiänderungen. Im Modus Suchtext findet sie Commits, bei denen sich die Anzahl eines wörtlichen Textes ändert. Wir suchen eine Projektbeschreibung, die heute schon wieder entfernt ist.',
        'Forensic search inspects saved file changes. In String mode it finds commits where a literal text’s occurrence count changes. We will find a project description that has already been removed.',
      ],
      c('commit-search-mode'),
      { continue: false, prepare: commitSearchRecipe() },
    ),
    s(
      'open',
      ['Wechsle zu Forensische Historie', 'Switch to Forensic history'],
      ['Wähle Forensische Historie im Modusfeld der Suchleiste.', 'Choose Forensic history in the toolbar’s mode field.'],
      c('commit-search-mode'),
      {
        prepare: commitSearchRecipe(),
        completion: {
          kind: 'all',
          conditions: [
            element(`${c('forensic-search')}[data-active="true"]`),
            { kind: 'value', selector: c('forensic-view'), value: ['forensic', 'forensic'] },
          ],
        },
      },
    ),
    s(
      'kind',
      ['Suchtext bedeutet wörtliche Anzahländerung', 'String means a change in literal occurrence count'],
      [
        'Der erste Suchtyp entspricht Git -S. Er betrachtet die Anzahl eines Textes vor und nach dem Commit. Reguläre Ausdrücke und Zeilenbereiche sind eigene Suchtypen und folgen später.',
        'The first search type corresponds to Git -S. It compares a text’s occurrence count before and after the commit. Regular expressions and line ranges are separate search types covered later.',
      ],
      c('forensic-kind'),
      { prepare: seed({ path: '', term: ['', ''] }) },
    ),
    s(
      'path',
      ['Gib den relativen README-Pfad an', 'Enter the relative README path'],
      [
        'Trage README.md ein. Der Pfad bezieht sich auf das Repository. Wir untersuchen gespeicherte Commits dieser Datei, keine ungespeicherten Editorentwürfe.',
        'Enter README.md. The path is relative to the repository. We will inspect this file’s saved commits, not unsaved editor drafts.',
      ],
      path,
      { prepare: seed({ path: '', term: ['', ''] }), completion: value(path, ['README.md', 'README.md']) },
    ),
    s(
      'query',
      ['Suche die frühere Projektbeschreibung', 'Search for the earlier project description'],
      [
        'Trage Projektübersicht ein. Achte auf die Schreibweise; diese Inhaltssuche berücksichtigt Groß- und Kleinschreibung.',
        'Enter Project overview. Keep the exact case; this content search is case-sensitive.',
      ],
      query,
      { prepare: seed({ term: ['', ''] }), completion: value(query, overviewTerm) },
    ),
    s(
      'run',
      ['Starte die Suche ausdrücklich', 'Run the search explicitly'],
      [
        'Klicke Forensische Suche starten. Es sollen zwei gespeicherte Änderungen gefunden werden.',
        'Click Run forensic search. It should find two saved changes.',
      ],
      run,
      { prepare: seed(), completion: element(state(2)) },
    ),
    s(
      'results',
      ['Hinzufügen und Entfernen sind beide relevant', 'Both addition and removal matter'],
      [
        'Die Liste enthält den Dokumentations-Commit und die spätere Begrüßungsänderung. Der Suchtext steht heute nicht mehr in README, trotzdem ist seine frühere Änderung auffindbar.',
        'The list contains the documentation commit and the later greeting update. The text is no longer in today’s README, but its earlier changes can still be found.',
      ],
      `${c('forensic-search')} [data-forensic-hash]`,
      { prepare: seed({ run: 2 }) },
    ),
    s(
      'removed-result',
      ['Der neueste Treffer entfernt die Beschreibung', 'The newest match removes the description'],
      [
        'Dieser Commit ersetzt die Projektbeschreibung durch Begrüßung und Status. Die Anzahl des Suchtextes fällt von eins auf null. Deshalb findet die Suche auch diesen Commit.',
        'This commit replaces the description with a greeting and status. The occurrence count falls from one to zero, so this commit matches too.',
      ],
      `${result(4)} > span`,
      { prepare: seed({ run: 2 }) },
    ),
    s(
      'added-result',
      ['Der ältere Treffer führt die Beschreibung ein', 'The older match introduces the description'],
      [
        'Im Dokumentations-Commit steigt die Anzahl von null auf eins. Treffer werden mit ihrer tatsächlichen Commit-Kennung und Nachricht angezeigt.',
        'In the documentation commit the count rises from zero to one. Results show their actual commit identifier and message.',
      ],
      `${result(3)} > span`,
      { prepare: seed({ run: 2 }) },
    ),
    s(
      'open-diff',
      ['Öffne den Diff des neuesten Treffers', 'Open the newest match’s diff'],
      [
        'Klicke Diff beim neuesten Treffer. So prüfst du die gefundene Inhaltsänderung direkt.',
        'Click Diff for the newest match to inspect the found content change directly.',
      ],
      `${result(4)} ${c('forensic-diff')}`,
      { prepare: seed({ run: 2 }), completion: element(`${viewer(4)} .file-viewer-diff .del .diff-code`) },
    ),
    s(
      'removed-text',
      ['Die rote Zeile bestätigt das Entfernen', 'The red line confirms removal'],
      [
        'Im Diff steht die gesuchte Projektübersicht auf der entfernten Seite. Die grüne Seite zeigt den neuen Inhalt des gefundenen Commits.',
        'The diff shows the searched Project overview on the removed side. The green side shows the matched commit’s new contents.',
      ],
      '.file-viewer-diff .del .diff-code',
      { prepare: seed({ run: 2, diff: 4 }) },
    ),
    s(
      'source',
      ['Der Treffer öffnet einen gespeicherten Commit', 'A result opens a saved commit'],
      [
        'Die Quelle nennt den neuesten Commit und schreibgeschützt. Der Vergleich ändert weder den aktuellen Index noch die Arbeitsdatei.',
        'The source names the newest commit and says read-only. The comparison changes neither the current index nor the working file.',
      ],
      c('file-source'),
      { prepare: seed({ run: 2, diff: 4 }) },
    ),
    s(
      'close-diff',
      ['Kehre zu den Suchtreffern zurück', 'Return to the search results'],
      ['Schließe den Viewer. Suchpfad, Suchtext und beide Treffer bleiben verfügbar.', 'Close the viewer. The path, text and both matches remain available.'],
      c('close-file'),
      { prepare: seed({ run: 2, diff: 4 }), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'lowercase',
      ['Ändere den Anfangsbuchstaben', 'Change the initial letter’s case'],
      [
        'Ändere Projektübersicht in projektübersicht. Die bisherigen Treffer sollen sofort verschwinden, bis du die neue Suche startest.',
        'Change Project overview to project overview. The previous results should disappear immediately until you run the new search.',
      ],
      query,
      { prepare: seed({ run: 2 }), completion: value(query, lowercase) },
    ),
    s(
      'run-lowercase',
      ['Prüfe die genaue Schreibweise', 'Test the exact case'],
      [
        'Starte die Suche erneut. In den gespeicherten README-Versionen gibt es die kleingeschriebene Form nicht.',
        'Run search again. The saved README versions do not contain this lowercase form.',
      ],
      run,
      { prepare: seed({ term: lowercase }), completion: element(state(0)) },
    ),
    s(
      'no-matches',
      ['Keine Treffer sagt etwas über diese Anfrage aus', 'No matches describes this query'],
      [
        'Dieser Suchtext hat keine passenden Anzahländerungen. Die Commits sind weiterhin vorhanden. Anders als die Commit-Metadatensuche ist diese wörtliche Git-Inhaltssuche schreibungsabhängig.',
        'This search text has no matching count changes. The commits still exist. Unlike commit metadata search, this literal Git content search is case-sensitive.',
      ],
      c('forensic-search'),
      { prepare: seed({ term: lowercase, run: 0 }) },
    ),
    s(
      'heading',
      ['Suche die unveränderte Überschrift', 'Search for the unchanged heading'],
      [
        'Ersetze den Suchtext durch # OGC-Lernprojekt. Suche nach dem vollständigen Text einschließlich #.',
        'Replace the query with # OGC-Lernprojekt. Include the # character.',
      ],
      query,
      { prepare: seed({ term: lowercase, run: 0 }), completion: value(query, heading) },
    ),
    s(
      'run-heading',
      ['Finde die einmalige Anlage', 'Find the one-time introduction'],
      [
        'Starte die Suche. Nur der erste Commit soll erscheinen, obwohl die Überschrift in allen vier Dateiständen vorkommt.',
        'Run search. Only the first commit should appear even though the heading exists in all four file states.',
      ],
      run,
      { prepare: seed({ term: heading }), completion: element(state(1)) },
    ),
    s(
      'heading-result',
      ['Unveränderte Vorkommen sind keine neuen Treffer', 'Unchanged occurrences are not new matches'],
      [
        'Die Überschrift wurde einmal angelegt und danach beibehalten. Der Modus sucht Anzahländerungen, nicht jede gespeicherte Version, die den Text enthält.',
        'The heading was introduced once and then preserved. This mode finds count changes, not every saved version containing the text.',
      ],
      result(1),
      { prepare: seed({ term: heading, run: 1 }) },
    ),
    s(
      'source-path',
      ['Wechsle zur Quelltextdatei', 'Switch to the source file'],
      [
        'Ändere den Pfad in src/app.ts. Der alte README-Treffer verschwindet, bevor eine neue Anfrage ausgeführt wird.',
        'Change the path to src/app.ts. The old README match disappears before a new query is run.',
      ],
      path,
      { prepare: seed({ term: heading, run: 1 }), completion: value(path, ['src/app.ts', 'src/app.ts']) },
    ),
    s(
      'prefix',
      ['Suche nach dem Text Hallo', 'Search for the text Hallo'],
      [
        'Trage Hallo ein. Im Quelltext kommt dieser Text sowohl in Hallo als auch später in Hallo Welt! vor.',
        'Enter Hallo. The source contains this text both in Hallo and later in Hallo Welt!.',
      ],
      query,
      { prepare: seed({ path: 'src/app.ts', term: heading }), completion: value(query, source.term) },
    ),
    s(
      'run-prefix',
      ['Finde die Änderung der Anzahl', 'Find the count change'],
      [
        'Starte die Suche. Nur die App-Anlage soll gefunden werden: Dort entsteht das erste Hallo-Vorkommen.',
        'Run search. Only adding the app should match: that introduces the first Hallo occurrence.',
      ],
      run,
      { prepare: seed(source), completion: element(state(1)) },
    ),
    s(
      'same-count',
      ['Eine geänderte Zeile kann dieselbe Anzahl behalten', 'A changed line can retain the same count'],
      [
        'Die spätere Änderung von Hallo zu Hallo Welt! enthält weiterhin genau einmal Hallo. Deshalb fehlt sie in diesem Suchtyp. Eine Suche nach geänderten passenden Zeilen benötigt den Regex-Modus, der gesondert erklärt wird.',
        'Changing Hallo to Hallo Welt! still leaves exactly one Hallo occurrence. That later change therefore does not match this search type. Searching changed matching lines needs Regex mode, covered separately.',
      ],
      result(2),
      { prepare: seed({ ...source, run: 1 }) },
    ),
    s(
      'select-commit',
      ['Wähle den passenden Commit aus', 'Select the matching commit'],
      [
        'Klicke die Commit-Kennung des Treffers. Damit wird die App-Anlage im Graphen ausgewählt.',
        'Click the result’s commit identifier. This selects the app commit in the graph.',
      ],
      `${result(2)} ${c('forensic-commit')}`,
      { prepare: seed({ ...source, run: 1 }), completion: element(`${row(2)}[data-selected="true"]`) },
    ),
    s(
      'open-inspector',
      ['Öffne die Commit-Details rechts', 'Open commit details on the right'],
      [
        'Öffne den rechten Inspector über die Panel-Schaltfläche. Die Dateiliste des ausgewählten Commits soll erscheinen.',
        'Open the right inspector with the panel button. The selected commit’s file list should appear.',
      ],
      c('inspector-toggle'),
      { prepare: seed({ ...source, run: 1, select: 2 }), completion: element(`${panel(2)} ${file('src/app.ts')}`) },
    ),
    s(
      'open-source',
      ['Prüfe die ursprüngliche Quelltextänderung', 'Inspect the original source change'],
      [
        'Klicke src/app.ts in der Commit-Dateiliste. Der Diff zeigt die Anlage der Datei mit Hallo.',
        'Click src/app.ts in the commit file list. Its diff shows the file being added with Hallo.',
      ],
      `${panel(2)} ${file('src/app.ts')}`,
      {
        prepare: {
          ...seed({ ...source, run: 1, select: 2 }),
          actions: [...seed({ ...source, run: 1, select: 2 }).actions!, { expand: c('inspector-toggle') }],
          ready: `${panel(2)} ${file('src/app.ts')}`,
        },
        completion: element(`${viewer(2, 'src/app.ts')} .file-viewer-diff .add .diff-code`),
      },
    ),
    s(
      'close-source',
      ['Schließe die historische Quelltextansicht', 'Close the historical source view'],
      ['Schließe den Viewer. Die Suche bleibt im Graphen verfügbar.', 'Close the viewer. Search remains available in the graph.'],
      c('close-file'),
      { prepare: seed({ ...source, run: 1, select: 2, file: 'src/app.ts' }), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'return',
      ['Kehre zur Commit-Metadatensuche zurück', 'Return to commit metadata search'],
      [
        'Wähle Commit-Suche im Modusfeld. Damit kehrst du zur Suche nach Nachrichten, Autoren, Hashes und Referenzen zurück.',
        'Choose Commit search in the mode field. This returns to searching messages, authors, hashes and references.',
      ],
      c('forensic-view'),
      {
        prepare: seed({ ...source, run: 1 }),
        completion: {
          kind: 'all',
          conditions: [element(c('commit-search-query')), { kind: 'value', selector: c('forensic-view'), value: ['commits', 'commits'] }],
        },
      },
    ),
    s(
      'finish',
      ['Suchtyp und Fragestellung müssen zusammenpassen', 'Choose the search type for the question'],
      [
        'Du hast einen verschwundenen Text gefunden, seine Einführung und Entfernung verglichen und den Unterschied zwischen Vorkommen und Anzahländerungen geprüft. Regex- und Zeilenbereichssuche werden als eigene Lektionen ergänzt.',
        'You found disappeared text, compared its introduction and removal, and checked the difference between occurrences and count changes. Regex and line-range searches will be added as separate lessons.',
      ],
      '[data-tutorial="graph"]',
      { prepare: commitSearchRecipe() },
    ),
  ],
};
