import type { TutorialChapter } from './types';
import {
  searchStep as s,
  searchRecipe as seed,
  searchSeed as p,
  searchState as state,
  searchResults as results,
  searchResult as result,
  searchReplace as replace,
  searchValue as value,
  searchAll as all,
  searchViewer as viewer,
  c,
  editor,
  element,
} from './searchLessonHelpers';
const replacement = c('file-search-replacement');
export const TUTORIAL_SEARCH_ONE: TutorialChapter = {
  id: 'search-one',
  section: 'repo',
  title: ['Genau eine Fundstelle ersetzen', 'Replace exactly one occurrence'],
  description: [
    'Such- und Ersatztext unterscheiden, eine einzelne Ergebnisaktion verwenden und Inhalt, Diff sowie erhaltenen Index kontrollieren.',
    'Distinguish query from replacement, use one result action and check contents, diff and preserved index.',
  ],
  question: ['Wie ersetze ich nur einen bestimmten Suchtreffer?', 'How do I replace one specific search match?'],
  keywords: 'ersetzen replace single einzeln fundstelle treffer zeile ziel target replacement ersatztext',
  steps: [
    s(
      'overview',
      ['Ersetzen verändert die gespeicherte Arbeitsdatei', 'Replacement changes the saved working file'],
      [
        'Wir ersetzen nur das planet am Anfang der dritten Zeile in guides/Planet.md durch world. Die anderen vier Treffer und die gespeicherten Git-Stände sollen erhalten bleiben.',
        'We will replace only planet at the start of line three in guides/Planet.md with world. The other four matches and saved Git versions must be preserved.',
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
      ['Wähle die Inhaltssuche', 'Choose content search'],
      ['Klicke File contents. Nur dieser Modus bietet das Ersetzen von Textstellen an.', 'Click File contents. Only this mode offers text replacement.'],
      c('file-search-contents'),
      { prepare: seed('base', { mode: 'filename', query: '' }), completion: element(c('file-search-replacement')) },
    ),
    s(
      'query',
      ['Suche zuerst die fünf Vorkommen', 'Find the five occurrences first'],
      [
        'Trage planet in das Suchfeld ein. Aa bleibt ausgeschaltet. Es sollen fünf Treffer in drei Dateien erscheinen.',
        'Enter planet in the query field. Keep Aa off. Five matches should appear across three files.',
      ],
      c('file-search-query'),
      { prepare: seed('base', { query: '' }), completion: value(c('file-search-query'), 'planet', 5) },
    ),
    s(
      'replacement-purpose',
      ['Ersatztext ist ein eigenes Feld', 'Replacement text has its own field'],
      [
        'Das zweite Feld enthält den Text, der eine Fundstelle ersetzen soll. Ein leeres Ersatzfeld würde den gefundenen Text entfernen. Die Eingabe allein ändert noch keine Datei.',
        'The second field contains the text that will replace a match. An empty replacement removes the matched text. Entering a value alone changes no file.',
      ],
      replacement,
      { prepare: seed() },
    ),
    s(
      'replacement',
      ['Trage world als Ersatz ein', 'Enter world as the replacement'],
      [
        'Trage world in Replace with ein. Der Suchtext bleibt planet und die fünf Treffer bleiben zunächst erhalten.',
        'Enter world in Replace with. Keep planet as the query; the five matches are preserved for now.',
      ],
      replacement,
      { prepare: seed(), completion: all(value(replacement, 'world'), state()) },
    ),
    s(
      'scope',
      ['Der kleine Ersetzen-Button gehört zu einer Fundstelle', 'The small Replace button belongs to one occurrence'],
      [
        'Dieser Button gehört zu guides/Planet.md bei 3:1. Er ersetzt genau diese Fundstelle. All würde dagegen alle passenden Vorkommen bearbeiten und öffnet einen zusätzlichen Dialog.',
        'This button belongs to guides/Planet.md at 3:1. It replaces exactly this occurrence. All would affect every matching occurrence and opens an additional dialog.',
      ],
      replace(),
      { prepare: seed('base', { replacement: 'world' }) },
    ),
    s(
      'replace',
      ['Ersetze nur die Fundstelle bei 3:1', 'Replace only the occurrence at 3:1'],
      [
        'Klicke den Ersetzen-Button rechts neben 3:1 in guides/Planet.md. Nur dort soll planet zu world werden. Die Trefferzahl soll von fünf auf vier sinken.',
        'Click the Replace button beside 3:1 in guides/Planet.md. Only there should planet become world. The match count should fall from five to four.',
      ],
      replace(),
      { prepare: seed('base', { replacement: 'world' }), completion: all(state('one'), element(results(4, 3))) },
    ),
    s(
      'result-count',
      ['Die ersetzte Fundstelle passt nicht mehr zu planet', 'The replaced occurrence no longer matches planet'],
      [
        'Vier Treffer bleiben in drei Dateien. Der Suchbestand wurde nach der Änderung neu eingelesen. Die Überschrift Planet und die vierte Zeile planet im Handbuch bleiben unverändert.',
        'Four matches remain across three files. Search refreshed after the change. The Planet heading and the fourth-line planet in the guide are unchanged.',
      ],
      c('file-search-summary'),
      { prepare: seed('one', { replacement: 'world' }) },
    ),
    s(
      'open-file',
      ['Öffne die geänderte Datei', 'Open the changed file'],
      [
        'Klicke die Gruppenüberschrift guides/Planet.md. Wir prüfen den gespeicherten Inhalt im normalen Datei-Viewer.',
        'Click the guides/Planet.md group header. We will inspect the saved contents in the normal file viewer.',
      ],
      `${result()} .working-search-result-group__file`,
      { prepare: seed('one', { replacement: 'world' }), completion: element(viewer) },
    ),
    s(
      'read',
      ['Nur die dritte Zeile enthält world', 'Only the third line contains world'],
      [
        'Die dritte Zeile lautet world: blau; darunter steht weiterhin planet: grün. Der Stern fehlt: Ersetzen hat die Arbeitsdatei bereits gespeichert und keinen ungespeicherten Editorentwurf angelegt.',
        'The third line says world: blue; planet: green is unchanged below. There is no asterisk: replacement already saved the working file and created no unsaved editor draft.',
      ],
      editor,
      { prepare: seed('one', { file: true }) },
    ),
    s(
      'diff',
      ['Prüfe den Unterschied zur Git-Basis', 'Check the difference from the Git base'],
      [
        'Wechsle im Viewer zu Diff. Der Vergleich soll genau die ausgetauschte Textzeile zeigen.',
        'Switch the viewer to Diff. The comparison should show exactly the replaced text line.',
      ],
      '.file-viewer [data-file-tab="diff"]',
      { prepare: seed('one', { file: true }), completion: element(`${viewer}[data-tab="diff"]`) },
    ),
    s(
      'read-diff',
      ['Rot und Grün zeigen die eine Ersetzung', 'Red and green show the one replacement'],
      [
        'Die alte planet-Zeile ist entfernt, die world-Zeile hinzugefügt. Die übrigen Zeilen liefern Kontext. Dieser Vergleich bestätigt den Inhalt, nicht einen bereits erstellten Commit.',
        'The old planet line is removed and the world line added. Other lines provide context. This comparison confirms contents rather than an already-created commit.',
      ],
      '.file-viewer-diff',
      { prepare: seed('one', { file: true, diff: true }) },
    ),
    s(
      'close',
      ['Schließe den Vergleich', 'Close the comparison'],
      [
        'Schließe den Viewer mit X. Die gespeicherte Ersetzung und die Suche bleiben erhalten.',
        'Close the viewer with X. The saved replacement and the search are preserved.',
      ],
      c('close-file'),
      { prepare: seed('one', { file: true, diff: true }), completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'open-staging',
      ['Prüfe den Git-Status', 'Check the Git status'],
      [
        'Wechsle zur Staging Area. Nur guides/Planet.md soll unter Änderungen stehen. Es wurde noch nichts vorgemerkt.',
        'Switch to Staging Area. Only guides/Planet.md should appear under Changes. Nothing has been staged.',
      ],
      c('open-staging'),
      { prepare: p('one'), completion: element(`${c('open-staging')}[aria-pressed="true"]`) },
    ),
    s(
      'index',
      ['Der Index enthält noch die ursprüngliche Zeile', 'The index still contains the original line'],
      [
        'Die Ersetzung hat nur die Arbeitsdatei geändert. Index und letzter Commit enthalten noch planet: blau. Du kannst die Änderung wie gewohnt prüfen, vormerken oder verwerfen.',
        'Replacement changed only the working file. The index and last commit still contain planet: blue. You can inspect, stage or discard the change normally.',
      ],
      c('unstaged-files'),
      { openView: undefined, inspector: 'staging', prepare: p('one') },
    ),
    s(
      'finish',
      ['Einzelnes Ersetzen ist eine gezielte Dateiänderung', 'Single replacement is a targeted file change'],
      [
        'Du hast Such- und Ersatztext getrennt eingegeben, eine Fundstelle ersetzt und Inhalt, Diff und Git-Status geprüft. Die nächste Lektion erklärt den größeren Umfang von All.',
        'You entered query and replacement separately, replaced one occurrence and checked contents, diff and Git status. The next lesson explains the broader scope of All.',
      ],
      c('staging'),
      { openView: undefined, inspector: 'staging', prepare: p('one') },
    ),
  ],
};
