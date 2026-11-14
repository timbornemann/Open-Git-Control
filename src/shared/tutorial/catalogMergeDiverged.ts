import { withTextViewSteps } from './fileTextViewSteps';
import type { TutorialChapter } from './types';
import {
  mergeStep as s,
  mergeRecipe,
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
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileControl, fileRow } from './fileLessonHelpers';
const seed = (options: Parameters<typeof mergeRecipe>[0] = {}) => mergeRecipe({ diverged: true, ...options });
const result = (options: Parameters<typeof mergeRecipe>[0] = {}) => seed({ stage: 'result', ...options });
export const TUTORIAL_MERGE_DIVERGED: TutorialChapter = {
  id: 'merge-diverged',
  section: 'repo',
  title: ['Auseinanderentwickelte Branches ohne Konflikt zusammenführen', 'Merge diverged branches without a conflict'],
  description: [
    'Vergleiche zwei eigene Entwicklungsstände mit ihrer gemeinsamen Basis. Führe unabhängige Änderungen zusammen und prüfe, dass beide Inhalte im Ergebnis erhalten bleiben.',
    'Compare two independent revisions with their common base. Merge their independent edits and check that both contents survive in the result.',
  ],
  question: [
    'Wie funktioniert ein normaler Merge, wenn beide Branches eigene Commits haben?',
    'How does a normal merge work when both branches have their own commits?',
  ],
  keywords: 'merge auseinanderentwickelt diverged drei wege three way standard normal basis konflikt unabhängig dateien',
  steps: [
    s(
      'overview',
      ['Diesmal liegen beide Branches vor ihrer gemeinsamen Basis', 'This time both branches are ahead of their common base'],
      [
        'main hat die Begrüßung geändert. feature/begruessung hat unabhängig davon einen Projekthinweis in LICENSE ergänzt. Keiner der beiden Branches enthält den anderen vollständig; ein Fast-forward allein reicht deshalb nicht.',
        'main changed the greeting. feature/begruessung independently added a project note to LICENSE. Neither branch fully contains the other, so a fast-forward alone is insufficient.',
      ],
      '[data-tutorial="graph"]',
      { continue: false, prepare: seed() },
    ),
    s(
      'target',
      ['main bewahrt seine eigene Begrüßungsänderung', 'main retains its own greeting change'],
      [
        'HEAD steht am vierten Commit auf main. Die README enthält dort bereits Hallo Welt. Diese Änderung soll beim Zusammenführen bestehen bleiben.',
        'HEAD is at the fourth commit on main. README already contains Hello world there. This change should survive the merge.',
      ],
      mergeHead(4),
      { prepare: seed() },
    ),
    s(
      'source-before',
      ['Die Quelle besitzt einen eigenen fünften Commit', 'The source has its own fifth commit'],
      [
        'Der Quellen-Commit ergänzt einen Projekthinweis in LICENSE. Seine README entspricht noch der gemeinsamen Basis. Ein Merge übernimmt deshalb nicht pauschal alle älteren Quelldateien über main.',
        'The source commit adds a project note to LICENSE. Its README still matches the common base. A merge therefore does not simply replace main with every older source file.',
      ],
      graphRow(5),
      { prepare: seed() },
    ),
    s(
      'base',
      ['Die gemeinsame Basis ermöglicht den Vergleich beider Änderungen', 'The common base lets Git compare both sets of edits'],
      [
        'Beide Linien gehen von diesem dritten Commit aus. Git vergleicht Basis, Ziel und Quelle. Die Änderungen an README und LICENSE liegen hier in verschiedenen Dateien und lassen sich automatisch verbinden.',
        'Both lines start from this third commit. Git compares base, target and source. The README and LICENSE edits here affect different files and can be combined automatically.',
      ],
      graphRow(3),
      { prepare: seed() },
    ),
    s(
      'more',
      ['Öffne die weiteren Repository-Aktionen', 'Open more repository actions'],
      ['Öffne das Dreipunktmenü in der oberen Leiste.', 'Open the three-dot menu in the top bar.'],
      mergeMore,
      { prepare: seed(), completion: element(mergeOpen) },
    ),
    s(
      'open',
      ['Öffne Zusammenführen', 'Open Merge'],
      ['Öffne das Formular für Quelle, Ziel und Verfahren.', 'Open the form for source, target and behavior.'],
      mergeOpen,
      { prepare: seed({ stage: 'more' }), completion: element(c('source')) },
    ),
    s(
      'source',
      ['Wähle feature/begruessung als Quelle', 'Choose feature/begruessung as source'],
      [
        'Lass In aktuellen Branch aktiv und wähle feature/begruessung. main bleibt das Ziel und erhält das kombinierte Ergebnis.',
        'Keep Into current branch active and select feature/begruessung. main remains the target and will receive the combined result.',
      ],
      c('source'),
      { prepare: seed({ stage: 'menu' }), completion: value(c('source'), mergeSource) },
    ),
    s(
      'mode',
      ['Normal zusammenführen wählt hier einen Merge-Commit', 'Merge normally chooses a merge commit here'],
      [
        'Das Standardverfahren zieht bei einer geradlinigen Historie nur den Branch vor. Hier haben beide Seiten eigene Commits. Der normale Merge benötigt deshalb einen neuen Commit mit zwei Vorgängern.',
        'The default behavior only advances the branch for linear history. Here both sides have their own commits. A normal merge therefore needs a new commit with two parents.',
      ],
      c('mode'),
      { prepare: seed({ stage: 'menu', selected: true }) },
    ),
    s(
      'review',
      ['Öffne die abschließende Prüfung', 'Open the final review'],
      ['Prüfe die Zusammenführung vor der Schreibaktion.', 'Review the merge before writing.'],
      c('review'),
      { prepare: seed({ stage: 'menu', selected: true }), completion: element(mergeDialog) },
    ),
    s(
      'source-review',
      ['Die Quelle liefert den unabhängigen Projekthinweis', 'The source provides the independent project note'],
      ['feature/begruessung ist die eingehende Seite und bleibt als Branch erhalten.', 'feature/begruessung is the incoming side and is retained as a branch.'],
      mergeContext(1),
      { prepare: seed({ stage: 'review' }) },
    ),
    s(
      'target-review',
      ['main erhält den kombinierten Stand', 'main receives the combined revision'],
      [
        'main bleibt aktiv. Sein gespeicherter Stand wird erst durch die Bestätigung aktualisiert.',
        'main stays active. Its saved revision is updated only after confirmation.',
      ],
      mergeContext(2),
      { prepare: seed({ stage: 'review' }) },
    ),
    s(
      'mode-review',
      ['Das Verfahren bleibt Standard', 'The behavior remains Default'],
      [
        'Normal zusammenführen erzeugt hier wegen der auseinanderentwickelten Historie einen Merge-Commit. Wir haben keinen zusätzlichen Commit durch Mit Merge-Commit erzwungen.',
        'Merge normally creates a merge commit here because history diverged. We did not force an extra commit with Create a merge commit.',
      ],
      mergeContext(3),
      { prepare: seed({ stage: 'review' }) },
    ),
    s(
      'confirm',
      ['Verbinde die unabhängigen Änderungen', 'Combine the independent changes'],
      [
        'Bestätige Zusammenführen. Die App kombiniert die tatsächlichen Dateistände über ihre gemeinsame Basis.',
        'Confirm Merge. The app combines the actual file revisions through their common base.',
      ],
      mergeConfirm,
      { prepare: seed({ stage: 'review' }), completion: element(mergeHead(6)) },
    ),
    s(
      'parents',
      ['Der sechste Commit hat zwei verschiedene Vorgänger', 'The sixth commit has two distinct parents'],
      [
        'main und HEAD stehen nun am neuen Merge-Commit. Sein erster Vorgänger ist der bisherige main, sein zweiter der Quellen-Commit. Beide Entwicklungslinien bleiben im Verlauf nachvollziehbar.',
        'main and HEAD now point to the new merge commit. Its first parent is the old main and its second is the source commit. Both development lines remain traceable in history.',
      ],
      mergeHead(6),
      { prepare: result() },
    ),
    s(
      'source-kept',
      ['Der Quellbranch bleibt am fünften Commit', 'The source branch stays at the fifth commit'],
      ['Der Merge hat den Quellen-Commit weder umgeschrieben noch den Branch entfernt.', 'The merge neither rewrote the source commit nor removed the branch.'],
      graphRow(5),
      { prepare: result() },
    ),
    s(
      'select-commit',
      ['Wähle den neuen Merge-Commit', 'Select the new merge commit'],
      ['Öffne den Commit-Inspektor für das gespeicherte Ergebnis.', 'Open the commit inspector for the saved result.'],
      graphRow(6),
      { prepare: result(), completion: element(commitPanel(6)) },
    ),
    s(
      'comparison',
      ['Gegenüber main ist nur LICENSE neu verändert', 'Only LICENSE changed relative to main'],
      [
        'Die Liste vergleicht den Merge mit seinem ersten Vorgänger. Die eigene README-Änderung von main war dort schon vorhanden. Hinzugekommen ist deshalb nur der Projekthinweis aus dem Quellbranch.',
        'The list compares the merge against its first parent. main already had its own README change. Only the project note from the source branch was added relative to that revision.',
      ],
      commitPanel(6),
      { prepare: result({ commit: true }) },
    ),
    s(
      'open-diff',
      ['Öffne den LICENSE-Diff', 'Open the LICENSE diff'],
      ['Öffne LICENSE aus der Commit-Dateiliste.', 'Open LICENSE from the commit file list.'],
      commitPanel(6) + ' ' + commitFile('LICENSE'),
      { prepare: result({ commit: true }), completion: element(historyViewer(6, 'LICENSE')) },
    ),
    s(
      'read-diff',
      ['Der Projekthinweis wurde zur bestehenden Datei ergänzt', 'The project note was added to the existing file'],
      [
        'Grün zeigt den hinzugefügten Projekthinweis. Der bestehende Beispiel-Lizenztext bleibt erhalten. Es wurden nur die tatsächlichen Änderungen seit der Basis übernommen.',
        'Green shows the added project note. The existing sample license text remains. Only the actual changes since the base were merged.',
      ],
      historyViewer(6, 'LICENSE'),
      { prepare: result({ file: 'commit' }) },
    ),
    s(
      'close-diff',
      ['Schließe den gespeicherten Vergleich', 'Close the saved comparison'],
      ['Kehre zur Ergebnisübersicht zurück.', 'Return to the result overview.'],
      fileControl('close-file'),
      { prepare: result({ file: 'commit' }), completion: { kind: 'absent', selector: historyViewer(6, 'LICENSE') } },
    ),
    s(
      'open-tree',
      ['Prüfe auch die beibehaltene README im Arbeitsbaum', 'Also check the retained README in the working tree'],
      ['Wechsle zu Working Directory im Inspektor.', 'Switch the inspector to Working Directory.'],
      fileControl('open-files'),
      { prepare: result(), completion: element(fileControl('open-files') + '[aria-pressed="true"]') },
    ),
    s(
      'open-readme',
      ['Öffne README.md aus dem Dateibaum', 'Open README.md from the file tree'],
      ['Öffne die Datei, deren eigene main-Änderung erhalten bleiben sollte.', 'Open the file whose own main change should have been retained.'],
      fileRow('README.md'),
      { prepare: result({ file: 'tree', path: 'README.md' }), completion: element(historyViewer()) },
    ),
    s(
      'contents',
      ['Die eigene Welt-Begrüßung wurde beibehalten', 'The world greeting was retained'],
      [
        'Die README zeigt weiterhin Hallo Welt. Der alte README-Stand des Quellbranchs hat diese eigene Änderung von main nicht überschrieben. Beide unabhängigen Beiträge sind jetzt im Merge enthalten.',
        'README still shows Hello world. The source branch’s old README revision did not overwrite this own main change. Both independent contributions are now in the merge.',
      ],
      historyViewer(),
      { prepare: result({ file: 'work', path: 'README.md' }) },
    ),
    s(
      'close-file',
      ['Schließe die Inhaltsprüfung', 'Close the content check'],
      ['Kehre zum sauberen zusammengeführten Stand zurück.', 'Return to the clean merged revision.'],
      fileControl('close-file'),
      { prepare: result({ file: 'work', path: 'README.md' }), completion: { kind: 'absent', selector: historyViewer() } },
    ),
    s(
      'finish',
      ['Ein normaler Merge kann eigene Änderungen beider Seiten bewahren', 'A normal merge can retain independent changes from both sides'],
      [
        'Du hast gemeinsame Basis, beide Vorgänger, den hinzugekommenen Projekthinweis und die erhaltene README geprüft. Ein Konflikt entsteht erst, wenn die Änderungen nicht automatisch vereinbar sind. Weiter beendet diese Lektion.',
        'You checked the common base, both parents, the added project note and retained README. A conflict occurs when the edits cannot be combined automatically. Next finishes this lesson.',
      ],
      '[data-tutorial="graph"]',
      { prepare: result() },
    ),
  ].flatMap(withTextViewSteps({ 'open-readme': 'README.md' })),
};
