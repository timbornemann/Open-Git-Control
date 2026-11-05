import type { TutorialChapter } from './types';
import { branchRow } from './branchLessonHelpers';
import { graphRow, historyViewer } from './historyLessonHelpers';
import { fileControl, fileRow, fileTab } from './fileLessonHelpers';
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
export const TUTORIAL_MERGE_FAST_FORWARD: TutorialChapter = {
  id: 'merge-fast-forward',
  section: 'repo',
  title: ['Fast-forward: einen Branch sicher vorziehen', 'Fast-forward: safely advance a branch'],
  description: [
    'Übernimm den linearen Beispielstand mit Nur Fast-forward. Prüfe Ziel, erhaltene Quelle, Commit-Anzahl und die aktualisierte Arbeitsdatei.',
    'Take the linear sample revision with Fast-forward only. Check the target, retained source, commit count and updated working file.',
  ],
  question: ['Wie führe ich einen Fast-forward ohne Merge-Commit aus?', 'How do I fast-forward without a merge commit?'],
  keywords: 'merge fast forward ff only linear vorziehen kein zusätzlicher commit',
  steps: [
    s(
      'overview',
      ['Wir ziehen main auf den vorhandenen neueren Commit vor', 'We will advance main to the existing newer commit'],
      [
        'Die Beispielgeschichte verläuft ohne Abzweigung. main steht einen Commit hinter feature/begruessung. Nur Fast-forward darf main entlang dieser Geschichte vorziehen und benötigt keinen zusätzlichen Merge-Commit.',
        'The sample history has no divergence. main is one commit behind feature/begruessung. Fast-forward only can advance main along that history without an additional merge commit.',
      ],
      '[data-tutorial="graph"]',
      { continue: false, prepare: seed() },
    ),
    s(
      'before',
      ['HEAD markiert den älteren Zielstand', 'HEAD marks the older target revision'],
      [
        'main ist aktiv und soll Änderungen erhalten. Merke dir seinen aktuellen Commit; nach dem Merge soll dieser Verweis am bereits vorhandenen neueren Commit stehen.',
        'main is active and should receive changes. Notice its current commit; after the merge its reference should point to the newer commit that already exists.',
      ],
      mergeHead(3),
      { prepare: seed() },
    ),
    s(
      'source',
      ['Der nächste Commit existiert bereits auf der Quelle', 'The next commit already exists on the source'],
      [
        'feature/begruessung führt genau diese Geschichte weiter. Der Quellen-Commit bleibt bei Fast-forward unverändert erhalten.',
        'feature/begruessung continues this exact history. The source commit remains unchanged during a fast-forward.',
      ],
      graphRow(4),
      { prepare: seed() },
    ),
    s(
      'more',
      ['Öffne weitere Aktionen', 'Open more actions'],
      ['Öffne das Dreipunktmenü oben, um die Merge-Auswahl zu erreichen.', 'Open the three-dot menu at the top to reach the merge picker.'],
      mergeMore,
      { prepare: seed(), completion: element(mergeOpen) },
    ),
    s(
      'open',
      ['Öffne Zusammenführen', 'Open Merge'],
      ['Wähle die Aktion zum Zusammenführen von Branches.', 'Choose the action for merging branches.'],
      mergeOpen,
      { prepare: seed({ stage: 'more' }), completion: element(c('source')) },
    ),
    s(
      'choose-source',
      ['Wähle die neuere Quelle', 'Choose the newer source'],
      [
        'Lass In aktuellen Branch ausgewählt und wähle feature/begruessung als Quelle.',
        'Keep Into current branch selected and choose feature/begruessung as the source.',
      ],
      c('source'),
      { prepare: seed({ stage: 'menu' }), completion: value(c('source'), mergeSource) },
    ),
    s(
      'direction',
      ['feature/begruessung liefert, main empfängt', 'feature/begruessung provides and main receives'],
      [
        'Prüfe den Pfeil. Die Auswahl allein hat weder Dateien noch Branch-Verweise verändert.',
        'Check the arrow. The selection alone has changed neither files nor branch references.',
      ],
      c('flow'),
      { prepare: seed({ stage: 'menu', selected: true }) },
    ),
    s(
      'mode',
      ['Wähle Nur Branch nachziehen (Fast-forward)', 'Choose Only advance the branch (fast-forward)'],
      [
        'Wähle Nur Branch nachziehen (Fast-forward). So stoppt die Aktion, falls statt des erwarteten Vorziehens ein Merge-Commit nötig wäre.',
        'Choose Only advance the branch (fast-forward). This stops the action if it would need a merge commit instead of the expected advance.',
      ],
      c('mode'),
      { prepare: seed({ stage: 'menu', selected: true }), completion: value(c('mode'), 'ffOnly') },
    ),
    s(
      'restriction',
      ['Eine lineare Fortsetzung ist die Voraussetzung', 'A linear continuation is required'],
      [
        'Der ältere Ziel-Commit ist hier ein Vorgänger der Quelle. Bei eigenen Commits auf beiden Branches müsstest du ein anderes Verfahren bewusst wählen.',
        'The older target commit is an ancestor of the source here. If both branches had their own commits, you would need to deliberately choose another behavior.',
      ],
      c('behavior'),
      { prepare: seed({ stage: 'menu', selected: true, mode: 'ffOnly' }) },
    ),
    s(
      'review',
      ['Prüfe den vorbereiteten Merge', 'Review the prepared merge'],
      [
        'Klicke Weiter · Merge prüfen. Die Bestätigung soll die Quelle, main als Ziel und Nur Fast-forward nennen.',
        'Click Continue · review merge. The confirmation should name the source, main as target and Fast-forward only.',
      ],
      c('review'),
      { prepare: seed({ stage: 'menu', selected: true, mode: 'ffOnly' }), completion: element(mergeDialog) },
    ),
    s(
      'target',
      ['Dieses Ziel wird gleich vorgezogen', 'This target is about to advance'],
      [
        'Nach zeigt main. Die App bleibt auf main; sie entfernt den Quellbranch nicht und führt keinen Upload aus.',
        'Into shows main. The app stays on main; it keeps the source branch and performs no upload.',
      ],
      mergeContext(2),
      { prepare: seed({ stage: 'review', mode: 'ffOnly' }) },
    ),
    s(
      'confirm',
      ['Führe den Fast-forward aus', 'Perform the fast-forward'],
      [
        'Bestätige Zusammenführen. Warte auf den neuen HEAD-Verweis am bereits vorhandenen Quellen-Commit.',
        'Confirm Merge. Wait for the new HEAD reference on the existing source commit.',
      ],
      mergeConfirm,
      { prepare: seed({ stage: 'review', mode: 'ffOnly' }), completion: element(mergeHead(4)) },
    ),
    s(
      'advanced',
      ['main und HEAD stehen jetzt am neueren Commit', 'main and HEAD now point to the newer commit'],
      [
        'Der Zielbranch wurde verschoben. Die vorhandenen vier Commits bleiben dieselben; es ist kein fünfter Merge-Commit entstanden.',
        'The target branch has advanced. The existing four commits are unchanged; there is no fifth merge commit.',
      ],
      mergeHead(4),
      { prepare: seed({ stage: 'result', mode: 'ffOnly' }) },
    ),
    s(
      'source-kept',
      ['Die Quelle bleibt als eigener Branch erhalten', 'The source remains as a separate branch'],
      [
        'feature/begruessung existiert weiterhin. Beide lokalen Branch-Namen zeigen jetzt auf denselben Commit, main bleibt aktiv.',
        'feature/begruessung still exists. Both local branch names now point to the same commit, while main stays active.',
      ],
      branchRow(mergeSource, false),
      { prepare: seed({ stage: 'result', mode: 'ffOnly' }) },
    ),
    s(
      'open-files',
      ['Öffne die Arbeitsdateien', 'Open the working files'],
      [
        'Öffne die Dateiansicht, um den tatsächlich ausgecheckten Inhalt nach dem Fast-forward zu prüfen.',
        'Open the file view to check the actual checked-out contents after the fast-forward.',
      ],
      fileControl('open-files'),
      { prepare: seed({ stage: 'result', mode: 'ffOnly' }), completion: element(fileControl('open-files') + '[aria-pressed="true"]') },
    ),
    s(
      'open-readme',
      ['Öffne README.md', 'Open README.md'],
      [
        'Wähle die README im Dateibaum. Diese Arbeitsdatei soll jetzt dem neueren gespeicherten Quellenstand entsprechen.',
        'Choose README in the file tree. This working file should now match the newer saved source revision.',
      ],
      fileRow('README.md'),
      { prepare: seed({ stage: 'result', mode: 'ffOnly', file: 'tree' }), completion: element(historyViewer()) },
    ),
    s(
      'text-tab',
      ['Zeige den Dateiinhalt an', 'Show the file contents'],
      [
        'Wechsle bei Bedarf zum Text-Reiter. Du prüfst den aktuellen Arbeitsstand, keinen ungespeicherten Entwurf.',
        'Switch to the Text tab if needed. You are checking the current working revision, with no unsaved draft.',
      ],
      fileTab('text'),
      { prepare: seed({ stage: 'result', mode: 'ffOnly', file: 'work' }), completion: element(historyViewer() + '[data-tab="text"]') },
    ),
    s(
      'contents',
      ['Die README enthält die aktualisierte Begrüßung', 'README contains the updated greeting'],
      [
        'Der sichtbare Text stammt jetzt vom neueren Beispiel-Commit. Fast-forward hat den Branch-Verweis und den ausgecheckten Dateistand zusammen aktualisiert.',
        'The visible text now comes from the newer sample commit. Fast-forward updated the branch reference and checked-out contents together.',
      ],
      historyViewer() + ' .cm-content',
      { prepare: seed({ stage: 'result', mode: 'ffOnly', file: 'work' }) },
    ),
    s(
      'close-file',
      ['Schließe die Dateiansicht', 'Close the file viewer'],
      [
        'Schließe die README wieder. Der aktualisierte Stand bleibt gespeichert und sauber.',
        'Close README again. The updated revision remains saved and clean.',
      ],
      fileControl('close-file'),
      { prepare: seed({ stage: 'result', mode: 'ffOnly', file: 'work' }), completion: { kind: 'absent', selector: historyViewer() } },
    ),
    s(
      'finish',
      ['Ein vorhandener Commit wurde zum neuen Zielstand', 'An existing commit became the new target revision'],
      [
        'Du hast main vorgezogen, die Quelle erhalten und den neuen Dateiinhalt geprüft. Die Merge-Commit-Lektion zeigt als Nächstes dieselbe Übernahme mit zusätzlichem Zusammenführungs-Commit.',
        'You advanced main, kept the source and checked the new file contents. The merge-commit lesson next shows the same changes with an additional commit recording the join.',
      ],
      '[data-tutorial="graph"]',
      { prepare: seed({ stage: 'result', mode: 'ffOnly' }) },
    ),
  ],
};
