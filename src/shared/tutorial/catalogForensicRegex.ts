import type { TutorialChapter } from './types';
import {
  s,
  regexRecipe as seed,
  regexState as state,
  regexValue as value,
  invalidRegexAttempt,
  forensicRecipe,
  result,
  c,
  element,
  viewer,
} from './regexLessonHelpers';
import { commitSearchRecipe } from './commitSearchLessonHelpers';
const query = c('forensic-query'),
  run = c('forensic-run');
const anchor = '^export const greeting',
  removed = '"Hallo";$',
  current = '"Hallo Welt!";$',
  group = 'Hallo( Welt!)?',
  characters = '[Ww]elt';
export const TUTORIAL_FORENSIC_REGEX: TutorialChapter = {
  id: 'history-forensic-regex',
  section: 'repo',
  title: ['Geänderte Zeilen mit regulären Ausdrücken finden', 'Find changed lines with regular expressions'],
  description: [
    'Git -G mit der Anzahl-Suche vergleichen; entfernte Zeilen, Anker, Gruppen, optionale Teile, Zeichenklassen und Musterfehler praktisch untersuchen.',
    'Compare Git -G with count search; explore removed lines, anchors, groups, optional parts, character classes and pattern errors.',
  ],
  question: ['Wie finde ich geänderte Zeilen mit einem Suchmuster?', 'How do I find changed lines with a search pattern?'],
  keywords: 'regex regexp regular expression regulärer ausdruck git -G forensic changed line zeilen anker anchor gruppe optional zeichenklasse pattern syntax',
  steps: [
    s(
      'overview',
      ['Regex sucht in geänderten Zeilen', 'Regex searches changed lines'],
      [
        'Die wörtliche Git -S-Suche prüft die Anzahl eines Textes. Git -G prüft dagegen, ob hinzugefügte oder entfernte Zeilen zu einem Muster passen. Wir untersuchen dieselbe Begrüßungsdatei mit beiden Fragestellungen.',
        'Literal Git -S search checks a text’s occurrence count. Git -G instead checks whether added or removed lines match a pattern. We will examine the same greeting file using both questions.',
      ],
      c('commit-search-mode'),
      { continue: false, prepare: commitSearchRecipe() },
    ),
    s(
      'open',
      ['Öffne Forensische Historie', 'Open Forensic history'],
      ['Wähle Forensische Historie im Modusfeld.', 'Choose Forensic history in the mode field.'],
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
      ['Wähle den Regex-Suchtyp', 'Choose Regex search'],
      [
        'Wähle Regex als Suchtyp. Das Musterfeld entspricht der Suche mit Git -G.',
        'Choose Regex as the search type. The pattern field corresponds to Git -G search.',
      ],
      c('forensic-kind'),
      {
        prepare: forensicRecipe({ path: '', term: ['', ''] }),
        completion: {
          kind: 'all',
          conditions: [
            { kind: 'value', selector: c('forensic-kind'), value: ['regex', 'regex'] },
            element(`${c('forensic-search')}[data-search-mode="regex"]`),
          ],
        },
      },
    ),
    s(
      'path',
      ['Wähle die Begrüßungsdatei', 'Choose the greeting file'],
      ['Trage src/app.ts als relativen Pfad ein.', 'Enter src/app.ts as the relative path.'],
      c('forensic-path'),
      { prepare: seed({ path: '', pattern: '' }), completion: value(c('forensic-path'), 'src/app.ts') },
    ),
    s(
      'query',
      ['Beginne mit dem einfachen Muster Hallo', 'Start with the simple pattern Hallo'],
      [
        'Trage Hallo ein. Ein Muster ohne besondere Zeichen sucht zunächst nach diesem Text in den geänderten Zeilen.',
        'Enter Hallo. A pattern without special characters initially searches for that text in the changed lines.',
      ],
      query,
      { prepare: seed({ pattern: '' }), completion: value(query, 'Hallo') },
    ),
    s(
      'run',
      ['Starte die Suche nach passenden Änderungszeilen', 'Search for matching changed lines'],
      [
        'Starte die Suche. Die Anlage der App und die spätere Änderung der Begrüßung sollen erscheinen.',
        'Run search. Adding the app and later changing the greeting should appear.',
      ],
      run,
      { prepare: seed(), completion: element(state(2)) },
    ),
    s(
      'changed-lines',
      ['Beide Änderungen enthalten eine passende Zeile', 'Both changes contain a matching line'],
      [
        'Der zweite Commit fügt die Hallo-Zeile hinzu. Der vierte entfernt diese Zeile und fügt Hallo Welt! ein. Beide Änderungen haben passende Diff-Zeilen.',
        'The second commit adds the Hallo line. The fourth removes that line and adds Hallo Welt!. Both changes contain matching diff lines.',
      ],
      result(4),
      { prepare: seed({ run: 2 }) },
    ),
    s(
      'count-difference',
      ['Der Unterschied zu Git -S liegt in der Fragestellung', 'The difference from Git -S is the question'],
      [
        'Hallo kommt vor und nach dem vierten Commit genau einmal vor. Die Anzahl-Suche findet ihn deshalb nicht. Die Regex-Suche findet ihn, weil sich passende Zeilen ändern.',
        'Hallo occurs exactly once before and after the fourth commit. Count search therefore does not match it. Regex search matches because matching lines change.',
      ],
      c('forensic-kind'),
      { prepare: seed({ run: 2 }) },
    ),
    s(
      'open-diff',
      ['Prüfe den neuesten Treffer im Diff', 'Inspect the newest match in Diff'],
      ['Klicke Diff beim neuesten Treffer.', 'Click Diff for the newest match.'],
      `${result(4)} ${c('forensic-diff')}`,
      { prepare: seed({ run: 2 }), completion: element(`${viewer(4, 'src/app.ts')} .file-viewer-diff .del .diff-code`) },
    ),
    s(
      'before',
      ['Auch die entfernte Zeile passt', 'The removed line matches too'],
      [
        'Die rote Zeile enthält die frühere Begrüßung Hallo. Git -G berücksichtigt entfernte passende Zeilen ebenso wie hinzugefügte.',
        'The red line contains the earlier Hallo greeting. Git -G considers removed matching lines as well as added ones.',
      ],
      '.file-viewer-diff .del .diff-code',
      { prepare: seed({ run: 2, diff: 4 }) },
    ),
    s(
      'after',
      ['Die neue Zeile enthält den Suchtext weiterhin', 'The new line still contains the searched text'],
      [
        'Die grüne Zeile lautet nun Hallo Welt!. Dass der Teiltext weiter vorkommt, verhindert einen Regex-Treffer nicht.',
        'The green line now says Hallo Welt!. Retaining the substring does not prevent a Regex match.',
      ],
      '.file-viewer-diff .add .diff-code',
      { prepare: seed({ run: 2, diff: 4 }) },
    ),
    s(
      'close-diff',
      ['Kehre zur Mustersuche zurück', 'Return to pattern search'],
      ['Schließe den Viewer. Pfad, Muster und Treffer bleiben erhalten.', 'Close the viewer. The path, pattern and matches remain available.'],
      c('close-file'),
      { prepare: seed({ run: 2, diff: 4 }), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'anchor',
      ['Begrenze das Muster auf den Zeilenanfang', 'Anchor the pattern at the beginning of a line'],
      [
        'Ersetze Hallo durch ^export const greeting. Das Zeichen ^ verlangt den Beginn der geänderten Zeile.',
        'Replace Hallo with ^export const greeting. The ^ character requires the start of the changed line.',
      ],
      query,
      { prepare: seed({ run: 2 }), completion: value(query, anchor) },
    ),
    s(
      'run-anchor',
      ['Suche die Deklarationszeilen', 'Search the declaration lines'],
      [
        'Starte die Suche. Beide Begrüßungsänderungen beginnen mit derselben Deklaration.',
        'Run search. Both greeting changes begin with the same declaration.',
      ],
      run,
      { prepare: seed({ pattern: anchor }), completion: element(state(2)) },
    ),
    s(
      'anchor-result',
      ['Ein Anker verändert die Musterbedeutung', 'An anchor changes the meaning of a pattern'],
      [
        '^ wird als Anker ausgewertet und nicht als sichtbares Zeichen gesucht. Für wörtliche Sonderzeichen benötigt ein Regex passende Escape-Zeichen; die einfache Anzahl-Suche behandelt ihren Suchtext dagegen wörtlich.',
        '^ is interpreted as an anchor rather than searched as a visible character. Literal special characters need suitable escaping in a Regex; count search instead treats its query literally.',
      ],
      result(4),
      { prepare: seed({ pattern: anchor, run: 2 }) },
    ),
    s(
      'removed-pattern',
      ['Suche die frühere Begrüßung am Zeilenende', 'Search for the earlier greeting at the line end'],
      [
        'Trage "Hallo";$ ein. Die Anführungszeichen und das Semikolon gehören zum Quelltext; $ verlangt das Ende der Zeile.',
        'Enter "Hallo";$. The quotes and semicolon belong to the source; $ requires the end of the line.',
      ],
      query,
      { prepare: seed({ pattern: anchor, run: 2 }), completion: value(query, removed) },
    ),
    s(
      'run-removed',
      ['Finde auch die spätere Entfernung dieses Inhalts', 'Find the later removal of this content too'],
      ['Starte die Suche. Es sollen weiterhin beide Commits erscheinen.', 'Run search. Both commits should still appear.'],
      run,
      { prepare: seed({ pattern: removed }), completion: element(state(2)) },
    ),
    s(
      'removed-result',
      ['Ein Treffer muss heute nicht mehr zum Dateiinhalt passen', 'A match need not still fit today’s file contents'],
      [
        'Der vierte Commit ist ein Treffer, weil er die frühere Hallo-Zeile entfernt. Der heutige Inhalt enthält an dieser Stelle schon Hallo Welt!. Die Suche untersucht die Änderung, nicht nur die aktuelle Datei.',
        'The fourth commit matches because it removes the earlier Hallo line. Today’s file already says Hallo Welt! there. Search examines the change, not just the current file.',
      ],
      result(4),
      { prepare: seed({ pattern: removed, run: 2 }) },
    ),
    s(
      'current-pattern',
      ['Suche die spätere Begrüßung', 'Search for the later greeting'],
      ['Ersetze das Muster durch "Hallo Welt!";$.', 'Replace the pattern with "Hallo Welt!";$.'],
      query,
      { prepare: seed({ pattern: removed, run: 2 }), completion: value(query, current) },
    ),
    s(
      'run-current',
      ['Prüfe die einzelne Einführung des neuen Inhalts', 'Check the single introduction of the new content'],
      ['Starte die Suche. Nur der vierte Commit soll erscheinen.', 'Run search. Only the fourth commit should appear.'],
      run,
      { prepare: seed({ pattern: current }), completion: element(state(1)) },
    ),
    s(
      'lowercase',
      ['Prüfe die Schreibweise', 'Check case sensitivity'],
      [
        'Ersetze das Muster durch hallo mit kleinem h. Diese Git-Inhaltssuche ignoriert die Schreibweise nicht automatisch.',
        'Replace the pattern with lowercase hallo. This Git content search does not ignore case automatically.',
      ],
      query,
      { prepare: seed({ pattern: current, run: 1 }), completion: value(query, 'hallo') },
    ),
    s(
      'run-empty',
      ['Suche nach der kleingeschriebenen Form', 'Search for the lowercase form'],
      [
        'Starte die Suche. Die geänderten Quelltextzeilen enthalten Hallo mit großem H; es gibt keine passenden Treffer.',
        'Run search. The changed source lines contain uppercase Hallo; there are no matching results.',
      ],
      run,
      { prepare: seed({ pattern: 'hallo' }), completion: element(state(0)) },
    ),
    s(
      'empty',
      ['Keine Treffer ist ein reguläres Suchergebnis', 'No matches is a normal search result'],
      [
        'Die Suche war gültig, hat aber keine passenden Änderungszeilen gefunden. Das ist etwas anderes als ein syntaktisch ungültiges Muster.',
        'The search was valid but found no matching changed lines. That differs from a syntactically invalid pattern.',
      ],
      c('forensic-search'),
      { prepare: seed({ pattern: 'hallo', run: 0 }) },
    ),
    s(
      'group',
      ['Fasse einen optionalen Teil zusammen', 'Group an optional part'],
      [
        'Trage Hallo( Welt!)? ein. Die Klammern gruppieren das Leerzeichen samt Welt!; ? macht diese Gruppe optional.',
        'Enter Hallo( Welt!)?. Parentheses group the space and Welt!; ? makes that group optional.',
      ],
      query,
      { prepare: seed({ pattern: 'hallo', run: 0 }), completion: value(query, group) },
    ),
    s(
      'run-group',
      ['Suche beide Begrüßungsformen', 'Search both greeting forms'],
      [
        'Starte die Suche. Das Muster passt zu Hallo und Hallo Welt!, daher erscheinen beide Änderungen.',
        'Run search. The pattern matches Hallo and Hallo Welt!, so both changes appear.',
      ],
      run,
      { prepare: seed({ pattern: group }), completion: element(state(2)) },
    ),
    s(
      'optional',
      ['Die Gruppe erweitert das Muster', 'The group extends the pattern'],
      [
        'Der optionale Teil kann fehlen oder vorkommen. Die Suchregel gilt für hinzugefügte und entfernte Zeilen beider Commits.',
        'The optional part can be absent or present. The rule applies to added and removed lines in both commits.',
      ],
      result(2),
      { prepare: seed({ pattern: group, run: 2 }) },
    ),
    s(
      'invalid',
      ['Probiere eine nicht geschlossene Zeichenklasse', 'Try an unclosed character class'],
      [
        'Ersetze das Muster bewusst durch ein einzelnes [. Im nächsten Schritt prüfen wir die Fehlermeldung.',
        'Deliberately replace the pattern with a single [. Next we will check its error feedback.',
      ],
      query,
      { prepare: seed({ pattern: group, run: 2 }), completion: value(query, '[') },
    ),
    s(
      'run-invalid',
      ['Prüfe die Rückmeldung zum Musterfehler', 'Check feedback for the pattern error'],
      [
        'Starte die Suche. Eine Fehlermeldung soll das ungültige Muster melden; die Oberfläche bleibt für eine Korrektur bedienbar.',
        'Run search. An error should report the invalid pattern; the interface remains usable for a correction.',
      ],
      run,
      { prepare: seed({ pattern: '[' }), completion: invalidRegexAttempt },
    ),
    s(
      'correct',
      ['Schließe die Zeichenklasse korrekt', 'Use a complete character class'],
      [
        'Trage [Ww]elt ein. [Ww] erlaubt an dieser Position W oder w und die schließende Klammer beendet die Zeichenklasse.',
        'Enter [Ww]elt. [Ww] allows either W or w at that position, and the closing bracket ends the character class.',
      ],
      query,
      { prepare: seed({ pattern: '[' }), completion: value(query, characters) },
    ),
    s(
      'retry',
      ['Suche mit dem korrigierten Muster', 'Search with the corrected pattern'],
      [
        'Starte erneut. Die Änderung mit Hallo Welt! soll als einziger Treffer erscheinen.',
        'Run search again. The Hallo Welt! change should be the only match.',
      ],
      run,
      { prepare: seed({ pattern: characters }), completion: element(state(1)) },
    ),
    s(
      'character-class',
      ['Ein begrenztes Zeichenangebot ist kein vollständiges Ignore-Case', 'A character choice is not full case-insensitive matching'],
      [
        '[Ww] erlaubt beide Schreibweisen nur an dieser Position. Die übrigen Buchstaben elt bleiben unverändert Teil des Musters. Übungsaktionen mit nicht unterstützten Mustern erhalten eine verständliche Rückmeldung.',
        '[Ww] allows both cases only at that position. The remaining elt letters stay unchanged parts of the pattern. Unsupported practice patterns receive clear feedback.',
      ],
      result(4),
      { prepare: seed({ pattern: characters, run: 1 }) },
    ),
    s(
      'return',
      ['Kehre zur Commit-Suche zurück', 'Return to commit search'],
      ['Wähle Commit-Suche im Modusfeld.', 'Choose Commit search in the mode field.'],
      c('forensic-view'),
      {
        prepare: seed({ pattern: characters, run: 1 }),
        completion: {
          kind: 'all',
          conditions: [element(c('commit-search-query')), { kind: 'value', selector: c('forensic-view'), value: ['commits', 'commits'] }],
        },
      },
    ),
    s(
      'finish',
      ['Die Frage bestimmt den Suchmodus', 'The question determines the search mode'],
      [
        'Du hast geänderte passende Zeilen, entfernten Inhalt, Anker, Gruppen, optionale Teile und Zeichenklassen untersucht und einen Musterfehler korrigiert. Anzahl-Suche, Regex und Zeilenhistorie ergänzen die Suche in Commit-Metadaten.',
        'You examined matching changed lines, removed contents, anchors, groups, optional parts and character classes, and corrected a pattern error. Count search, Regex and line history complement commit metadata search.',
      ],
      '[data-tutorial="graph"]',
      { prepare: commitSearchRecipe() },
    ),
  ],
};
