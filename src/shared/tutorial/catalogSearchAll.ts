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
  dialog,
  confirmDialog,
  cancelDialog,
} from './searchLessonHelpers';
export const TUTORIAL_SEARCH_ALL: TutorialChapter = {
  id: 'search-all',
  section: 'repo',
  title: ['Alle passenden Textstellen bewusst ersetzen', 'Replace all matching text deliberately'],
  description: [
    'Suchumfang und Ersatz prüfen, Bestätigung abbrechen, fünf Vorkommen in drei Dateien ersetzen und den Git-Status kontrollieren.',
    'Review search scope and replacement, cancel confirmation, replace five occurrences across three files and check Git status.',
  ],
  question: ['Wie ersetze ich einen Text im ganzen Projekt?', 'How do I replace text across the project?'],
  keywords: 'replace all alle ersetzen gesamt projekt suche umfang scope bestätigung abbrechen dateien text',
  steps: [
    s(
      'overview',
      ['All verwendet einen größeren Umfang als eine Ergebniszeile', 'All has a broader scope than one result row'],
      [
        'Das frische Beispiel hat fünf planet-Vorkommen in drei gespeicherten Dateien. Wir prüfen zuerst den Umfang und brechen ab. Danach ersetzen wir alle fünf Vorkommen gemeinsam.',
        'The fresh sample has five planet occurrences across three saved files. First we review the scope and cancel. Then we replace all five occurrences together.',
      ],
      c('file-search-toggle'),
      { continue: false },
    ),
    s(
      'open',
      ['Öffne die Dateisuche', 'Open file search'],
      ['Klicke die Lupe neben dem Projektnamen.', 'Click the magnifying glass beside the project name.'],
      c('file-search-toggle'),
      { completion: element('.working-search') },
    ),
    s(
      'mode',
      ['Wähle File contents', 'Choose File contents'],
      ['Wechsle zur Inhaltssuche, damit Ersatztext und All verfügbar werden.', 'Switch to content search to make replacement text and All available.'],
      c('file-search-contents'),
      { prepare: seed('base', { mode: 'filename', query: '' }), completion: element(c('file-search-all')) },
    ),
    s(
      'query',
      ['Suche planet ohne Aa', 'Search for planet with Aa off'],
      [
        'Trage planet als Suchtext ein. Aa bleibt aus, damit auch Planet und PLANET dazugehören. Es sollen fünf Vorkommen in drei Dateien erscheinen.',
        'Enter planet as the query. Keep Aa off so Planet and PLANET are included. Five occurrences should appear across three files.',
      ],
      c('file-search-query'),
      { prepare: seed('base', { query: '' }), completion: all(value(c('file-search-query'), 'planet', 5), element(results(5, 3))) },
    ),
    s(
      'replacement',
      ['Trage world als Ersatz ein', 'Enter world as the replacement'],
      [
        'Trage world in das zweite Feld ein. Alle ersetzten Schreibweisen sollen danach genau world lauten. Die Eingabe allein verändert noch nichts.',
        'Enter world in the second field. Every replaced case variant should become exactly world. Entering the value alone changes nothing.',
      ],
      c('file-search-replacement'),
      { prepare: seed(), completion: all(value(c('file-search-replacement'), 'world'), state()) },
    ),
    s(
      'scope',
      ['All ist nicht auf eine aufgeklappte Gruppe beschränkt', 'All is not limited to one expanded group'],
      [
        'All bearbeitet die passenden Inhalte der Repository-Dateiliste, nicht nur die angeklickte Fundstelle. Bei sehr vielen Treffern kann die Anzeige gekürzt sein; All durchsucht trotzdem die vollständige zulässige Dateiliste.',
        'All processes matching contents across the repository file list, not just the clicked occurrence. Large result lists can be truncated; All still scans the complete permitted file list.',
      ],
      c('file-search-all'),
      { prepare: seed('base', { replacement: 'world' }) },
    ),
    s(
      'open-confirm',
      ['Öffne die Bestätigung', 'Open confirmation'],
      [
        'Klicke All. Die Anwendung soll zuerst Suchtext, Trefferzahl, Dateizahl und Folgen anzeigen.',
        'Click All. The app should first show the query, match count, file count and consequences.',
      ],
      c('file-search-all'),
      { prepare: seed('base', { replacement: 'world' }), completion: element(confirmDialog) },
    ),
    s(
      'warning',
      ['Prüfe den größeren Änderungsumfang', 'Review the broader change scope'],
      [
        'Der Dialog nennt planet, fünf Vorkommen und drei angezeigte Dateien. Die Arbeitsdateien werden geändert. Gespeicherte Git-Stände bleiben erhalten, aber unversionierte Inhalte wären dadurch nicht automatisch gesichert.',
        'The dialog identifies planet, five occurrences and three displayed files. Working files will change. Saved Git versions are preserved, but untracked contents would not automatically be backed up.',
      ],
      dialog,
      { prepare: seed('base', { replacement: 'world', confirm: true }) },
    ),
    s(
      'cancel',
      ['Brich den ersten Versuch ab', 'Cancel the first attempt'],
      [
        'Klicke Abbrechen. Alle fünf Vorkommen sollen erhalten bleiben; keine Arbeitsdatei soll verändert werden.',
        'Click Cancel. All five occurrences must be preserved and no working file should change.',
      ],
      cancelDialog,
      {
        prepare: seed('base', { replacement: 'world', confirm: true }),
        completion: all({ kind: 'absent', selector: dialog }, state(), element(results(5, 3))),
      },
    ),
    s(
      'preserved',
      ['Abbrechen hat keine Dateioperation ausgeführt', 'Cancel performed no file operation'],
      [
        'Die Suche zeigt weiterhin fünf Treffer. Such- und Ersatztext bleiben für einen erneuten Versuch vorhanden. Erst eine bestätigte Aktion verändert Inhalte.',
        'Search still shows five matches. Query and replacement remain available for another attempt. Only a confirmed action changes contents.',
      ],
      c('file-search-summary'),
      { prepare: seed('base', { replacement: 'world' }) },
    ),
    s(
      'reopen',
      ['Öffne All erneut', 'Open All again'],
      [
        'Klicke All noch einmal. Prüfe erneut planet und die fünf Vorkommen, bevor du bestätigst.',
        'Click All again. Review planet and its five occurrences again before confirming.',
      ],
      c('file-search-all'),
      { prepare: seed('base', { replacement: 'world' }), completion: element(confirmDialog) },
    ),
    s(
      'replace-all',
      ['Ersetze die fünf Vorkommen', 'Replace the five occurrences'],
      [
        'Bestätige Replace all. Alle fünf passenden Vorkommen sollen zu world werden. Die drei Dateinamen und der Git-Index bleiben unverändert.',
        'Confirm Replace all. All five matching occurrences should become world. The three filenames and Git index must stay unchanged.',
      ],
      confirmDialog,
      {
        prepare: seed('base', { replacement: 'world', confirm: true }),
        completion: all(state('all'), { kind: 'absent', selector: dialog }, element(results(0, 0))),
      },
    ),
    s(
      'no-matches',
      ['planet passt jetzt zu keinem Dateiinhalt mehr', 'planet no longer matches any file contents'],
      [
        'Die neu geladene Suche hat null Treffer. Das bedeutet nicht, dass Dateien gelöscht wurden: Ihr Inhalt wurde ersetzt. Auch die großen Schreibweisen wurden durch das kleine world ersetzt.',
        'The refreshed search has zero matches. This does not mean files were deleted: their contents were replaced. Uppercase variants also became lowercase world.',
      ],
      c('file-search-summary'),
      { prepare: seed('all', { replacement: 'world' }) },
    ),
    s(
      'names',
      ['Prüfe die unveränderten Dateinamen', 'Check the unchanged filenames'],
      [
        'Wechsle zu File names. Der unveränderte Suchtext planet soll weiterhin alle drei Dateinamen finden.',
        'Switch to File names. The unchanged query planet should still find all three filenames.',
      ],
      c('file-search-names'),
      { prepare: seed('all', { replacement: 'world' }), completion: all(element(`${c('file-search-names')}[aria-selected="true"]`), element(results(3, 3))) },
    ),
    s(
      'paths-preserved',
      ['Text ersetzen benennt keine Dateien um', 'Replacing text does not rename files'],
      [
        'Die Pfade heißen weiterhin guides/Planet.md, notes/planet.txt und src/planet.ts. Für Namensänderungen gibt es die getrennten Umbenennen-Werkzeuge im Projektbaum.',
        'The paths are still guides/Planet.md, notes/planet.txt and src/planet.ts. Filename changes use the separate rename tools in the project tree.',
      ],
      '.working-search__results',
      { prepare: seed('all', { mode: 'filename' }) },
    ),
    s(
      'contents',
      ['Wechsle zurück zur Inhaltssuche', 'Return to content search'],
      [
        'Klicke File contents. Der Suchtext planet soll wieder null Inhaltstreffer liefern.',
        'Click File contents. The query planet should again return zero content matches.',
      ],
      c('file-search-contents'),
      { prepare: seed('all', { mode: 'filename' }), completion: all(element(`${c('file-search-contents')}[aria-selected="true"]`), element(results(0))) },
    ),
    s(
      'new-query',
      ['Suche nach dem neuen Text world', 'Search for the new text world'],
      [
        'Ersetze den Suchtext planet durch world. Jetzt sollen wieder fünf Vorkommen in drei Dateien erscheinen.',
        'Replace the query planet with world. Five occurrences should now appear across three files again.',
      ],
      c('file-search-query'),
      { prepare: seed('all'), completion: all(value(c('file-search-query'), 'world', 5), element(results(5, 3))) },
    ),
    s(
      'open-file',
      ['Prüfe das geänderte Handbuch', 'Inspect the changed guide'],
      [
        'Öffne guides/Planet.md über die Gruppenüberschrift. Wir vergleichen den vollständigen gespeicherten Inhalt.',
        'Open guides/Planet.md through its group header. We will inspect the complete saved contents.',
      ],
      `${result()} .working-search-result-group__file`,
      { prepare: seed('all', { query: 'world', count: 5 }), completion: element(viewer) },
    ),
    s(
      'read',
      ['Alle drei Handbuch-Vorkommen wurden ersetzt', 'All three guide occurrences were replaced'],
      [
        'Überschrift und beide Datenzeilen enthalten jetzt world. Die übrigen Zeichen, die Leerzeile und die Zeilenstruktur bleiben erhalten. Die Änderung ist bereits in der Arbeitsdatei gespeichert.',
        'The heading and both data lines now contain world. Other characters, the blank line and line structure are preserved. The change is already saved in the working file.',
      ],
      editor,
      { prepare: seed('all', { query: 'world', count: 5, file: true }) },
    ),
    s(
      'diff',
      ['Öffne den Diff der Arbeitsdatei', 'Open the working-file diff'],
      [
        'Wechsle zu Diff. Der Vergleich soll die drei ersetzten Handbuchzeilen gegenüber dem unveränderten Git-Stand zeigen.',
        'Switch to Diff. The comparison should show the guide’s three replaced lines against the unchanged Git version.',
      ],
      '.file-viewer [data-file-tab="diff"]',
      { prepare: seed('all', { query: 'world', count: 5, file: true }), completion: element(`${viewer}[data-tab="diff"]`) },
    ),
    s(
      'read-diff',
      ['Der Diff beschreibt Inhalt, nicht die Suchanzeige', 'The diff describes contents, not search results'],
      [
        'Rot zeigt die ursprünglichen Planet/planet-Zeilen, Grün ihre world-Fassungen. Der Dateiname enthält weiterhin Planet. Die beiden anderen geänderten Dateien haben eigene Diffs.',
        'Red shows the original Planet/planet lines and green their world versions. The filename still contains Planet. The other two changed files have their own diffs.',
      ],
      '.file-viewer-diff',
      { prepare: seed('all', { query: 'world', count: 5, file: true, diff: true }) },
    ),
    s('close', ['Schließe den Vergleich', 'Close the comparison'], ['Schließe den Viewer mit X.', 'Close the viewer with X.'], c('close-file'), {
      prepare: seed('all', { query: 'world', count: 5, file: true, diff: true }),
      completion: { kind: 'absent', selector: viewer },
    }),
    s(
      'open-staging',
      ['Prüfe die drei geänderten Dateien', 'Check the three changed files'],
      [
        'Wechsle zur Staging Area. Handbuch, Notiz und Quelltext sollen als Änderungen erscheinen; der Index bleibt unverändert.',
        'Switch to Staging Area. The guide, note and source should appear as Changes; the index stays unchanged.',
      ],
      c('open-staging'),
      { prepare: p('all'), completion: element(`${c('open-staging')}[aria-pressed="true"]`) },
    ),
    s(
      'finish',
      ['Große Ersetzungen vor dem Vormerken prüfen', 'Review broad replacements before staging'],
      [
        'Du hast den Umfang geprüft, abgebrochen, alle Vorkommen ersetzt und Inhalt sowie Dateinamen getrennt kontrolliert. Prüfe bei echten Projekten die resultierenden Diffs, bevor du die Änderungen vormerkst und committest.',
        'You reviewed scope, canceled, replaced every occurrence and checked contents separately from filenames. In real projects, inspect the resulting diffs before staging and committing.',
      ],
      c('staging'),
      { openView: undefined, inspector: 'staging', prepare: p('all') },
    ),
  ].flatMap(withTextViewSteps({ 'open-file': 'guides/Planet.md' })),
};
