import type { TutorialChapter } from './types';
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
  cleanupTarget as target,
} from './branchCleanupHelpers';
const open = { open: 'dialog' as const };
const selected = (name: string, checked: boolean) => element(checkbox(name) + (checked ? ':checked' : ':not(:checked)'));
const closed = { kind: 'absent' as const, selector: dialog };
const result = { ...open, result: true };
export const TUTORIAL_BRANCHES_CLEANUP: TutorialChapter = {
  id: 'branches-cleanup',
  section: 'repo',
  title: ['Branches aufräumen: Prüfung und Auswahl', 'Clean up branches: inspection and selection'],
  description: [
    'Prüfe Vergleichsziel, Vorschläge und Schutzgründe; ändere die Auswahl, brich ab und bestätige nur enthaltene lokale Branches.',
    'Inspect the comparison target, suggestions and safeguards; change the selection, cancel and confirm only already-contained local branches.',
  ],
  question: ['Wie räume ich mehrere lokale Branches auf?', 'How do I clean up multiple local branches?'],
  keywords: 'branches aufräumen cleanup bereinigen merged auswahl vergleich target prüfen abbrechen geschützt stapel bulk lokal',
  steps: [
    s(
      'overview',
      ['Erst prüfen, dann gezielt aufräumen', 'Inspect first, then clean up selectively'],
      [
        'main steht hier am dritten Commit. feature/fertig und fix/integriert sind darin enthalten; feature/offene-arbeit enthält noch einen zusätzlichen Commit. Wir bereinigen nur die enthaltenen lokalen Namen. Die Server-Löschung erhält eine eigene Hosting-Übung.',
        'main points to the third commit. feature/fertig and fix/integriert are already contained in it; feature/offene-arbeit contains an extra commit. We will clean up only the contained local names. Server deletion has a separate hosting exercise.',
      ],
      panel,
      { continue: false, prepare: seed() },
    ),
    s(
      'actions',
      ['Öffne die weiteren Branch-Aktionen', 'Open the additional branch actions'],
      [
        'Fokussiere die drei Punkte in der Überschrift der Branch-Liste und drücke Enter. Ein Klick öffnet dasselbe Menü. Diese Aktionen betreffen die Verwaltung mehrerer Branches.',
        'Focus the three dots in the branch-list heading and press Enter. A click opens the same menu. These actions manage multiple branches.',
      ],
      trigger,
      { prepare: seed(), gesture: 'enter', completion: element(menuItem) },
    ),
    s(
      'menu',
      ['Aufräumen beginnt mit einer Prüfung', 'Cleanup begins with an inspection'],
      [
        'Branches aufräumen öffnet eine eigene Vorschau mit Vergleichszielen und einer Auswahl. Das Öffnen allein löscht keine Referenz. Wir prüfen zunächst den vorgeschlagenen Umfang.',
        'Clean up branches opens a separate inspection with comparison targets and a selection. Opening it alone deletes no reference. We will inspect the suggested scope first.',
      ],
      menuItem,
      { prepare: seed({ open: 'menu' }) },
    ),
    s(
      'open',
      ['Öffne Branches aufräumen', 'Open Clean up branches'],
      [
        'Wähle Branches aufräumen. Warte, bis die lokale Prüfung abgeschlossen ist und die Kandidaten mit ihren Gründen erscheinen.',
        'Choose Clean up branches. Wait for the local inspection to finish and show the candidates with their reasons.',
      ],
      menuItem,
      { prepare: seed({ open: 'menu' }), completion: element(target) },
    ),
    s(
      'repository',
      ['Die Prüfung gehört zum angezeigten Repository', 'The inspection belongs to the displayed repository'],
      [
        'Oben steht der Pfad des OGC-Lernprojekts. Auswahl und Prüfung beziehen sich auf dieses Repository. In dieser Einführung stammen sämtliche Daten aus dem isolierten Beispielspeicher.',
        'The OGC learning project’s path appears at the top. The selection and inspection belong to that repository. Throughout this introduction, all data comes from the isolated example store.',
      ],
      '.branch-cleanup-repository',
      { prepare: seed(open) },
    ),
    s(
      'comparison',
      ['main ist das Vergleichsziel', 'main is the comparison target'],
      [
        'Die Prüfung fragt, ob die Commits eines Kandidaten bereits in main enthalten sind. Ein Vergleichsziel ist keine Aufforderung zum Checkout und führt keine Zusammenführung aus.',
        'The inspection asks whether a candidate’s commits are already contained in main. A comparison target does not request a checkout or perform a merge.',
      ],
      target,
      { prepare: seed(open) },
    ),
    s(
      'suggestion',
      ['Lies den Nachweis für einen Vorschlag', 'Read the evidence for a suggestion'],
      [
        'feature/fertig wird als zusammengeführt angezeigt: Seine gespeicherten Commits sind im Vergleichsziel enthalten. Hash, Datum, Vergleich und Begründung helfen bei der Prüfung. Ein alter Name allein wäre kein Nachweis.',
        'feature/fertig is marked as merged because its saved commits are contained in the comparison target. Hash, date, target and reason help you inspect it. An old name alone would not prove this.',
      ],
      candidate(merged[0]),
      { prepare: seed(open) },
    ),
    s(
      'defaults',
      ['Nur enthaltene, ungesperrte Kandidaten sind vorausgewählt', 'Only contained, unblocked candidates are preselected'],
      [
        'Die Zusammenfassung zählt zwei lokale und keine Server-Branches. feature/offene-arbeit ist nicht vorausgewählt, weil seine eigene Arbeit noch nicht im Ziel enthalten ist.',
        'The summary counts two local and no server branches. feature/offene-arbeit is not preselected because its own work is not yet contained in the target.',
      ],
      '.branch-cleanup-summary',
      { prepare: seed(open) },
    ),
    s(
      'uncheck',
      ['Nimm feature/fertig aus der Auswahl', 'Remove feature/fertig from the selection'],
      [
        'Entferne das Häkchen bei feature/fertig. Damit änderst du nur den geplanten Umfang; der Branch selbst bleibt vorerst bestehen.',
        'Uncheck feature/fertig. This changes only the planned scope; the branch itself remains for now.',
      ],
      checkbox(merged[0]),
      { prepare: seed(open), completion: selected(merged[0], false) },
    ),
    s(
      'remaining',
      ['Die Zusammenfassung folgt deiner Auswahl', 'The summary follows your selection'],
      [
        'Jetzt ist nur fix/integriert ausgewählt. Die Löschbeschriftung im Fußbereich nennt denselben Umfang. Kontrolliere diese Anzahl vor der Bestätigung.',
        'Only fix/integriert is selected now. The deletion label in the footer names the same scope. Check this count before confirming.',
      ],
      '.branch-cleanup-summary',
      { prepare: seed({ ...open, selected: [merged[1]] }) },
    ),
    s(
      'select-merged',
      ['Wähle die enthaltenen lokalen Vorschläge wieder aus', 'Select the contained local suggestions again'],
      [
        'Wähle Zusammengeführte auswählen bei den lokalen Vorschlägen. Dadurch werden nur geeignete, ungesperrte Kandidaten dieser Gruppe hinzugefügt; offene Arbeit bleibt ungewählt.',
        'Choose Select merged in Local suggestions. This adds only eligible, unblocked candidates from that group; unmerged work stays unselected.',
      ],
      '[data-cleanup-select-merged="local"]',
      { prepare: seed({ ...open, selected: [merged[1]] }), completion: { kind: 'all', conditions: merged.map((name) => selected(name, true)) } },
    ),
    s(
      'kept',
      ['Öffne die Gründe für beibehaltene Branches', 'Open the reasons for kept branches'],
      [
        'Klappe Beibehalten / gesperrt auf. Gesperrte Kandidaten werden getrennt gezeigt und können nicht ausgewählt werden.',
        'Expand Keep / blocked. Blocked candidates appear separately and cannot be selected.',
      ],
      '.branch-cleanup-kept > summary',
      { prepare: seed(open), gesture: 'enter', completion: element('.branch-cleanup-kept[open]') },
    ),
    s(
      'current',
      ['main bleibt aktiv und geschützt', 'main stays active and protected'],
      [
        'Die Checkbox von main ist deaktiviert. Er ist aktuell ausgecheckt und außerdem Hauptbranch und Vergleichsziel. Eine Stapelauswahl hebt diese Schutzgründe nicht auf.',
        'main’s checkbox is disabled. It is checked out and is also the primary branch and comparison target. A bulk selection does not remove those safeguards.',
      ],
      candidate('main'),
      { prepare: seed({ ...open, kept: true }) },
    ),
    s(
      'close-kept',
      ['Klappe die Schutzliste wieder zu', 'Collapse the safeguards list again'],
      [
        'Schließe Beibehalten / gesperrt über dieselbe Überschrift. Das ändert weder die Prüfung noch die Auswahl der beiden enthaltenen Vorschläge.',
        'Close Keep / blocked using the same heading. This changes neither the inspection nor the selection of the two contained suggestions.',
      ],
      '.branch-cleanup-kept > summary',
      { prepare: seed({ ...open, kept: true }), gesture: 'enter', completion: element('.branch-cleanup-kept:not([open])') },
    ),
    s(
      'cancel',
      ['Brich den ersten Bereinigungslauf ab', 'Cancel the first cleanup'],
      [
        'Wähle Abbrechen. Wir schließen die Vorschau ohne Löschung und kontrollieren anschließend die unveränderte Branch-Liste.',
        'Choose Cancel. We close the inspection without deleting anything, then check the unchanged branch list.',
      ],
      button('cancel'),
      { prepare: seed(open), completion: closed },
    ),
    s(
      'retained',
      ['Alle vorbereiteten Namen sind noch da', 'All prepared names remain'],
      [
        'feature/fertig, fix/integriert und feature/offene-arbeit sind weiterhin vorhanden. Das Öffnen, Filtern der Auswahl und Abbrechen haben keine Referenz entfernt.',
        'feature/fertig, fix/integriert and feature/offene-arbeit remain. Opening the inspection, changing its selection and cancelling removed no reference.',
      ],
      panel,
      { prepare: seed() },
    ),
    s(
      'reopen-actions',
      ['Öffne die Branch-Aktionen erneut', 'Open branch actions again'],
      [
        'Öffne wieder das Menü mit den drei Punkten. Dieses Mal führen wir eine bewusst geprüfte lokale Bereinigung zu Ende.',
        'Open the three-dot menu again. This time we will finish a deliberately reviewed local cleanup.',
      ],
      trigger,
      { prepare: seed(), completion: element(menuItem) },
    ),
    s(
      'reopen',
      ['Starte eine frische Prüfung', 'Start a fresh inspection'],
      [
        'Wähle erneut Branches aufräumen. Die neue Prüfung stellt ihre eigene Auswahl zusammen und verwendet keine gespeicherte Löschfreigabe vom abgebrochenen Versuch.',
        'Choose Clean up branches again. The new inspection prepares its own selection and uses no saved deletion authorization from the cancelled attempt.',
      ],
      menuItem,
      { prepare: seed({ open: 'menu' }), completion: element(target) },
    ),
    s(
      'clear-feature',
      ['Leere zunächst das erste Häkchen', 'Clear the first checkbox'],
      [
        'Entferne erneut feature/fertig aus der Auswahl. Wir probieren jetzt auch den leeren Auswahlzustand aus.',
        'Remove feature/fertig from the selection again. We will also try the empty-selection state.',
      ],
      checkbox(merged[0]),
      { prepare: seed(open), completion: selected(merged[0], false) },
    ),
    s(
      'clear-fix',
      ['Entferne auch fix/integriert', 'Remove fix/integriert too'],
      [
        'Entferne das zweite Häkchen. Keine ausgewählte Referenz bedeutet, dass es noch keinen bestätigbaren Löschumfang gibt.',
        'Clear the second checkbox. With no selected reference, there is no deletion scope to confirm.',
      ],
      checkbox(merged[1]),
      { prepare: seed({ ...open, selected: [merged[1]] }), completion: selected(merged[1], false) },
    ),
    s(
      'empty',
      ['Ohne Auswahl bleibt Löschen deaktiviert', 'Deletion remains disabled without a selection'],
      [
        'Die Zusammenfassung zählt null Branches, und die Löschaktion ist deaktiviert. Eine leere Auswahl löst keine pauschale Bereinigung des Repositorys aus.',
        'The summary counts zero branches and deletion is disabled. An empty selection does not trigger a repository-wide cleanup.',
      ],
      button('confirm'),
      { prepare: seed({ ...open, selected: [] }) },
    ),
    s(
      'select-one',
      ['Wähle gezielt fix/integriert', 'Select fix/integriert explicitly'],
      [
        'Setze nur das Häkchen von fix/integriert. Einzelne Kandidaten lassen sich unabhängig von der Gruppenauswahl zusammenstellen.',
        'Check only fix/integriert. You can select individual candidates independently of group selection.',
      ],
      checkbox(merged[1]),
      { prepare: seed({ ...open, selected: [] }), completion: selected(merged[1], true) },
    ),
    s(
      'single',
      ['Nur ein lokaler Branch wäre betroffen', 'Only one local branch would be affected'],
      [
        'Der Umfang beträgt jetzt eine lokale Referenz. Vor dem endgültigen Versuch probieren wir noch Erneut prüfen aus, damit du die Wirkung einer frischen Prüfung kennst.',
        'The scope is now one local reference. Before the final attempt, we will try Inspect again so you can see the effect of a fresh inspection.',
      ],
      '.branch-cleanup-summary',
      { prepare: seed({ ...open, selected: [merged[1]] }) },
    ),
    s(
      'refresh',
      ['Lies Prüfung und Auswahl erneut ein', 'Read the inspection and selection again'],
      [
        'Wähle Erneut prüfen. Dadurch wird der aktuelle Stand neu bewertet und die sichere Vorauswahl neu erstellt. Eine manuelle Teilmenge bleibt dabei nicht als Löschfreigabe erhalten.',
        'Choose Inspect again. This reevaluates the current state and rebuilds the safe default selection. A manual subset is not retained as deletion authorization.',
      ],
      button('secondary'),
      { prepare: seed({ ...open, selected: [merged[1]] }), completion: { kind: 'all', conditions: merged.map((name) => selected(name, true)) } },
    ),
    s(
      'review-final',
      ['Prüfe die frische Auswahl vor dem Löschen', 'Review the fresh selection before deletion'],
      [
        'Wieder sind genau zwei lokale, enthaltene Branches ausgewählt. main ist geschützt und feature/offene-arbeit bleibt ungewählt. Wir bestätigen jetzt diesen Umfang.',
        'Exactly two contained local branches are selected again. main is protected and feature/offene-arbeit stays unselected. We will now confirm this scope.',
      ],
      '.branch-cleanup-summary',
      { prepare: seed(open) },
    ),
    s(
      'delete',
      ['Bestätige die zwei enthaltenen lokalen Namen', 'Confirm the two contained local names'],
      [
        'Bestätige zwei lokale und null Server-Branches löschen. Die gespeicherten Commits dieser beiden Namen sind bereits in main enthalten; eine zusätzliche Force-Freigabe ist dafür nicht nötig.',
        'Confirm Delete 2 local and 0 server branches. The two names’ saved commits are already contained in main, so no additional forced authorization is needed.',
      ],
      button('confirm'),
      { prepare: seed(open), completion: element('.branch-cleanup-results') },
    ),
    s(
      'results',
      ['Jeder Kandidat bekommt ein eigenes Ergebnis', 'Each candidate receives its own outcome'],
      [
        'Die Ergebnisliste nennt feature/fertig und fix/integriert einzeln als gelöscht. Bei echten Vorgängen kann eine Auswahl auch gemischte Ergebnisse enthalten; prüfe deshalb die Einträge und nicht nur die Gesamtsumme.',
        'The results list identifies feature/fertig and fix/integriert individually as deleted. Real operations can have mixed outcomes, so inspect the entries as well as the total.',
      ],
      '.branch-cleanup-results',
      { prepare: seed(result) },
    ),
    s(
      'done',
      ['Schließe die Ergebnisansicht mit Fertig', 'Close the results with Done'],
      [
        'Wähle Fertig. Die Bestätigung schließt jetzt die Ergebnisansicht; sie startet keinen zweiten Löschversuch.',
        'Choose Done. Confirmation now closes the results; it does not start another deletion attempt.',
      ],
      button('confirm'),
      { prepare: seed(result), completion: closed },
    ),
    s(
      'remaining-refs',
      ['Aktiver Branch und offene Arbeit bleiben erhalten', 'The active branch and unmerged work remain'],
      [
        'main und feature/offene-arbeit sind erhalten. Der zusätzliche Commit ist weiterhin über den offenen Branch erreichbar. Die Bereinigung hat weder die Arbeitsdateien verändert noch dessen Arbeit zusammengeführt.',
        'main and feature/offene-arbeit remain. The extra commit is still reachable through the unmerged branch. Cleanup changed no working files and did not merge its work.',
      ],
      row(manual),
      { prepare: remainingSeed(merged) },
    ),
    s(
      'finish',
      ['Du kannst einen geprüften Bereinigungsumfang festlegen', 'You can choose a reviewed cleanup scope'],
      [
        'Du hast Vorschläge, Vergleich, Schutzgründe, Einzel- und Gruppenauswahl, Abbrechen, Neuprüfung und die Ergebnisliste ausprobiert. Weiter beendet die Lektion. Zusätzlicher Schutz und nicht übernommene Arbeit werden separat geübt.',
        'You tried suggestions, comparison, safeguards, individual and group selection, cancellation, reinspection and results. Next completes this lesson. Additional protection and unmerged work have separate exercises.',
      ],
      panel,
      { prepare: remainingSeed(merged) },
    ),
  ],
};
