import type { TutorialChapter } from './types';
import { branchRow } from './branchLessonHelpers';
import { graphRow } from './historyLessonHelpers';
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
  mergeCancel,
  element,
  value,
} from './mergeLessonHelpers';
export const TUTORIAL_MERGE_REVIEW: TutorialChapter = {
  id: 'merge-review',
  section: 'repo',
  title: ['Merge verstehen: Richtung, Verfahren und Prüfung', 'Understand merge: direction, behavior and review'],
  description: [
    'Probiere beide Richtungen und alle vier Verfahren aus. Lies die Bestätigung und brich die Prüfung ohne Änderungen ab.',
    'Try both directions and all four behaviors. Read the confirmation and cancel the review without changing anything.',
  ],
  question: ['Wie wähle und prüfe ich Quelle, Ziel und Merge-Verfahren?', 'How do I choose and review merge source, target and behavior?'],
  keywords: 'merge zusammenführen richtung quelle ziel fast forward no ff squash review prüfen',
  steps: [
    s(
      'overview',
      ['Zusammenführen beginnt mit Quelle und Ziel', 'Merging starts with a source and target'],
      [
        'Ein Merge übernimmt gespeicherte Änderungen eines anderen Branches in einen Zielbranch. Wir lernen zuerst das Formular und seine Sicherheitsabfrage kennen. Diese Lektion beendet die Prüfung mit Abbrechen; die nächsten Lektionen führen die Verfahren einzeln aus.',
        'A merge takes saved changes from another branch into a target branch. First we will learn the form and its review. This lesson cancels the review; the next lessons perform each behavior separately.',
      ],
      '[data-tutorial="graph"]',
      { continue: false, prepare: seed() },
    ),
    s(
      'current',
      ['main ist der aktuelle Ausgangspunkt', 'main is the current starting point'],
      [
        'HEAD steht auf main, einen Commit vor dem Beispielbranch. In aktuellen Branch bedeutet: main erhält die Änderungen und bleibt aktiv.',
        'HEAD points to main, one commit behind the sample branch. Into current branch means that main receives the changes and stays active.',
      ],
      mergeHead(3),
      { prepare: seed() },
    ),
    s(
      'source',
      ['Der Beispielbranch liefert einen neueren Stand', 'The sample branch provides a newer revision'],
      [
        'feature/begruessung enthält den nächsten gespeicherten Projektstand. Seine Dateien und sein Commit sind die Quelle. Ein Merge entfernt diesen Branch nicht.',
        'feature/begruessung contains the next saved project revision. Its files and commit provide the source. A merge does not remove this branch.',
      ],
      graphRow(4),
      { prepare: seed() },
    ),
    s(
      'more',
      ['Öffne die weiteren Aktionen', 'Open more actions'],
      [
        'Öffne das Dreipunktmenü in der oberen Leiste. Dieser Weg zur Merge-Auswahl funktioniert auch bei wenig Fensterbreite.',
        'Open the three-dot menu in the top bar. This route to the merge picker also works in a narrow window.',
      ],
      mergeMore,
      { prepare: seed(), completion: element(mergeOpen) },
    ),
    s(
      'open',
      ['Öffne Branches zusammenführen', 'Open Merge branches'],
      [
        'Wähle Zusammenführen. Die Auswahl fragt zuerst nach Richtung, anderem Branch und gewünschtem Verfahren.',
        'Choose Merge. The picker first asks for the direction, the other branch and the desired behavior.',
      ],
      mergeOpen,
      { prepare: seed({ stage: 'more' }), completion: element(c('source')) },
    ),
    s(
      'inward',
      ['Die Voreinstellung übernimmt in den aktuellen Branch', 'The default direction merges into the current branch'],
      [
        'In aktuellen Branch ist ausgewählt. Der aktive main ist das Ziel; im nächsten Feld wählen wir den Branch, der Änderungen liefert.',
        'Into current branch is selected. Active main is the target; the next field chooses the branch providing changes.',
      ],
      c('inward'),
      { prepare: seed({ stage: 'menu' }) },
    ),
    s(
      'choose-source',
      ['Wähle feature/begruessung als Quelle', 'Choose feature/begruessung as the source'],
      [
        'Öffne Quellbranch und wähle feature/begruessung. Lokale und vorhandene Remote-Verweise werden getrennt angeboten. Die Auswahl allein führt noch keinen Merge aus.',
        'Open Source branch and choose feature/begruessung. Local and available remote-tracking references are grouped separately. Choosing one does not perform a merge.',
      ],
      c('source'),
      { prepare: seed({ stage: 'menu' }), completion: value(c('source'), mergeSource) },
    ),
    s(
      'flow',
      ['Der Pfeil zeigt von der Quelle zum Ziel', 'The arrow runs from source to target'],
      [
        'Links liefert feature/begruessung die Commits, rechts erhält main sie. Prüfe diese Richtung vor jeder Zusammenführung.',
        'On the left, feature/begruessung provides commits; on the right, main receives them. Check this direction before every merge.',
      ],
      c('flow'),
      { prepare: seed({ stage: 'menu', selected: true }) },
    ),
    s(
      'default',
      ['Standard passt das Verfahren an die Geschichte an', 'Default adapts to the history'],
      [
        'Standard kann den Zielbranch vorziehen, wenn die Quelle einfach weitergeführt wurde. Bei auseinanderentwickelten Branches kann ein Merge-Commit entstehen. Ein Konflikt muss vor dem Abschluss gelöst werden.',
        'Default can advance the target when the source simply continued its history. Diverged branches can require a merge commit. Conflicts must be resolved before completion.',
      ],
      c('mode'),
      { prepare: seed({ stage: 'menu', selected: true }) },
    ),
    s(
      'choose-no-ff',
      ['Wähle Mit Merge-Commit', 'Choose Create a merge commit'],
      [
        'Wähle Mit Merge-Commit im Verfahrensfeld. Lies anschließend die dazu eingeblendete Erklärung.',
        'Choose Create a merge commit in the behavior field. Then read its explanation beside the selector.',
      ],
      c('mode'),
      { prepare: seed({ stage: 'menu', selected: true }), completion: value(c('mode'), 'noFf') },
    ),
    s(
      'no-ff',
      ['Ein Merge-Commit bewahrt die Zusammenführung', 'A merge commit records the join'],
      [
        'Bei einer tatsächlichen Zusammenführung entsteht ein zusätzlicher Commit mit beiden Vorgängern, auch wenn Vorziehen möglich wäre. Eine bereits enthaltene Quelle bleibt ohne neue Arbeit.',
        'An actual merge creates an additional commit with both parents, even when a fast-forward would be possible. An already-contained source still needs no new work.',
      ],
      c('behavior'),
      { prepare: seed({ stage: 'menu', selected: true, mode: 'noFf' }) },
    ),
    s(
      'choose-squash',
      ['Wähle Squash zum Vorbereiten', 'Choose Squash to prepare changes'],
      [
        'Wähle Squash. Dieses Verfahren bereitet Änderungen zum eigenen Commit vor.',
        'Choose Squash. This behavior prepares changes for a commit you create yourself.',
      ],
      c('mode'),
      { prepare: seed({ stage: 'menu', selected: true, mode: 'noFf' }), completion: value(c('mode'), 'squash') },
    ),
    s(
      'squash',
      ['Squash füllt den Index und wartet auf deinen Commit', 'Squash fills the index and waits for your commit'],
      [
        'Die Änderungen landen vorgemerkt im Ziel. HEAD bewegt sich dadurch noch nicht. Dein anschließender eigener Commit hat nur den bisherigen Ziel-Commit als Vorgänger und speichert keine zweite Merge-Elternbeziehung.',
        'The changes are staged in the target. HEAD does not move yet. Your subsequent commit has only the previous target commit as its parent and records no second merge-parent relationship.',
      ],
      c('behavior'),
      { prepare: seed({ stage: 'menu', selected: true, mode: 'squash' }) },
    ),
    s(
      'choose-ff-only',
      ['Wähle Nur Branch nachziehen (Fast-forward)', 'Choose Only advance the branch (fast-forward)'],
      [
        'Wähle Nur Branch nachziehen (Fast-forward). Diese Variante erlaubt ausschließlich das Vorziehen des Zielbranches.',
        'Choose Only advance the branch (fast-forward). This variant permits advancing the target branch only.',
      ],
      c('mode'),
      { prepare: seed({ stage: 'menu', selected: true, mode: 'squash' }), completion: value(c('mode'), 'ffOnly') },
    ),
    s(
      'ff-only',
      ['Eine Abzweigung stoppt Fast-forward only', 'A divergence stops Fast-forward only'],
      [
        'Wenn beide Branches eigene neue Commits besitzen, bricht dieses Verfahren ab. Es erzeugt keinen Merge-Commit. Unsere linearen Beispieldaten eignen sich für die nächste Fast-forward-Lektion.',
        'If both branches have their own new commits, this behavior stops. It creates no merge commit. Our linear sample history fits the next fast-forward lesson.',
      ],
      c('behavior'),
      { prepare: seed({ stage: 'menu', selected: true, mode: 'ffOnly' }) },
    ),
    s(
      'restore-default',
      ['Stelle Standard wieder ein', 'Restore Default'],
      [
        'Wähle wieder Standard. Wir prüfen als Nächstes die umgekehrte Richtung, ohne eine Zusammenführung auszuführen.',
        'Choose Default again. Next we will inspect the reverse direction without performing a merge.',
      ],
      c('mode'),
      { prepare: seed({ stage: 'menu', selected: true, mode: 'ffOnly' }), completion: value(c('mode'), 'default') },
    ),
    s(
      'outward',
      ['Wähle Aktuellen Branch weitergeben', 'Choose Current into another'],
      [
        'Klicke die zweite Richtung. Die vorherige Branch-Auswahl wird zurückgesetzt, weil das Feld jetzt ein anderes Ziel bezeichnet.',
        'Click the second direction. The previous branch selection resets because the field now identifies another target.',
      ],
      c('outward'),
      { prepare: seed({ stage: 'menu', selected: true }), completion: element(c('outward') + '[aria-pressed="true"]') },
    ),
    s(
      'outward-explained',
      ['Die App würde automatisch zum Ziel wechseln', 'The app would switch to the target automatically'],
      [
        'Aktueller main wäre nun die Quelle. Das gewählte lokale Ziel würde aktiv bleiben, auch bei Konflikten. Offene Arbeit muss vorher committed oder gestasht werden. Die Aktion führt keinen Upload aus.',
        'Current main would now be the source. The chosen local target would stay active, including with conflicts. Commit or stash open work first. The action performs no upload.',
      ],
      c('outward'),
      { prepare: seed({ stage: 'menu', outward: true }) },
    ),
    s(
      'choose-target',
      ['Wähle probeweise den anderen Zielbranch', 'Choose the other target branch for review'],
      [
        'Wähle feature/begruessung als Ziel. Diese Prüfung dient nur der Orientierung; der neuere Branch enthält den älteren main bereits.',
        'Choose feature/begruessung as the target. This review is for orientation only; the newer branch already contains the older main.',
      ],
      c('source'),
      { prepare: seed({ stage: 'menu', outward: true }), completion: value(c('source'), mergeSource) },
    ),
    s(
      'outward-flow',
      ['Jetzt zeigt der Pfeil in die andere Richtung', 'The arrow now shows the reverse direction'],
      [
        'main liefert jetzt, feature/begruessung empfängt. Die Namen an diesem Pfeil entscheiden über Quelle und Ziel; die Position im Graphen allein genügt dafür nicht.',
        'main now provides changes and feature/begruessung receives them. The names along this arrow determine source and target; graph position alone does not.',
      ],
      c('flow'),
      { prepare: seed({ stage: 'menu', outward: true, selected: true }) },
    ),
    s(
      'return-inward',
      ['Kehre zur Übernahme in main zurück', 'Return to merging into main'],
      [
        'Wähle wieder In aktuellen Branch. Danach wählen wir die Quelle erneut und öffnen die abschließende Prüfung.',
        'Choose Into current branch again. Then we will select the source again and open the final review.',
      ],
      c('inward'),
      { prepare: seed({ stage: 'menu', outward: true, selected: true }), completion: element(c('inward') + '[aria-pressed="true"]') },
    ),
    s(
      'source-again',
      ['Wähle die Quelle erneut', 'Choose the source again'],
      ['Wähle feature/begruessung. main bleibt bis zur Bestätigung unverändert.', 'Choose feature/begruessung. main remains unchanged until confirmation.'],
      c('source'),
      { prepare: seed({ stage: 'menu' }), completion: value(c('source'), mergeSource) },
    ),
    s(
      'review',
      ['Öffne die Prüfung', 'Open the review'],
      [
        'Klicke Weiter · Merge prüfen. Dieser Klick öffnet erst die Bestätigung; der Merge wurde noch nicht ausgeführt.',
        'Click Continue · review merge. This opens the confirmation; the merge has not been performed yet.',
      ],
      c('review'),
      { prepare: seed({ stage: 'menu', selected: true }), completion: element(mergeDialog) },
    ),
    s(
      'review-source',
      ['Von bezeichnet die unveränderte Quelle', 'From identifies the unchanged source'],
      [
        'feature/begruessung liefert die gespeicherten Änderungen. Sein Branch-Verweis wird durch die Übernahme nicht verschoben.',
        'feature/begruessung provides the saved changes. Its branch reference is not moved by taking them.',
      ],
      mergeContext(1),
      { prepare: seed({ stage: 'review' }) },
    ),
    s(
      'review-target',
      ['Nach bezeichnet den betroffenen Zielbranch', 'Into identifies the affected target branch'],
      [
        'main erhält die Änderungen. Lies dieses Feld besonders sorgfältig, bevor du bei einem eigenen Projekt bestätigst.',
        'main receives the changes. Read this field carefully before confirming in your own project.',
      ],
      mergeContext(2),
      { prepare: seed({ stage: 'review' }) },
    ),
    s(
      'review-mode',
      ['Das ausgewählte Verfahren steht noch einmal hier', 'The chosen behavior is repeated here'],
      [
        'Die Bestätigung zeigt Standard. Ein anderer Modus würde hier entsprechend erscheinen. So kannst du Richtung und Wirkung zusammen prüfen.',
        'The confirmation shows Default. Another selected mode would appear here instead. This lets you check direction and behavior together.',
      ],
      mergeContext(3),
      { prepare: seed({ stage: 'review' }) },
    ),
    s(
      'review-impact',
      ['Die Hinweise beschreiben Folgen und Konflikte', 'The notes explain consequences and conflicts'],
      [
        'Bei einem Konflikt öffnet sich die Konfliktlösung. Der Quellbranch bleibt erhalten und es wird nichts hochgeladen. In dieser Lektion brechen wir ab, um die unveränderten Ausgangsstände zu prüfen.',
        'Conflicts open the conflict resolver. The source branch is kept and nothing is uploaded. In this lesson we cancel to check the unchanged starting revisions.',
      ],
      mergeDialog + ' .dialog-impact',
      { prepare: seed({ stage: 'review' }) },
    ),
    s(
      'cancel',
      ['Brich die Prüfung ab', 'Cancel the review'],
      ['Klicke Abbrechen. Das schließt die Bestätigung ohne Git-Änderung.', 'Click Cancel. This closes the confirmation without changing Git state.'],
      mergeCancel,
      { prepare: seed({ stage: 'review' }), completion: { kind: 'absent', selector: mergeDialog } },
    ),
    s(
      'unchanged',
      ['Beide Branches stehen weiterhin an ihren Ausgangspunkten', 'Both branches remain at their starting revisions'],
      [
        'HEAD steht weiterhin auf main am älteren Commit. feature/begruessung bleibt am neueren Commit. Es gibt keinen zusätzlichen Commit und keine vorgemerkten Änderungen.',
        'HEAD still points to main at the older commit. feature/begruessung remains at the newer commit. There is no additional commit or staged change.',
      ],
      '[data-tutorial="graph"]',
      { prepare: seed() },
    ),
    s(
      'finish',
      ['Als Nächstes ein Verfahren praktisch ausführen', 'Next, perform one behavior'],
      [
        'Du kannst jetzt die Fast-forward-, Merge-Commit- oder Squash-Lektion wählen. Jede startet wieder mit frischen Beispieldaten und zeigt das Ergebnis im Verlauf und in den Dateien.',
        'You can now choose the fast-forward, merge-commit or squash lesson. Each starts with fresh sample data and shows its result in history and files.',
      ],
      branchRow('main', true),
      { prepare: seed() },
    ),
  ],
};
