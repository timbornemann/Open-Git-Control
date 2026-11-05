import type { TutorialChapter } from './types';
import { branchStep, branchControl as c, branchRow as row, branchElement as element } from './branchLessonHelpers';
import { carryBranch, carryButton as button, carryField as field } from './branchCarryHelpers';
import { branchParkRecipe as seed, parkName as name, parkResult, stashEntry as entry, stashAction as action, stashFile as file } from './branchParkHelpers';
const s: typeof branchStep = (id, title, description, target, extra) => branchStep(id, title, description, target, { inspector: 'staging', ...extra });
export const TUTORIAL_BRANCHES_PARK: TutorialChapter = {
  id: 'branches-park',
  section: 'repo',
  title: ['Änderungen parken und mit sauberem Ziel weiterarbeiten', 'Park changes and continue with a clean target'],
  description: [
    'Sichere teilweise gestagte Arbeit und eine neue Datei für später; kontrolliere den sauberen Zielbranch und die erhaltene Sicherung.',
    'Save partially staged work and a new file for later; inspect the clean target branch and retained backup.',
  ],
  question: ['Wie parke ich Änderungen beim Branchwechsel?', 'How do I park changes when switching branches?'],
  keywords: 'branch park parken stash später sichern sauber clean wechsel backup neue dateien index',
  steps: [
    s(
      'overview',
      ['Die offene Arbeit soll am Ziel zunächst nicht erscheinen', 'The uncommitted work should not appear at the target yet'],
      [
        'README ist teilweise vorgemerkt, notes.txt ist neu. Diesmal parken wir beide für später. main und feature/begruessung zeigen bewusst auf denselben gespeicherten Commit, damit die Wirkung des Parkens getrennt lesbar bleibt.',
        'README is partially staged and notes.txt is new. This time we will park both for later. main and feature/begruessung deliberately point to the same saved commit so the effect of parking is easy to distinguish.',
      ],
      c('staging'),
      { continue: false, prepare: seed() },
    ),
    s(
      'request',
      ['Fordere den Wechsel zum Beispielbranch an', 'Request a switch to the sample branch'],
      [
        'Klicke feature/begruessung. Die App soll zuerst die offenen Versionen prüfen, bevor sie einen Wechsel ausführt.',
        'Click feature/begruessung. The app should review the uncommitted versions before executing a switch.',
      ],
      row(carryBranch),
      { prepare: seed(), completion: element('.branch-change-files') },
    ),
    s(
      'review',
      ['Prüfe alle betroffenen Inhalte', 'Inspect all affected contents'],
      [
        'Die vorgemerkte und die weitere bearbeitete README-Fassung stehen getrennt in der Prüfung; notes.txt ist als neue Datei enthalten. Die Sicherung soll diese drei Zustände zusammen erhalten.',
        'The staged and further working README versions appear separately in the review; notes.txt is included as a new file. The backup should preserve these three states together.',
      ],
      '.branch-change-files',
      { prepare: seed('review') },
    ),
    s(
      'next',
      ['Gehe zur Wahl der Wechselvariante', 'Proceed to the switch choice'],
      [
        'Wähle Weiter im Dialog. Erst danach entscheiden wir ausdrücklich zwischen Mitnehmen und Parken.',
        'Choose Next in the dialog. We will then explicitly choose between carrying and parking.',
      ],
      button('confirm'),
      { prepare: seed('review'), completion: element(field) },
    ),
    s(
      'name',
      ['Nenne die Sicherung Arbeit für später', 'Name the backup Work for later'],
      [
        'Trage „Arbeit für später“ ein. Der Name soll dir helfen, diese offene Arbeit beim späteren Wiederherstellen zu erkennen.',
        'Enter “Work for later”. The name should help you recognize this uncommitted work when restoring it later.',
      ],
      field,
      { prepare: seed('choice', { name: ['', ''] }), completion: { kind: 'value', selector: field, value: name } },
    ),
    s(
      'choice',
      ['Parken lässt die Arbeit gesichert zurück', 'Parking leaves the work saved for later'],
      [
        'Mitnehmen würde die Änderungen direkt im Ziel wiederherstellen. Parken und wechseln lässt die Sicherung bestehen und öffnet den Zielbranch zunächst ohne diese Arbeit. Wir wählen jetzt diese zweite Variante.',
        'Carry would restore the changes directly at the target. Park and switch retains the backup and initially opens the target without this work. We will choose that second option now.',
      ],
      button('secondary'),
      { prepare: seed('choice') },
    ),
    s(
      'park',
      ['Bestätige Parken und wechseln', 'Confirm Park and switch'],
      [
        'Wähle Parken und wechseln. Erfolgreich ist der Schritt erst, wenn feature/begruessung aktiv ist, der Arbeitsstand sauber ist und eine Sicherung für später besteht.',
        'Choose Park and switch. The step succeeds only once feature/begruessung is active, the working state is clean and a backup exists for later.',
      ],
      button('secondary'),
      {
        prepare: seed('choice'),
        completion: {
          kind: 'all',
          conditions: [element(parkResult), element(row(carryBranch, true)), { kind: 'working-tree', staged: [], unstaged: [], untracked: [] }],
        },
      },
    ),
    s(
      'result',
      ['Der Dialog bestätigt den Wechsel mit geparkter Arbeit', 'The dialog confirms the switch with parked work'],
      [
        'Der Zielbranch ist gewechselt, die Änderungen sind geparkt. Name und Sicherungsverweis gehören zu dieser vorbereiteten Arbeit. Die Arbeit wurde weder in einen normalen Branch-Commit übernommen noch veröffentlicht.',
        'The target branch has switched and the changes are parked. The name and backup reference identify this prepared work. The work was neither saved in an ordinary branch commit nor published.',
      ],
      parkResult,
      { prepare: seed('result') },
    ),
    s(
      'close',
      ['Schließe das Ergebnis des Parkens', 'Close the parking outcome'],
      [
        'Wähle Schließen. Die Sicherung bleibt erhalten, während wir den Zielbranch und die Stash-Liste betrachten.',
        'Choose Close. The backup remains while we inspect the target branch and stash list.',
      ],
      button('cancel'),
      { prepare: seed('result'), completion: { kind: 'absent', selector: '[role="dialog"]' } },
    ),
    s(
      'clean',
      ['Der Zielbranch hat keine offenen Änderungen aus dieser Arbeit', 'The target has none of these uncommitted changes'],
      [
        'Die drei Änderungsbereiche sind leer. Das bedeutet hier nicht, dass die Arbeit verloren ist: Sie liegt in der geparkten Sicherung. README zeigt wieder die gespeicherte Fassung des Zielbranches.',
        'The three change sections are empty. This does not mean the work is lost: it is in the parked backup. README again contains the target branch’s saved version.',
      ],
      c('staging'),
      { prepare: seed('parked') },
    ),
    s(
      'head',
      ['feature/begruessung ist aktiv, main bleibt erhalten', 'feature/begruessung is active and main remains'],
      [
        'HEAD gehört zum Zielbranch. main ist unverändert vorhanden. Beide Branch-Namen bleiben an ihrem vorbereiteten gespeicherten Commit.',
        'HEAD belongs to the target branch. main still exists unchanged. Both branch names remain at their prepared saved commit.',
      ],
      row(carryBranch, true),
      { prepare: seed('parked') },
    ),
    s(
      'objects',
      ['Die Gesamthistorie kann Sicherungsobjekte zeigen', 'All history can show backup objects'],
      [
        'Die Ansicht mit allen Referenzen enthält nun zusätzlich die Stash-Sicherung samt ihren Index- und Dateiversionen. Diese Objekte sind kein normaler neuer Commit auf main oder feature/begruessung. Die beiden Branch-Verweise bleiben unverändert.',
        'The all-references view now additionally contains the stash backup and its index and file versions. These objects are not an ordinary new commit on main or feature/begruessung. Both branch references stay unchanged.',
      ],
      c('graph'),
      { prepare: seed('parked') },
    ),
    s(
      'open-stashes',
      ['Öffne die Stash-Liste', 'Open the stash list'],
      [
        'Klappe Stashes im Staging-Bereich auf. Dort soll die benannte Sicherung des Branchwechsels erscheinen.',
        'Expand Stashes in the staging area. The named backup from the branch switch should appear there.',
      ],
      c('stash-panel-toggle'),
      { prepare: seed('parked'), completion: element(entry) },
    ),
    s(
      'saved-name',
      ['Prüfe Namen und Herkunft der Sicherung', 'Inspect the backup name and origin'],
      [
        'Der Eintrag heißt stash@{0} und enthält „Arbeit für später“. Als Herkunft steht main. Der Name im Stapel ist eine Position; eine zusätzliche Sicherung könnte diese Position später verschieben.',
        'The entry is named stash@{0} and contains “Work for later”. Its origin is main. The stack name is a position; an additional backup could shift that position later.',
      ],
      entry,
      { prepare: seed('parked', { stashes: true }) },
    ),
    s(
      'files',
      ['Zeige die gesicherten Dateinamen', 'Show the saved filenames'],
      [
        'Wähle Dateien am Stash-Eintrag. Diese Leseansicht soll README.md und die neue notes.txt aus der Sicherung auflisten.',
        'Choose Files on the stash entry. This read-only view should list README.md and the new notes.txt from the backup.',
      ],
      action('files'),
      { prepare: seed('parked', { stashes: true }), completion: element(file('notes.txt')) },
    ),
    s(
      'file-list',
      ['Auch die neue Datei ist in der Sicherung enthalten', 'The new file is included in the backup too'],
      [
        'Beide Dateinamen stehen in der Liste. Die Einzeldatei-Übernahme und das Erstellen eines Branches sind für diese geführte Sicherung gesperrt; ihre Wiederherstellung erfolgt über die gemeinsame Prüfung, damit auch der Index-Zustand erhalten bleibt.',
        'Both filenames appear in the list. Individual-file application and branch creation are disabled for this guided backup; restoration uses the shared review so its index state is preserved too.',
      ],
      entry + ' .stash-file-list',
      { prepare: seed('parked', { stashes: true, files: true }) },
    ),
    s(
      'hide-files',
      ['Klappe die Dateiliste wieder zu', 'Collapse the file list again'],
      [
        'Wähle Dateien ausblenden. Damit schließt du nur die Liste; der Stash selbst und sein Inhalt bleiben erhalten.',
        'Choose Hide files. This closes only the list; the stash and its contents remain.',
      ],
      action('files'),
      { prepare: seed('parked', { stashes: true, files: true }), completion: { kind: 'absent', selector: entry + ' .stash-file-list' } },
    ),
    s(
      'restore-route',
      ['Anwenden öffnet die geführte Wiederherstellung', 'Apply opens the guided restoration'],
      [
        'Für diese vom Branchwechsel angelegte Sicherung öffnen Anwenden und Pop zuerst eine geführte Prüfung. Nach bestätigter, erfolgreicher Wiederherstellung wird die zugeordnete Sicherung entfernt. Das unterscheidet sie vom gewöhnlichen Anwenden eines selbst angelegten Stashes.',
        'For this backup created by a branch switch, Apply and Pop first open a guided review. After confirmed successful restoration, the assigned backup is removed. This differs from ordinary application of a manually created stash.',
      ],
      action('apply'),
      { prepare: seed('parked', { stashes: true }) },
    ),
    s(
      'collapse',
      ['Schließe die Stash-Liste für diesen Durchlauf', 'Close the stash list for this run'],
      [
        'Klappe Stashes wieder zu. Wir lassen den Zielbranch sauber und die Sicherung absichtlich bestehen. Die nächste Lektion übt Rückkehr und Wiederherstellung mit einem frischen Beispielzustand.',
        'Collapse Stashes again. We deliberately leave the target clean and retain the backup. The next lesson practises returning and restoring from a fresh example state.',
      ],
      c('stash-panel-toggle'),
      { prepare: seed('parked', { stashes: true }), completion: element(c('stash-panel-toggle') + '[aria-expanded="false"]') },
    ),
    s(
      'finish',
      ['Die Arbeit ist geparkt und wieder auffindbar', 'The work is parked and can be found again'],
      [
        'Du hast die Park-Variante bestätigt, den sauberen Zielbranch kontrolliert und die benannte Sicherung samt Dateiliste gefunden. Weiter beendet diese Lektion. Erneute Einstiege beginnen immer mit frischen Beispieldaten.',
        'You confirmed parking, inspected the clean target and found the named backup and file list. Next completes this lesson. New entries always start with fresh example data.',
      ],
      c('staging'),
      { prepare: seed('parked') },
    ),
  ],
};
