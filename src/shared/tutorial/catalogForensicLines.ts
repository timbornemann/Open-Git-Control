import type { TutorialChapter } from './types';
import {
  s,
  lineHistoryRecipe as seed,
  lineHistoryState as state,
  lineHistoryValue as value,
  invalidLineAttempt,
  forensicRecipe,
  result,
  c,
  element,
  viewer,
} from './lineHistoryLessonHelpers';
import { commitSearchRecipe } from './commitSearchLessonHelpers';
const start = c('forensic-start'),
  end = c('forensic-end'),
  run = c('forensic-run');
const greeting = { start: '3', end: '3' };
const full = { start: '1', end: '4' };
const reversed = { start: '2', end: '1' };
const source = { path: 'src/app.ts', start: '1', end: '1' };
export const TUTORIAL_FORENSIC_LINES: TutorialChapter = {
  id: 'history-forensic-lines',
  section: 'repo',
  title: ['Die Geschichte eines heutigen Zeilenbereichs verfolgen', 'Trace the history of a current line range'],
  description: [
    'Git -L, Start/Ende, verschobene historische Bereiche, Blame-Unterschiede und ungültige Zeilenangaben praktisch prüfen.',
    'Explore Git -L, start/end positions, shifting historical ranges, differences from Blame and invalid line input.',
  ],
  question: ['Wie verfolge ich die früheren Änderungen bestimmter Zeilen?', 'How do I trace earlier changes to particular lines?'],
  keywords: 'forensic lines zeilenbereich line range git -L start end ende history zeilennummern blame invalid ungültig',
  steps: [
    s(
      'overview',
      ['Zeilenhistorie verfolgt einen Bereich rückwärts', 'Line history follows a range backward'],
      [
        'Blame nennt die letzte Änderung einer heutigen Zeile. Die Zeilenhistorie untersucht auch ihre früheren Änderungen. Ausgangspunkt sind Zeilennummern im aktuellen gespeicherten Commit; historische Positionen können davon abweichen.',
        'Blame identifies a current line’s last change. Line history also investigates its earlier changes. It starts from line numbers in the current saved commit; historical positions can differ.',
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
      ['Wähle den Zeilenbereichsmodus', 'Choose Line range mode'],
      [
        'Wähle Zeilenbereich als Suchtyp. Das Suchtextfeld wird durch Start- und Endzeile ersetzt.',
        'Choose Line range as the search type. Start and end line fields replace the search text field.',
      ],
      c('forensic-kind'),
      {
        prepare: forensicRecipe({ path: '', term: ['', ''] }),
        completion: { kind: 'all', conditions: [{ kind: 'value', selector: c('forensic-kind'), value: ['line', 'line'] }, element(start)] },
      },
    ),
    s(
      'path',
      ['Gib README.md an', 'Enter README.md'],
      [
        'Trage README.md als relativen Dateipfad ein. Wir beziehen den Bereich auf den letzten gespeicherten Commit dieser Datei.',
        'Enter README.md as the relative file path. The range refers to this file in the latest saved commit.',
      ],
      c('forensic-path'),
      { prepare: seed({ path: '' }), completion: value(c('forensic-path'), 'README.md') },
    ),
    s(
      'start',
      ['Start zählt ab eins', 'Start counts from one'],
      [
        'Die Voreinstellung 1 bezeichnet die Überschrift. Git zählt Dateizeilen ab eins. Die Arbeitsdatei oder ein Editorentwurf ersetzt nicht den gespeicherten Ausgangsstand dieser Suche.',
        'The default 1 identifies the heading. Git counts file lines from one. The working file or an editor draft does not replace this search’s saved starting state.',
      ],
      start,
      { prepare: seed() },
    ),
    s(
      'end',
      ['Das Ende gehört noch zum Bereich', 'The end line is included'],
      [
        'Start 1 und Ende 1 wählen genau die Überschrift. Für mehrere Zeilen ist auch die Endzeile eingeschlossen.',
        'Start 1 and end 1 select just the heading. For a larger range, the end line is included too.',
      ],
      end,
      { prepare: seed() },
    ),
    s(
      'run-heading',
      ['Verfolge die Überschrift bis zu ihrer Anlage', 'Trace the heading back to its creation'],
      [
        'Starte die Suche. Nur der erste Commit soll erscheinen, weil die Überschrift später unverändert blieb.',
        'Run search. Only the first commit should appear because the heading stayed unchanged afterward.',
      ],
      run,
      { prepare: seed(), completion: element(state(1)) },
    ),
    s(
      'heading-result',
      ['Unveränderte Zeilen überspringen spätere Commits', 'Unchanged lines skip later commits'],
      [
        'Die gesamte README wurde mehrfach überarbeitet. Der ausgewählte Bereich mit der Überschrift war davon nicht betroffen und führt nur zum ersten Commit.',
        'The whole README changed several times. The selected heading range was unaffected and leads only to the first commit.',
      ],
      result(1),
      { prepare: seed({ run: 1 }) },
    ),
    s(
      'greeting-start',
      ['Wähle jetzt die dritte Zeile', 'Now select the third line'],
      [
        'Setze Start auf 3. Dort steht heute die Begrüßung. Das alte Ergebnis verschwindet sofort. Ändere danach auch das Ende, bevor du suchst.',
        'Set Start to 3. That is today’s greeting. The old result disappears immediately. Change the end as well before searching.',
      ],
      start,
      { prepare: seed({ run: 1 }), completion: value(start, '3') },
    ),
    s(
      'greeting-end',
      ['Begrenze den Bereich auf diese eine Zeile', 'Limit the range to this one line'],
      ['Setze Ende ebenfalls auf 3. Damit ist der Bereich 3–3 gültig.', 'Set End to 3 too. The range 3–3 is now valid.'],
      end,
      { prepare: seed({ start: '3' }), completion: value(end, '3') },
    ),
    s(
      'run-greeting',
      ['Untersuche die Vorgeschichte der Begrüßungszeile', 'Inspect the greeting line’s past'],
      ['Starte die Suche. Es sollen drei frühere Änderungen erscheinen.', 'Run search. Three earlier changes should appear.'],
      run,
      { prepare: seed(greeting), completion: element(state(3)) },
    ),
    s(
      'earlier-versions',
      ['Die Historie geht weiter als der letzte Blame-Ursprung', 'History reaches beyond the last Blame origin'],
      [
        'Blame ordnet die heutige Begrüßung dem vierten Commit zu. Git -L verfolgt den betroffenen Bereich weiter: über die frühere Projektübersicht bis zur ersten kurzen Beschreibung im zweiten Commit.',
        'Blame attributes today’s greeting to the fourth commit. Git -L follows the affected range further: through the earlier project overview back to the first short description in the second commit.',
      ],
      result(3),
      { prepare: seed({ ...greeting, run: 3 }) },
    ),
    s(
      'open-earlier',
      ['Öffne einen früheren Vergleich', 'Open an earlier comparison'],
      [
        'Klicke Diff beim Dokumentations-Commit. Du liest den damaligen Datei-Vergleich; die heutige Zeilennummer 3 muss darin nicht denselben Text enthalten.',
        'Click Diff for the documentation commit. You are reading that time’s file comparison; today’s line number 3 need not contain the same text there.',
      ],
      `${result(3)} ${c('forensic-diff')}`,
      { prepare: seed({ ...greeting, run: 3 }), completion: element(`${viewer(3)} .file-viewer-diff .add .diff-code`) },
    ),
    s(
      'historical-content',
      ['Frühere Inhalte und Positionen können anders aussehen', 'Earlier contents and positions can differ'],
      [
        'Dieser Commit führt die Projektübersicht ein. Die Ergebnisaktion öffnet den Datei-Diff dieses Commits. Sie setzt die Arbeitsdatei nicht zurück und erzeugt keinen neuen Commit.',
        'This commit introduces the project overview. The result action opens that commit’s file diff. It does not reset the working file or create a new commit.',
      ],
      '.file-viewer-diff .add .diff-code',
      { prepare: seed({ ...greeting, run: 3, diff: 3 }) },
    ),
    s(
      'close-diff',
      ['Kehre zur Bereichssuche zurück', 'Return to range search'],
      ['Schließe den Viewer. Die Bereichsangaben und drei Treffer bleiben erhalten.', 'Close the viewer. The range and three matches remain available.'],
      c('close-file'),
      { prepare: seed({ ...greeting, run: 3, diff: 3 }), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'full-start',
      ['Erweitere den Start wieder auf die Überschrift', 'Extend the start back to the heading'],
      [
        'Setze Start auf 1. Das alte Ergebnis wird verworfen; die neue Anfrage startet erst mit der Suchschaltfläche.',
        'Set Start to 1. The old results are discarded; the new query only runs when you press Search.',
      ],
      start,
      { prepare: seed({ ...greeting, run: 3 }), completion: value(start, '1') },
    ),
    s(
      'full-end',
      ['Nimm auch den Status in den Bereich auf', 'Include the status in the range'],
      [
        'Setze Ende auf 4. README hat hier vier Git-Zeilen: Überschrift, Leerzeile, Begrüßung und Status. Der abschließende Zeilenumbruch erzeugt keine fünfte Git-Dateizeile.',
        'Set End to 4. README has four Git file lines here: heading, blank line, greeting and status. The final newline does not create a fifth Git file line.',
      ],
      end,
      { prepare: seed({ start: '1', end: '3' }), completion: value(end, '4') },
    ),
    s(
      'run-full',
      ['Verfolge den gesamten heutigen Dateibereich', 'Trace the whole current file range'],
      [
        'Starte die Suche. Der Bereich 1–4 reicht nun bis zum ersten Commit zurück und umfasst alle vier Änderungen.',
        'Run search. The range 1–4 now reaches back to the first commit and includes all four changes.',
      ],
      run,
      { prepare: seed(full), completion: element(state(4)) },
    ),
    s(
      'reversed-start',
      ['Bereite bewusst eine ungültige Reihenfolge vor', 'Prepare an invalid order deliberately'],
      [
        'Setze Start auf 2. Im nächsten Schritt setzen wir das Ende davor, um die Eingabeprüfung auszuprobieren.',
        'Set Start to 2. Next we will put the end before it to try input validation.',
      ],
      start,
      { prepare: seed({ ...full, run: 4 }), completion: value(start, '2') },
    ),
    s(
      'reversed-end',
      ['Setze das Ende vor den Start', 'Put the end before the start'],
      [
        'Setze Ende auf 1. Ein Bereich 2–1 ist ungültig und darf keine neue Suchanfrage starten.',
        'Set End to 1. The range 2–1 is invalid and must not issue a new search request.',
      ],
      end,
      { prepare: seed({ start: '2', end: '4' }), completion: value(end, '1') },
    ),
    s(
      'run-invalid',
      ['Prüfe die Rückmeldung für 2–1', 'Check feedback for 2–1'],
      [
        'Klicke die Suchschaltfläche. Eine Fehlermeldung soll die ungültige Reihenfolge erklären. Danach kannst du die Werte direkt korrigieren.',
        'Click Search. An error should explain the invalid range order. You can then correct the values directly.',
      ],
      run,
      { prepare: seed(reversed), completion: invalidLineAttempt },
    ),
    s(
      'correct-start',
      ['Korrigiere den Start', 'Correct the start'],
      [
        'Setze Start wieder auf 1. Ende steht bereits auf 1; damit ist die Überschrift erneut gültig ausgewählt.',
        'Set Start back to 1. End is already 1, so the heading is validly selected again.',
      ],
      start,
      { prepare: seed(reversed), completion: value(start, '1') },
    ),
    s(
      'retry',
      ['Suche mit den korrigierten Werten', 'Search with the corrected values'],
      [
        'Starte erneut. Der erste Commit soll wieder als einziger Treffer erscheinen; der Fehler hat keine Daten verändert.',
        'Run search again. The first commit should again be the only match; the error changed no data.',
      ],
      run,
      { prepare: seed(), completion: element(state(1)) },
    ),
    s(
      'source-path',
      ['Untersuche die Quelltextzeile', 'Inspect the source line'],
      [
        'Wechsle den Pfad zu src/app.ts. Die Bereiche bleiben 1–1; im Quelltext ist das die Begrüßungsdeklaration.',
        'Change the path to src/app.ts. The range remains 1–1; in the source this is the greeting declaration.',
      ],
      c('forensic-path'),
      { prepare: seed({ run: 1 }), completion: value(c('forensic-path'), 'src/app.ts') },
    ),
    s(
      'run-source',
      ['Verfolge beide Änderungen an dieser Quelltextzeile', 'Trace both changes to this source line'],
      [
        'Starte die Suche. Die App-Anlage und die spätere Änderung zu Hallo Welt! sollen erscheinen. Hier verändert sich die Zeile, obwohl der Teiltext Hallo weiterhin genau einmal vorkommt.',
        'Run search. Adding the app and later changing it to Hallo Welt! should appear. The line changes here even though the substring Hallo still occurs exactly once.',
      ],
      run,
      { prepare: seed(source), completion: element(state(2)) },
    ),
    s(
      'fraction',
      ['Probiere eine gebrochene Zeilenangabe', 'Try a fractional line position'],
      [
        'Setze Start auf 1.5. Zeilenpositionen sind ganze Zahlen; die Anwendung soll diese Angabe vor einem Git-Aufruf abweisen.',
        'Set Start to 1.5. Line positions are whole numbers; the app should reject this input before invoking Git.',
      ],
      start,
      { prepare: seed({ ...source, run: 2 }), completion: value(start, '1.5') },
    ),
    s(
      'run-fraction',
      ['Prüfe die Ganzzahl-Eingabeprüfung', 'Check whole-number validation'],
      ['Starte die Suche. Du sollst dieselbe verständliche Bereichsfehlermeldung erhalten.', 'Run search. You should receive the same clear line-range error.'],
      run,
      { prepare: seed({ ...source, start: '1.5' }), completion: invalidLineAttempt },
    ),
    s(
      'correct-fraction',
      ['Stelle die gültige Zeile wieder her', 'Restore a valid line'],
      ['Setze Start auf 1 zurück. Die Eingabefelder bleiben nach einem Fehler bedienbar.', 'Set Start back to 1. The fields remain usable after an error.'],
      start,
      { prepare: seed({ ...source, start: '1.5' }), completion: value(start, '1') },
    ),
    s(
      'retry-source',
      ['Prüfe den erfolgreichen Wiederholungsversuch', 'Check the successful retry'],
      [
        'Suche erneut nach 1–1 in src/app.ts. Die beiden Quelltextänderungen sollen wieder erscheinen.',
        'Search again for 1–1 in src/app.ts. Both source changes should appear again.',
      ],
      run,
      { prepare: seed(source), completion: element(state(2)) },
    ),
    s(
      'return',
      ['Kehre zur Commit-Suche zurück', 'Return to commit search'],
      ['Wähle Commit-Suche im Modusfeld.', 'Choose Commit search in the mode field.'],
      c('forensic-view'),
      {
        prepare: seed({ ...source, run: 2 }),
        completion: {
          kind: 'all',
          conditions: [element(c('commit-search-query')), { kind: 'value', selector: c('forensic-view'), value: ['commits', 'commits'] }],
        },
      },
    ),
    s(
      'finish',
      ['Ausgangspunkt, Bereich und frühere Änderungen unterscheiden', 'Distinguish the starting state, range and earlier changes'],
      [
        'Du hast Zeilenbereiche im gespeicherten Commit untersucht, ihre frühere Geschichte geöffnet und ungültige Angaben korrigiert. Blame, wörtliche Anzahl-Suche und Zeilenhistorie beantworten unterschiedliche Fragen.',
        'You investigated line ranges in the saved commit, opened their earlier history and corrected invalid input. Blame, literal count search and line history answer different questions.',
      ],
      '[data-tutorial="graph"]',
      { prepare: commitSearchRecipe() },
    ),
  ],
};
