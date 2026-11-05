import type { TutorialChapter, TutorialCompletion, TutorialText } from './types';
import {
  commitSearchStep as s,
  commitSearchRecipe as seed,
  commitSearchState as state,
  selectedCommit as selected,
  c,
  hash,
  element,
} from './commitSearchLessonHelpers';
const query = c('commit-search-query');
const scope = c('commit-search-scope');
const value = (selector: string, text: string, field: Parameters<typeof state>[0], search: string, count: number): TutorialCompletion => ({
  kind: 'all',
  conditions: [{ kind: 'value', selector, value: [text, text] }, state(field, [search, search], count)],
});
const pair = (text: string): TutorialText => [text, text];
const opened = { actions: [{ expand: c('inspector-toggle') }] } as const;
export const TUTORIAL_HISTORY_SEARCH: TutorialChapter = {
  id: 'history-search',
  section: 'repo',
  title: ['Commits nach Nachricht, Autor, Hash und Referenz suchen', 'Search commits by message, author, hash and reference'],
  description: [
    'Suchumfang wählen, Treffer lesen und zyklisch anspringen; Hash, Tag und Branch suchen und leere Ergebnisse behandeln.',
    'Choose a search field, inspect and cycle through matches; find hashes, tags and branches and handle empty results.',
  ],
  question: ['Wie finde ich einen bestimmten Commit im Graphen?', 'How do I find a particular commit in the graph?'],
  keywords: 'history search commit suche graph message nachricht author autor hash refs tag branch next previous treffer',
  steps: [
    s(
      'overview',
      ['Commit-Suche liest Metadaten', 'Commit search reads metadata'],
      [
        'Die Suchleiste durchsucht die im Graphen geladenen Commit-Nachrichten, Autoren, Hashes und Referenzen. Die Suche nach früherem Dateiinhalt ist ein eigener Modus. Zuerst schaffen wir Platz für die Suchfelder.',
        'The toolbar searches messages, authors, hashes and references of commits loaded in the graph. Searching earlier file contents is a separate mode. First we will make room for the search controls.',
      ],
      c('inspector-toggle'),
      { continue: false, prepare: opened },
    ),
    s(
      'close-inspector',
      ['Vergrößere den Graphen', 'Make more room for the graph'],
      [
        'Schließe den rechten Inspector mit dieser Schaltfläche. Dadurch steht auch im kleinen Fenster mehr Platz für die Suchleiste bereit. Am Ende öffnen wir ihn wieder.',
        'Close the right inspector with this button. This gives the search toolbar more room in a small window too. We will reopen it at the end.',
      ],
      c('inspector-toggle'),
      { prepare: opened, completion: element(`${c('inspector-toggle')}[aria-expanded="false"]`) },
    ),
    s(
      'fields',
      ['Alles verbindet mehrere Suchfelder', 'All combines several search fields'],
      [
        'Der aktuelle Umfang Alles sucht in Nachricht, Autor, Hash und Referenzen. Ein Treffer markiert den Commit im Graphen. Die Suche verändert weder Dateien noch Commits.',
        'The current All scope searches message, author, hash and references. A match highlights its commit in the graph. Searching changes neither files nor commits.',
      ],
      scope,
      { prepare: seed() },
    ),
    s(
      'query',
      ['Suche nach feat', 'Search for feat'],
      [
        'Trage feat ein. Die App-Anlage und die spätere Begrüßungsänderung sollen gefunden werden, weil beide Betreffzeilen diesen Typ verwenden.',
        'Enter feat. Adding the app and later changing its greeting should match because both subjects use this type.',
      ],
      query,
      { prepare: seed(), completion: value(query, 'feat', 'all', 'feat', 2) },
    ),
    s(
      'matches',
      ['Zwei Treffer bleiben im gesamten Graphen sichtbar', 'Two matches remain visible in the full graph'],
      [
        'Die Trefferzahl lautet zwei. Passende Zeilen sind hervorgehoben; die übrigen Commits bleiben zur Einordnung sichtbar. Die Suchleiste entfernt also keine Projektgeschichte.',
        'The match count is two. Matching rows are highlighted; other commits remain visible for context. The toolbar does not remove project history.',
      ],
      c('commit-search-results'),
      { prepare: seed('all', pair('feat'), 2) },
    ),
    s(
      'uppercase',
      ['Die Commit-Suche ignoriert Groß-/Kleinschreibung', 'Commit search ignores case'],
      ['Ändere feat in FEAT. Es sollen dieselben zwei Commits gefunden werden.', 'Change feat to FEAT. The same two commits should match.'],
      query,
      { prepare: seed('all', pair('feat'), 2), completion: value(query, 'FEAT', 'all', 'FEAT', 2) },
    ),
    s(
      'next',
      ['Springe zum nächsten Treffer', 'Jump to the next match'],
      [
        'Klicke den rechten Trefferpfeil. Im Beispiel wird damit die App-Anlage ausgewählt. Die Suche bleibt aktiv.',
        'Click the right match arrow. In this example it selects the commit adding the app. Search remains active.',
      ],
      c('commit-search-next'),
      { prepare: seed('all', pair('FEAT'), 2), completion: element(selected(2)) },
    ),
    s(
      'previous',
      ['Springe zum vorherigen Treffer', 'Jump to the previous match'],
      [
        'Klicke den linken Trefferpfeil. Jetzt soll die neuere Begrüßungsänderung ausgewählt werden.',
        'Click the left match arrow. The newer greeting change should now be selected.',
      ],
      c('commit-search-previous'),
      { prepare: seed('all', pair('FEAT'), 2, { selected: 2 }), completion: element(selected(4)) },
    ),
    s(
      'wrap',
      ['Die Treffer-Navigation läuft im Kreis', 'Match navigation wraps around'],
      [
        'Klicke noch einmal den linken Trefferpfeil. Vor dem ersten Treffer wird wieder der letzte Treffer, die App-Anlage, ausgewählt.',
        'Click the left match arrow again. Before the first match, navigation wraps to the last match, adding the app.',
      ],
      c('commit-search-previous'),
      { prepare: seed('all', pair('FEAT'), 2, { selected: 4 }), completion: element(selected(2)) },
    ),
    s(
      'clear-first',
      ['Leere die erste Suche', 'Clear the first search'],
      [
        'Entferne FEAT aus dem Suchfeld. Ohne Suchtext werden keine Trefferpfeile angeboten.',
        'Remove FEAT from the query. Without search text there are no match arrows.',
      ],
      query,
      { prepare: seed('all', pair('FEAT'), 2, { selected: 2 }), completion: value(query, '', 'all', '', 0) },
    ),
    s(
      'author-scope',
      ['Begrenze die Suche auf den Autor', 'Limit search to the author'],
      [
        'Wähle Autor im Umfangsfeld. Betreff, Hash und Branch-Namen werden dann nicht zur Suche herangezogen.',
        'Choose Author in the scope field. Subject, hash and branch names will no longer be searched.',
      ],
      scope,
      { prepare: seed(), completion: value(scope, 'author', 'author', '', 0) },
    ),
    s(
      'author-query',
      ['Finde die Commits von Sam', 'Find Sam’s commits'],
      ['Trage Sam ein. Die ersten beiden Commits stammen von Sam Beispiel.', 'Enter Sam. Sam Beispiel authored the first two commits.'],
      query,
      { prepare: seed('author'), completion: value(query, 'Sam', 'author', 'Sam', 2) },
    ),
    s(
      'author-lowercase',
      ['Prüfe dieselbe Autorensuche mit kleinen Buchstaben', 'Try the same author search in lowercase'],
      ['Ändere Sam in sam. Es sollen weiterhin zwei Treffer erscheinen.', 'Change Sam to sam. There should still be two matches.'],
      query,
      { prepare: seed('author', pair('Sam'), 2), completion: value(query, 'sam', 'author', 'sam', 2) },
    ),
    s(
      'message-scope',
      ['Suche denselben Text nur in der Nachricht', 'Search the same text only in the message'],
      [
        'Wähle Nachricht, ohne sam zu ändern. Jetzt soll es keine Treffer geben: Sam steht als Autor, nicht im Commit-Betreff.',
        'Choose Message without changing sam. There should now be no matches: Sam appears as author, not in the commit subject.',
      ],
      scope,
      { prepare: seed('author', pair('sam'), 2), completion: value(scope, 'subject', 'subject', 'sam', 0) },
    ),
    s(
      'empty',
      ['Null Treffer sperrt beide Trefferpfeile', 'Zero matches disables both match arrows'],
      [
        'Die Trefferzahl ist null und beide Pfeile sind deaktiviert. Die vier Commit-Zeilen bleiben trotzdem im Graphen sichtbar. Ein leerer Trefferbestand bedeutet nicht, dass das Repository leer wäre.',
        'The match count is zero and both arrows are disabled. All four commit rows remain visible. No matches does not mean the repository is empty.',
      ],
      c('commit-search-results'),
      { prepare: seed('subject', pair('sam'), 0) },
    ),
    s(
      'message-query',
      ['Finde die Dokumentationsnachricht', 'Find the documentation message'],
      [
        'Ersetze sam durch docs. Der Dokumentations-Commit soll als einziger Treffer hervorgehoben werden.',
        'Replace sam with docs. The documentation commit should be the only highlighted match.',
      ],
      query,
      { prepare: seed('subject', pair('sam'), 0), completion: value(query, 'docs', 'subject', 'docs', 1) },
    ),
    s(
      'message-result',
      ['Nachricht meint hier den Commit-Betreff', 'Message means the commit subject here'],
      [
        'Der Treffer stammt aus dem docs-Betreff im Graphen. Der Suchumfang durchsucht hier nicht den Dateiinhalt und nicht die ausführliche Commit-Beschreibung.',
        'This match comes from the docs subject in the graph. This search field does not search file contents or the longer commit description.',
      ],
      c('commit-search-results'),
      { prepare: seed('subject', pair('docs'), 1) },
    ),
    s(
      'hash-scope',
      ['Wechsle zum Hash-Feld', 'Switch to the hash field'],
      [
        'Wähle Hash. Der Text docs passt dort nicht, deshalb fällt die Trefferzahl auf null.',
        'Choose Hash. docs does not match that field, so the match count drops to zero.',
      ],
      scope,
      { prepare: seed('subject', pair('docs'), 1), completion: value(scope, 'hash', 'hash', 'docs', 0) },
    ),
    s(
      'hash-query',
      ['Suche die kurze Commit-Kennung', 'Search the abbreviated commit identifier'],
      [
        'Ersetze docs durch daa66d1. Diese Kurzform gehört zum Dokumentations-Commit.',
        'Replace docs with daa66d1. This abbreviation belongs to the documentation commit.',
      ],
      query,
      { prepare: seed('hash', pair('docs'), 0), completion: value(query, hash(3).slice(0, 7), 'hash', hash(3).slice(0, 7), 1) },
    ),
    s(
      'hash-result',
      ['Kurzform und vollständiger Hash sind suchbar', 'Both abbreviated and full hashes are searchable'],
      [
        'Die Suche prüft sowohl die angezeigte Kurzform als auch die vollständige Commit-Kennung. Ein längerer eindeutiger Ausschnitt hilft, ähnlich beginnende Kennungen zu unterscheiden.',
        'Search checks both the displayed abbreviation and the full commit identifier. A longer unique fragment helps distinguish identifiers with similar prefixes.',
      ],
      c('commit-search-results'),
      { prepare: seed('hash', pair(hash(3).slice(0, 7)), 1) },
    ),
    s(
      'refs-scope',
      ['Wechsle zu Referenzen', 'Switch to references'],
      [
        'Wähle Refs. Hier werden die Namen von Branches, Tags und HEAD-Markierungen durchsucht.',
        'Choose Refs. This searches names of branches, tags and HEAD labels.',
      ],
      scope,
      { prepare: seed('hash', pair(hash(3).slice(0, 7)), 1), completion: value(scope, 'refs', 'refs', hash(3).slice(0, 7), 0) },
    ),
    s(
      'tag-query',
      ['Finde den Versions-Tag', 'Find the version tag'],
      [
        'Trage v1.0.0 ein. Der Tag zeigt im Beispiel auf den Commit, der die App angelegt hat.',
        'Enter v1.0.0. In this example the tag points to the commit that added the app.',
      ],
      query,
      { prepare: seed('refs', pair(hash(3).slice(0, 7)), 0), completion: value(query, 'v1.0.0', 'refs', 'v1.0.0', 1) },
    ),
    s(
      'tag-result',
      ['Ein Tag-Name verweist auf einen gespeicherten Commit', 'A tag name refers to a saved commit'],
      [
        'Die markierte App-Anlage ist der mit v1.0.0 benannte Stand. Die Suche nach dem Tag wechselt weder Branch noch Arbeitsdateien.',
        'The highlighted app commit is the state named v1.0.0. Searching for a tag checks out neither branches nor working files.',
      ],
      c('commit-search-results'),
      { prepare: seed('refs', pair('v1.0.0'), 1) },
    ),
    s(
      'branch-query',
      ['Finde die main-Referenz', 'Find the main reference'],
      [
        'Ersetze v1.0.0 durch main. HEAD → main und origin/main stehen hier am neuesten Commit, deshalb gibt es einen passenden Commit.',
        'Replace v1.0.0 with main. HEAD → main and origin/main label the newest commit here, so one commit matches.',
      ],
      query,
      { prepare: seed('refs', pair('v1.0.0'), 1), completion: value(query, 'main', 'refs', 'main', 1) },
    ),
    s(
      'all-scope',
      ['Verbinde die Felder wieder mit Alles', 'Combine the fields again with All'],
      [
        'Wähle Alles. main passt weiterhin über die Referenzen. Jeder Commit zählt als ein Treffer, auch wenn mehrere seiner Felder zum Suchtext passen.',
        'Choose All. main still matches through references. Each commit counts as one match even when several of its fields match the query.',
      ],
      scope,
      { prepare: seed('refs', pair('main'), 1), completion: value(scope, 'all', 'all', 'main', 1) },
    ),
    s(
      'clear',
      ['Beende die Suche durch Leeren des Feldes', 'End search by clearing the field'],
      [
        'Entferne main vollständig. Die Trefferanzeige und Hervorhebungen sollen verschwinden.',
        'Remove main completely. The match indicator and highlights should disappear.',
      ],
      query,
      { prepare: seed('all', pair('main'), 1), completion: value(query, '', 'all', '', 0) },
    ),
    s(
      'open-inspector',
      ['Öffne den rechten Inspector wieder', 'Reopen the right inspector'],
      [
        'Klicke die Panel-Schaltfläche erneut. So kannst du nach der Suche wieder Commit-Details, Dateien oder Staging nebeneinander betrachten.',
        'Click the panel button again. After searching, this lets you view commit details, files or staging alongside the graph again.',
      ],
      c('inspector-toggle'),
      { prepare: seed(), completion: element(`${c('inspector-toggle')}[aria-expanded="true"]`) },
    ),
    s(
      'finish',
      ['Suchumfang und Treffer-Navigation gezielt verwenden', 'Use search scope and match navigation deliberately'],
      [
        'Du hast alle fünf Suchumfänge, Groß-/Kleinschreibung, Trefferwechsel, Umlauf und leere Ergebnisse ausprobiert. Für die frühere Änderung eines Datei-Inhalts folgt eine eigene Lektion zur forensischen Historie.',
        'You tried all five search scopes, case handling, match navigation, wraparound and empty results. A separate forensic-history lesson will investigate earlier changes to file contents.',
      ],
      '[data-tutorial="graph"]',
      { prepare: seed('all', ['', ''], 0, { inspector: true }) },
    ),
  ],
};
