import type { TutorialChapter } from './types';
import { branchRow } from './branchLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileControl } from './fileLessonHelpers';
import {
  mergeStep as s,
  mergeRecipe as seed,
  mergeControl as c,
  mergeMore,
  mergeOpen,
  mergeSource,
  mergeHead,
  mergeDialog,
  mergeContext,
  mergeConfirm,
  element,
  value,
} from './mergeLessonHelpers';
const result = (options: Parameters<typeof seed>[0] = {}) => seed({ stage: 'result', mode: 'noFf', ...options });
export const TUTORIAL_MERGE_COMMIT: TutorialChapter = {
  id: 'merge-commit',
  section: 'repo',
  title: ['Merge-Commit: die Zusammenführung im Verlauf bewahren', 'Merge commit: record the join in history'],
  description: [
    'Erzeuge bewusst einen zusätzlichen Commit. Prüfe die zwei Vorgänger, den erhaltenen Quellbranch und den tatsächlichen Diff gegen den bisherigen Zielstand.',
    'Deliberately create an additional commit. Check its two parents, the retained source branch and the actual diff against the old target revision.',
  ],
  question: ['Wie erzwinge und überprüfe ich einen Merge-Commit?', 'How do I force and inspect a merge commit?'],
  keywords: 'merge commit no ff noFf zwei eltern vorgänger graph vergleich zusammenführung',
  steps: [
    s(
      'overview',
      ['Dieselbe lineare Übernahme mit zusätzlichem Merge-Commit', 'The same linear changes with an additional merge commit'],
      [
        'main steht wieder einen Commit hinter feature/begruessung. Diesmal wählen wir Mit Merge-Commit. So wird die tatsächliche Zusammenführung als eigener Commit gespeichert, obwohl Vorziehen möglich wäre.',
        'main is again one commit behind feature/begruessung. This time we choose Create a merge commit. The actual join is recorded as its own commit even though a fast-forward would be possible.',
      ],
      '[data-tutorial="graph"]',
      { continue: false, prepare: seed() },
    ),
    s(
      'before',
      ['Das Ziel beginnt am älteren Commit', 'The target starts at the older commit'],
      [
        'main und HEAD stehen hier. Dieser Commit wird der erste Vorgänger des neuen Merge-Commits; der Quellen-Commit wird sein zweiter.',
        'main and HEAD point here. This commit will be the first parent of the new merge commit; the source commit will be its second.',
      ],
      mergeHead(3),
      { prepare: seed() },
    ),
    s(
      'more',
      ['Öffne weitere Aktionen', 'Open more actions'],
      ['Öffne das Dreipunktmenü in der oberen Leiste.', 'Open the three-dot menu in the top bar.'],
      mergeMore,
      { prepare: seed(), completion: element(mergeOpen) },
    ),
    s(
      'open',
      ['Öffne Zusammenführen', 'Open Merge'],
      ['Öffne die Auswahl für Richtung, Quelle und Verfahren.', 'Open the picker for direction, source and behavior.'],
      mergeOpen,
      { prepare: seed({ stage: 'more' }), completion: element(c('source')) },
    ),
    s(
      'source',
      ['Wähle feature/begruessung', 'Choose feature/begruessung'],
      [
        'Lass In aktuellen Branch aktiv. Wähle den neueren Beispielbranch als Quelle für main.',
        'Keep Into current branch selected. Choose the newer sample branch as the source for main.',
      ],
      c('source'),
      { prepare: seed({ stage: 'menu' }), completion: value(c('source'), mergeSource) },
    ),
    s(
      'mode',
      ['Wähle Mit Merge-Commit', 'Choose Create a merge commit'],
      ['Wähle Mit Merge-Commit, um einen eigenen Zusammenführungspunkt zu speichern.', 'Choose Create a merge commit to record a dedicated joining point.'],
      c('mode'),
      { prepare: seed({ stage: 'menu', selected: true }), completion: value(c('mode'), 'noFf') },
    ),
    s(
      'behavior',
      ['Der Verlauf erhält einen eigenen Verbindungspunkt', 'History gains a dedicated joining point'],
      [
        'Der neue Commit speichert den übernommenen Dateistand und beide Vorgänger. Die vorhandenen Commits werden nicht umgeschrieben.',
        'The new commit saves the merged file revision and both parents. Existing commits are not rewritten.',
      ],
      c('behavior'),
      { prepare: seed({ stage: 'menu', selected: true, mode: 'noFf' }) },
    ),
    s(
      'review',
      ['Öffne die abschließende Prüfung', 'Open the final review'],
      ['Klicke Weiter · Merge prüfen. Noch wurde kein Commit erstellt.', 'Click Continue · review merge. No commit has been created yet.'],
      c('review'),
      { prepare: seed({ stage: 'menu', selected: true, mode: 'noFf' }), completion: element(mergeDialog) },
    ),
    s(
      'source-review',
      ['Die Quelle liefert den zweiten Vorgänger', 'The source provides the second parent'],
      ['feature/begruessung bleibt unverändert am bisherigen Quellen-Commit stehen.', 'feature/begruessung stays unchanged on its existing source commit.'],
      mergeContext(1),
      { prepare: seed({ stage: 'review', mode: 'noFf' }) },
    ),
    s(
      'target-review',
      ['main erhält den neuen Merge-Commit', 'main receives the new merge commit'],
      ['Der Zielbranch main bleibt aktiv und wird auf den neu erzeugten Commit verschoben.', 'Target main stays active and moves to the newly created commit.'],
      mergeContext(2),
      { prepare: seed({ stage: 'review', mode: 'noFf' }) },
    ),
    s(
      'mode-review',
      ['Prüfe das erzwungene Verfahren', 'Check the forced behavior'],
      [
        'Hier muss Mit Merge-Commit stehen. Du kannst die Bestätigung weiterhin abbrechen, falls Quelle, Ziel oder Wirkung nicht stimmen.',
        'This must show Create a merge commit. You can still cancel if the source, target or behavior is wrong.',
      ],
      mergeContext(3),
      { prepare: seed({ stage: 'review', mode: 'noFf' }) },
    ),
    s(
      'confirm',
      ['Erstelle die Zusammenführung', 'Create the merge'],
      [
        'Bestätige Zusammenführen. Die App erzeugt den zusätzlichen lokalen Commit mit dem vorbereiteten Dateistand.',
        'Confirm Merge. The app creates the additional local commit with the prepared file revision.',
      ],
      mergeConfirm,
      { prepare: seed({ stage: 'review', mode: 'noFf' }), completion: element(mergeHead(5)) },
    ),
    s(
      'new-commit',
      ['Es gibt jetzt einen fünften Commit', 'There is now a fifth commit'],
      [
        'Der neue Merge-Commit trägt HEAD und main. Seine automatisch erzeugte Nachricht beschreibt die Zusammenführung. Die vier bisherigen Commits bleiben erhalten.',
        'The new merge commit carries HEAD and main. Its generated message describes the join. The four previous commits remain.',
      ],
      mergeHead(5),
      { prepare: result() },
    ),
    s(
      'parents',
      ['Zwei Verbindungen bewahren beide Ausgangspunkte', 'Two connections retain both starting points'],
      [
        'Der erste Vorgänger ist der bisherige Zielstand, der zweite der übernommene Quellenstand. Der Graph zeigt deshalb einen eigenen Zusammenführungspunkt; das unterscheidet diesen Commit vom Fast-forward.',
        'The first parent is the old target revision and the second is the merged source revision. The graph therefore has a dedicated joining point, unlike a fast-forward.',
      ],
      graphRow(5),
      { prepare: result() },
    ),
    s(
      'source-kept',
      ['Der Quellen-Commit bleibt erreichbar', 'The source commit remains reachable'],
      [
        'feature/begruessung steht weiterhin am Quellen-Commit. Beide Vorgänger gehören nun zur Geschichte von main, auch wenn du später den Quellbranch entfernst.',
        'feature/begruessung still points to the source commit. Both parents now belong to main history, even if you later remove the source branch.',
      ],
      graphRow(4),
      { prepare: result() },
    ),
    s(
      'select-commit',
      ['Wähle den neuen Merge-Commit', 'Select the new merge commit'],
      [
        'Wähle die neue Zeile im Graphen, um Beschreibung und geänderte Dateien zu prüfen.',
        'Select the new graph row to inspect its description and changed files.',
      ],
      graphRow(5),
      { prepare: result(), completion: element(commitPanel(5)) },
    ),
    s(
      'comparison',
      ['Die Dateiliste vergleicht mit dem ersten Vorgänger', 'The file list compares against the first parent'],
      [
        'Die Dateien zeigen hier, was gegenüber dem bisherigen main übernommen wurde. Der zweite Vorgänger ist ebenfalls gespeichert; er ist nicht automatisch die Vergleichsbasis dieser Liste.',
        'The files here show what was taken relative to the previous main. The second parent is also saved; it is not automatically the comparison base for this list.',
      ],
      commitPanel(5),
      { prepare: result({ commit: true }) },
    ),
    s(
      'open-diff',
      ['Öffne die README-Änderung', 'Open the README change'],
      [
        'Wähle README.md in der Commit-Dateiliste. Der Diff soll die Änderung gegenüber dem bisherigen Zielstand zeigen.',
        'Choose README.md in the commit file list. Its diff should show the change against the old target revision.',
      ],
      commitPanel(5) + ' ' + commitFile(),
      { prepare: result({ commit: true }), completion: element(historyViewer(5)) },
    ),
    s(
      'read-diff',
      ['Rot ist der alte Zieltext, Grün der übernommene Text', 'Red is the old target text and green is the merged text'],
      [
        'Die entfernten und hinzugefügten Zeilen stammen aus tatsächlich gespeicherten Beispielständen. Ein Merge-Commit bewahrt neben diesen Inhalten auch die zweite Vorgängerbeziehung.',
        'The removed and added lines come from actual saved sample revisions. Besides these contents, a merge commit also records its second parent relationship.',
      ],
      historyViewer(5) + ' .file-viewer-diff',
      { prepare: result({ file: 'commit' }) },
    ),
    s(
      'close-diff',
      ['Schließe den Diff wieder', 'Close the diff again'],
      ['Schließe die Dateiansicht, um zur Commit-Übersicht zurückzukehren.', 'Close the file viewer to return to the commit overview.'],
      fileControl('close-file'),
      { prepare: result({ file: 'commit' }), completion: { kind: 'absent', selector: historyViewer(5) } },
    ),
    s(
      'retained',
      ['Quelle und Ziel sind weiterhin getrennte Branches', 'Source and target remain separate branches'],
      [
        'main ist aktiv am neuen Commit, feature/begruessung bleibt am bisherigen Quellenstand. Es wurde nichts hochgeladen.',
        'main is active on the new commit, while feature/begruessung remains at the old source revision. Nothing was uploaded.',
      ],
      branchRow(mergeSource, false),
      { prepare: result() },
    ),
    s(
      'finish',
      ['Die Zusammenführung ist jetzt Teil der Geschichte', 'The join is now part of history'],
      [
        'Du hast bewusst einen Merge-Commit erzeugt und seinen Datei-Diff geprüft. Die Squash-Lektion zeigt dagegen vorgemerkte Änderungen und einen anschließend selbst erstellten Commit mit nur einem Vorgänger.',
        'You deliberately created a merge commit and checked its file diff. The squash lesson instead shows staged changes and a subsequent commit you create with only one parent.',
      ],
      '[data-tutorial="graph"]',
      { prepare: result() },
    ),
  ],
};
