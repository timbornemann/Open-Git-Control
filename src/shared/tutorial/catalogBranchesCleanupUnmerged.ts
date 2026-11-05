import type { TutorialChapter } from './types';
import { practiceCommitHash } from './exampleGitIds';
import { branchStep as s, branchPanel as panel, branchRow as row, branchElement as element } from './branchLessonHelpers';
import {
  branchCleanupRecipe as seed,
  branchCleanupRemainingRecipe as remainingSeed,
  cleanupMerged as merged,
  cleanupManual as manual,
  cleanupTrigger as trigger,
  cleanupMenuItem as menuItem,
  cleanupDialog as dialog,
  cleanupCandidate as candidate,
  cleanupCheckbox as checkbox,
  cleanupDialogAction as button,
} from './branchCleanupHelpers';
const open = { open: 'dialog' as const };
const manualOnly = { ...open, selected: [manual] };
const review = { ...manualOnly, review: true };
const confirmed = { ...review, confirmed: true };
const results = { ...confirmed, result: true };
const selected = (name: string, checked: boolean) => element(checkbox(name) + (checked ? ':checked' : ':not(:checked)'));
export const TUTORIAL_BRANCHES_CLEANUP_UNMERGED: TutorialChapter = {
  id: 'branches-cleanup-unmerged',
  section: 'repo',
  title: ['Bereinigung: offene Arbeit ausdrücklich bestätigen', 'Cleanup: explicitly confirm unmerged work'],
  description: [
    'Wähle einen nicht enthaltenen lokalen Branch manuell, prüfe die zusätzliche Warnung, kehre zur Auswahl zurück und bestätige den genauen Umfang.',
    'Manually select an uncontained local branch, inspect the additional warning, return to selection and explicitly confirm the exact scope.',
  ],
  question: ['Was bedeutet die Zusatzbestätigung beim Branch-Aufräumen?', 'What does the additional confirmation in branch cleanup mean?'],
  keywords: 'cleanup bereinigen unmerged nicht übernommen force manuell bestätigen checkbox warnung zurück auswahl',
  steps: [
    s(
      'overview',
      ['Nicht enthaltene Arbeit gehört nicht zur sicheren Vorauswahl', 'Uncontained work is not part of safe default selection'],
      [
        'feature/offene-arbeit besitzt in dieser Übung einen eigenen Commit außerhalb von main. Wir wählen nur diesen Namen manuell aus und lernen die zweite Bestätigung kennen. Der gesamte Ablauf bleibt im isolierten Lernprojekt.',
        'In this exercise feature/offene-arbeit has one commit outside main. We will manually select only that name and learn the second confirmation. The entire flow stays in the isolated learning project.',
      ],
      panel,
      { continue: false, prepare: seed() },
    ),
    s(
      'actions',
      ['Öffne die weiteren Branch-Aktionen', 'Open additional branch actions'],
      [
        'Öffne die drei Punkte in der Branch-Überschrift. Wir verwenden wieder die Prüfung für mehrere lokale Referenzen.',
        'Open the three dots in the branch heading. We will use the inspection for multiple local references again.',
      ],
      trigger,
      { prepare: seed(), completion: element(menuItem) },
    ),
    s(
      'open',
      ['Öffne die Bereinigungsprüfung', 'Open the cleanup inspection'],
      [
        'Wähle Branches aufräumen und warte auf die Kandidaten. Die beiden enthaltenen Namen sind zunächst vorausgewählt; wir passen diesen Umfang gleich an.',
        'Choose Clean up branches and wait for the candidates. The two contained names are initially selected; we will adjust that scope next.',
      ],
      menuItem,
      { prepare: seed({ open: 'menu' }), completion: element(checkbox(manual)) },
    ),
    s(
      'manual-reason',
      ['Lies den Hinweis auf nicht enthaltene Commits', 'Read the uncontained-commit notice'],
      [
        'feature/offene-arbeit steht bei den manuell zu prüfenden lokalen Branches. Die Begründung nennt einen Commit außerhalb des Zielverlaufs. Ein solcher Kandidat wird nicht automatisch vorausgewählt.',
        'feature/offene-arbeit appears among local branches requiring manual review. The explanation names one commit outside the target history. Such a candidate is not automatically selected.',
      ],
      candidate(manual),
      { prepare: seed(open) },
    ),
    s(
      'clear-feature',
      ['Entferne feature/fertig aus dem Umfang', 'Remove feature/fertig from the scope'],
      [
        'Entferne zuerst das Häkchen des enthaltenen feature/fertig. Diese Lektion soll ausschließlich die zusätzliche Entscheidung für offene Arbeit ausführen.',
        'First uncheck the contained feature/fertig. This lesson should perform only the additional decision for unmerged work.',
      ],
      checkbox(merged[0]),
      { prepare: seed(open), completion: selected(merged[0], false) },
    ),
    s(
      'clear-fix',
      ['Entferne auch fix/integriert', 'Remove fix/integriert too'],
      [
        'Entferne das zweite vorausgewählte Häkchen. Danach ist noch kein Branch für diesen Versuch ausgewählt.',
        'Clear the second preselected checkbox. No branch is then selected for this attempt yet.',
      ],
      checkbox(merged[1]),
      { prepare: seed({ ...open, selected: [merged[1]] }), completion: selected(merged[1], false) },
    ),
    s(
      'select-manual',
      ['Wähle nur feature/offene-arbeit aus', 'Select only feature/offene-arbeit'],
      [
        'Setze das Häkchen des manuell zu prüfenden Branches. Die Auswahl ist noch keine Löschung und bestätigt auch noch nicht das Verwerfen seiner eigenen Commits.',
        'Check the branch requiring manual review. Selection is not deletion and does not yet confirm discarding its own commits.',
      ],
      checkbox(manual),
      { prepare: seed({ ...open, selected: [] }), completion: selected(manual, true) },
    ),
    s(
      'scope',
      ['Prüfe die einzelne lokale Auswahl', 'Review the single local selection'],
      [
        'Nur feature/offene-arbeit ist ausgewählt. Weil sein Commit noch nicht im Vergleichsziel liegt, heißt der nächste Schritt Auswahl prüfen statt sofort Löschen.',
        'Only feature/offene-arbeit is selected. Because its commit is not contained in the comparison target, the next action says Review selection rather than immediately Delete.',
      ],
      '.branch-cleanup-summary',
      { prepare: seed(manualOnly) },
    ),
    s(
      'review',
      ['Öffne die zusätzliche Auswahlprüfung', 'Open the additional selection review'],
      [
        'Wähle Auswahl prüfen. Die App zeigt den betroffenen Namen und die nicht übernommenen Commits getrennt an. Noch soll keine Referenz verschwinden.',
        'Choose Review selection. The app separately shows the affected name and unmerged commits. No reference should disappear yet.',
      ],
      button('confirm'),
      { prepare: seed(manualOnly), completion: element('.branch-cleanup-force-warning') },
    ),
    s(
      'warning',
      ['Die Warnung benennt das Risiko dieser Auswahl', 'The warning names this selection’s risk'],
      [
        'Die Integration dieses Commits konnte nicht nachgewiesen werden. Löschen würde nur die Referenz entfernen und könnte eigene Arbeit ohne erreichbaren Namen zurücklassen. Die Warnung ist keine automatische Freigabe.',
        'Integration of this commit could not be verified. Deletion would remove only the reference and could leave its own work without a reachable name. The warning is not automatic authorization.',
      ],
      '.branch-cleanup-force-warning',
      { prepare: seed(review) },
    ),
    s(
      'unchecked',
      ['Die Löschung wartet auf ein eigenes Häkchen', 'Deletion waits for a separate checkbox'],
      [
        'Die Löschaktion ist deaktiviert, solange die zusätzliche Checkbox nicht gesetzt ist. Die erste Auswahl des Branches und diese ausdrückliche Bestätigung sind getrennte Entscheidungen.',
        'Deletion is disabled until the additional checkbox is checked. Initially selecting the branch and explicitly confirming it are separate decisions.',
      ],
      button('confirm'),
      { prepare: seed(review) },
    ),
    s(
      'acknowledge',
      ['Bestätige den Hinweis für die Beispielauswahl', 'Acknowledge the notice for this example selection'],
      [
        'Setze die zusätzliche Checkbox. Dadurch wird die Bestätigung für genau diese ausgewählten, nicht enthaltenen Commits freigegeben. Es ist noch nichts gelöscht.',
        'Check the additional checkbox. This enables confirmation for exactly these selected uncontained commits. Nothing has been deleted yet.',
      ],
      '.branch-cleanup-force-confirm input',
      { prepare: seed(review), completion: element('.branch-cleanup-force-confirm input:checked') },
    ),
    s(
      'enabled',
      ['Du kannst weiterhin zur Auswahl zurückkehren', 'You can still return to selection'],
      [
        'Die Löschaktion ist jetzt verfügbar. Wir führen sie noch nicht aus, sondern prüfen zuerst den Rückweg. Auch ein gesetztes Zusatzhäkchen zwingt dich nicht zum Löschen.',
        'Deletion is now available. We will first inspect the way back instead of executing it yet. Even a checked acknowledgement does not require you to delete.',
      ],
      button('secondary'),
      { prepare: seed(confirmed) },
    ),
    s(
      'back',
      ['Kehre zur Kandidatenauswahl zurück', 'Return to candidate selection'],
      [
        'Wähle Zur Auswahl. Die Kandidatenliste soll wieder erscheinen, während der manuell gewählte Branch bestehen bleibt.',
        'Choose Back to selection. The candidates should appear again while the manually selected branch remains.',
      ],
      button('secondary'),
      { prepare: seed(confirmed), completion: selected(manual, true) },
    ),
    s(
      'retained',
      ['Die Auswahl bleibt, die Freigabe wird verworfen', 'Selection remains, authorization is discarded'],
      [
        'feature/offene-arbeit ist weiterhin ausgewählt und vorhanden. Der Rückweg hat die zusätzliche Freigabe zurückgesetzt. Vor einer späteren Löschung muss sie erneut gegeben werden.',
        'feature/offene-arbeit remains selected and still exists. Returning reset the additional authorization. It must be given again before later deletion.',
      ],
      candidate(manual),
      { prepare: seed(manualOnly) },
    ),
    s(
      'review-again',
      ['Öffne die zusätzliche Prüfung erneut', 'Open the additional review again'],
      [
        'Wähle noch einmal Auswahl prüfen. Der bisherige Rückweg soll nicht als gespeicherte Zustimmung gelten.',
        'Choose Review selection again. The previous return must not count as saved consent.',
      ],
      button('confirm'),
      { prepare: seed(manualOnly), completion: element('.branch-cleanup-force-warning') },
    ),
    s(
      'reset-confirmation',
      ['Das zweite Häkchen ist wieder leer', 'The second checkbox is empty again'],
      [
        'Die Zusatzbestätigung ist wieder ungesetzt und die Löschaktion deaktiviert. Eine geänderte oder erneut geprüfte Auswahl erhält ebenfalls keine pauschale Freigabe.',
        'The additional acknowledgement is unchecked again and deletion is disabled. A changed or reinspected selection likewise receives no blanket authorization.',
      ],
      '.branch-cleanup-force-confirm',
      { prepare: seed(review) },
    ),
    s(
      'acknowledge-again',
      ['Bestätige den genauen Umfang erneut', 'Acknowledge the exact scope again'],
      [
        'Setze die zusätzliche Checkbox erneut. Für dieses vorbereitete Lernbeispiel werden wir die einzelne lokale Referenz danach ausdrücklich entfernen.',
        'Check the additional acknowledgement again. For this prepared learning example, we will then explicitly remove the single local reference.',
      ],
      '.branch-cleanup-force-confirm input',
      { prepare: seed(review), completion: element('.branch-cleanup-force-confirm input:checked') },
    ),
    s(
      'delete',
      ['Bestätige genau einen lokalen Branch', 'Confirm exactly one local branch'],
      [
        'Bestätige einen lokalen und null Server-Branches löschen. main, feature/fertig und fix/integriert gehören nicht zu diesem Löschumfang.',
        'Confirm Delete 1 local and 0 server branches. main, feature/fertig and fix/integriert are not part of this deletion scope.',
      ],
      button('confirm'),
      { prepare: seed(confirmed), completion: element('.branch-cleanup-results') },
    ),
    s(
      'result',
      ['Das Ergebnis nennt ausschließlich den bestätigten Namen', 'The result names only the confirmed branch'],
      [
        'Die Liste nennt feature/offene-arbeit als gelöscht. Die anderen lokalen Namen bleiben bestehen. Es wurde keine Arbeit in main übernommen und keine Server-Referenz verändert.',
        'The list identifies feature/offene-arbeit as deleted. The other local names remain. No work was integrated into main and no server reference changed.',
      ],
      '.branch-cleanup-results',
      { prepare: seed(results) },
    ),
    s(
      'done',
      ['Schließe die Ergebnisliste', 'Close the results list'],
      [
        'Wähle Fertig, um zur Branch-Liste zurückzukehren. Die abgeschlossene Löschfreigabe wird dabei nicht noch einmal ausgeführt.',
        'Choose Done to return to the branch list. The completed deletion authorization is not executed again.',
      ],
      button('confirm'),
      { prepare: seed(results), completion: { kind: 'absent', selector: dialog } },
    ),
    s(
      'history',
      ['main hat die zusätzliche Arbeit nicht übernommen', 'main did not integrate the extra work'],
      [
        'Der normale Graph zeigt wieder drei erreichbare Commits. HEAD steht weiter an main. Verlassene Commit-Objekte sind keine zugesicherte dauerhafte Sicherung; das Entfernen eines Namens ersetzt weder Merge noch Backup.',
        'The normal graph shows three reachable commits again. HEAD still belongs to main. Unreferenced commit objects are not a guaranteed permanent backup; removing a name replaces neither merge nor backup.',
      ],
      '.commit-row[data-commit-hash="' + practiceCommitHash(3) + '"]',
      { prepare: remainingSeed([manual]) },
    ),
    s(
      'working-state',
      ['Die übrigen Referenzen bleiben erhalten', 'The other references remain'],
      [
        'main bleibt aktiv. Die zwei bereits enthaltenen Namen und origin/main bestehen weiter, und der Arbeitsstand ist unverändert sauber. Nur die ausdrücklich bestätigte lokale Referenz wurde entfernt.',
        'main stays active. The two already-contained names and origin/main remain, and the working state stays clean and unchanged. Only the explicitly confirmed local reference was removed.',
      ],
      row('main', true),
      { prepare: remainingSeed([manual]) },
    ),
    s(
      'finish',
      ['Du kennst die getrennte Freigabe für offene Arbeit', 'You know the separate authorization for unmerged work'],
      [
        'Du hast einen manuellen Kandidaten ausgewählt, die zweite Warnung geprüft, die Freigabe gesetzt und beim Rückweg verworfen sowie den genauen Umfang erneut bestätigt. Weiter beendet die Lektion mit frisch wiederholbaren Beispieldaten.',
        'You selected a manual candidate, inspected the second warning, granted and discarded authorization on the way back, then confirmed the exact scope again. Next completes the lesson with independently repeatable example data.',
      ],
      panel,
      { prepare: remainingSeed([manual]) },
    ),
  ],
};
