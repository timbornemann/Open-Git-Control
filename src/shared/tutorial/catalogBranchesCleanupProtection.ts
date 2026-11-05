import type { TutorialChapter } from './types';
import { branchStep as s, branchPanel as panel, branchElement as element, branchValue as value } from './branchLessonHelpers';
import {
  branchCleanupRecipe as seed,
  cleanupMerged as merged,
  cleanupManual as manual,
  cleanupTrigger as trigger,
  cleanupMenuItem as menuItem,
  cleanupDialog as dialog,
  cleanupCandidate as candidate,
  cleanupCheckbox as checkbox,
  cleanupDialogAction as button,
  cleanupTarget as target,
  cleanupTargetId as targetId,
  cleanupProtection as field,
  cleanupSaveProtection as save,
  cleanupCustomPatterns as patterns,
  cleanupCustomText as text,
} from './branchCleanupHelpers';
const open = { open: 'dialog' as const };
const protection = { ...open, protection: true };
const protectedOpen = { ...protection, patterns };
export const TUTORIAL_BRANCHES_CLEANUP_PROTECTION: TutorialChapter = {
  id: 'branches-cleanup-protection',
  section: 'repo',
  title: ['Bereinigung: Vergleich und zusätzliche Schutzregeln', 'Cleanup: comparison and additional protection'],
  description: [
    'Wechsle das Vergleichsziel, speichere ein Branch-Muster und prüfe, wie sichere Vorauswahl und Löschschutz darauf reagieren.',
    'Change the comparison target, save a branch pattern and inspect how safe default selection and deletion protection respond.',
  ],
  question: ['Wie schütze ich zusätzliche Branches vor dem Aufräumen?', 'How do I protect additional branches from cleanup?'],
  keywords: 'branch cleanup schutz protection muster pattern stern wildcard vergleich target auswahl speichern dirty',
  steps: [
    s(
      'overview',
      ['Vergleich und Schutz haben verschiedene Aufgaben', 'Comparison and protection have different jobs'],
      [
        'Das Vergleichsziel bestimmt, welche Commits bereits enthalten sind. Schutzregeln können einen Kandidaten zusätzlich sperren. Wir ändern beide Einstellungen getrennt und löschen in dieser Lektion keinen Branch.',
        'The comparison target determines which commits are already contained. Protection rules can additionally block a candidate. We will change these settings separately and delete no branch in this lesson.',
      ],
      panel,
      { continue: false, prepare: seed() },
    ),
    s(
      'actions',
      ['Öffne die weiteren Branch-Aktionen', 'Open additional branch actions'],
      [
        'Öffne die drei Punkte über der Branch-Liste. Von dort gelangen wir wieder zur Prüfung für mehrere Branches.',
        'Open the three dots above the branch list. From there we return to the inspection for multiple branches.',
      ],
      trigger,
      { prepare: seed(), completion: element(menuItem) },
    ),
    s(
      'open',
      ['Öffne die Bereinigungsprüfung', 'Open the cleanup inspection'],
      [
        'Wähle Branches aufräumen. Zu Beginn gilt main als Vergleichsziel und die beiden enthaltenen lokalen Kandidaten sind ausgewählt.',
        'Choose Clean up branches. Initially main is the comparison target and the two contained local candidates are selected.',
      ],
      menuItem,
      { prepare: seed({ open: 'menu' }), completion: element(target) },
    ),
    s(
      'comparison',
      ['Ein Ziel beschreibt die Vergleichsbasis', 'A target defines the comparison basis'],
      [
        'main enthält die beiden vorgeschlagenen Branches, aber noch nicht feature/offene-arbeit. Die Liste bietet auch andere vorhandene lokale und entfernte Referenzen als Vergleich an.',
        'main contains the two suggested branches but not feature/offene-arbeit yet. The list also offers other existing local and remote-tracking references as comparison targets.',
      ],
      target,
      { prepare: seed(open) },
    ),
    s(
      'choose-target',
      ['Vergleiche vorübergehend mit feature/offene-arbeit', 'Temporarily compare against feature/offene-arbeit'],
      [
        'Wähle feature/offene-arbeit als Vergleich für lokale Branches. Die App prüft danach neu. Das ändert weder HEAD noch die Arbeitsdateien.',
        'Choose feature/offene-arbeit as the comparison for local branches. The app then inspects again. This changes neither HEAD nor the working files.',
      ],
      target,
      { prepare: seed(open), completion: value(target, targetId(manual)) },
    ),
    s(
      'open-kept-target',
      ['Untersuche den Schutz des Vergleichsziels', 'Inspect comparison-target protection'],
      [
        'Öffne Beibehalten / gesperrt. Das gewählte Vergleichsziel soll selbst nicht als Löschvorschlag auswählbar sein.',
        'Expand Keep / blocked. The chosen comparison target itself should not be selectable as a deletion suggestion.',
      ],
      '.branch-cleanup-kept > summary',
      { prepare: seed({ ...open, target: manual }), gesture: 'enter', completion: element('.branch-cleanup-kept[open]') },
    ),
    s(
      'target-protected',
      ['Enthalten bedeutet nicht automatisch löschbar', 'Contained does not automatically mean deletable'],
      [
        'feature/offene-arbeit ist im eigenen Zielverlauf enthalten, bleibt aber als Vergleichsziel gesperrt. main bleibt der aktive Branch. Eine andere Vergleichsbasis ist keine Zusammenführung.',
        'feature/offene-arbeit is contained in its own target history but remains blocked as the comparison target. main remains active. A different comparison basis is not a merge.',
      ],
      candidate(manual),
      { prepare: seed({ ...open, target: manual, kept: true }) },
    ),
    s(
      'restore-target',
      ['Stelle main als Vergleich wieder her', 'Restore main as the comparison'],
      [
        'Wähle wieder main. Danach hat feature/offene-arbeit erneut einen nicht enthaltenen Commit und wird nur zur manuellen Prüfung angeboten.',
        'Choose main again. feature/offene-arbeit will again have one uncontained commit and be offered only for manual review.',
      ],
      target,
      { prepare: seed({ ...open, target: manual }), completion: value(target, targetId('main')) },
    ),
    s(
      'manual',
      ['Die ursprüngliche Bewertung ist wieder da', 'The original classification is restored'],
      [
        'Der offene Branch ist wieder ungewählt und zeigt seinen zusätzlichen Commit außerhalb von main. Die beiden enthaltenen Vorschläge werden nach der Neuprüfung wieder sicher vorausgewählt.',
        'The unmerged branch is unselected again and shows its extra commit outside main. Reinspection safely preselects the two contained suggestions again.',
      ],
      candidate(manual),
      { prepare: seed(open) },
    ),
    s(
      'protection',
      ['Öffne den zusätzlichen Branch-Schutz', 'Open additional branch protection'],
      [
        'Klappe Zusätzlicher Branch-Schutz auf. Hier werden Namen und Muster des Repositorys verwaltet; sie sind von der Auswahl dieser einzelnen Prüfung getrennt.',
        'Expand Additional branch protection. This manages repository names and patterns separately from this inspection’s individual selection.',
      ],
      '.branch-cleanup-protection > summary',
      { prepare: seed(open), gesture: 'enter', completion: element('.branch-cleanup-protection[open]') },
    ),
    s(
      'defaults',
      ['Ein Name oder Muster pro Zeile', 'One name or pattern per line'],
      [
        'main, master, develop und development gehören zum eingebauten Schutz. Ein Stern steht für beliebige Zeichen. Ein vollständiger Name schützt nur diesen Namen; feature/* würde die gesamte Namensgruppe erfassen.',
        'main, master, develop and development belong to the built-in protection. An asterisk matches any characters. A full name protects that name; feature/* would cover the whole name group.',
      ],
      field,
      { prepare: seed(protection) },
    ),
    s(
      'pattern',
      ['Ergänze das Muster feature/*', 'Add the feature/* pattern'],
      [
        'Lass die vier eingebauten Zeilen stehen und ergänze darunter feature/*. Die Eingabe verändert zunächst nur den Schutzentwurf.',
        'Keep the four built-in lines and add feature/* below them. Typing initially changes only the protection draft.',
      ],
      field,
      { prepare: seed(protection), completion: value(field, text) },
    ),
    s(
      'dirty',
      ['Ein ungespeicherter Schutzentwurf sperrt die Löschung', 'An unsaved protection draft blocks deletion'],
      [
        'Die Löschaktion bleibt deaktiviert, solange die Muster von der geprüften Fassung abweichen. Zuerst muss der Schutz gespeichert und der Bestand erneut geprüft werden.',
        'Deletion stays disabled while the patterns differ from the inspected version. Protection must be saved and the inventory inspected again first.',
      ],
      button('confirm'),
      { prepare: seed({ ...protection, draftPatterns: text }) },
    ),
    s(
      'save',
      ['Speichere den Übungsschutz und prüfe neu', 'Save the practice protection and inspect again'],
      [
        'Wähle Schutz speichern und neu prüfen. Die geänderten Muster werden ausschließlich im isolierten Beispielprojekt übernommen. Die Neuprüfung passt Sperren und Vorauswahl an.',
        'Choose Save protection and inspect again. The changed patterns are saved only in the isolated example project. Reinspection updates safeguards and default selection.',
      ],
      save,
      { prepare: seed({ ...protection, draftPatterns: text }), completion: element(candidate(merged[0]) + '.is-blocked') },
    ),
    s(
      'open-protected',
      ['Öffne die neu gesperrten Einträge', 'Open the newly blocked entries'],
      [
        'Öffne Beibehalten / gesperrt, falls der Abschnitt geschlossen ist. Die beiden feature/-Namen sollen nun beide dem gespeicherten Muster entsprechen.',
        'Expand Keep / blocked if it is closed. Both feature/ names should now match the saved pattern.',
      ],
      '.branch-cleanup-kept > summary',
      { prepare: seed({ ...open, patterns }), gesture: 'enter', completion: element('.branch-cleanup-kept[open]') },
    ),
    s(
      'protected-merged',
      ['Auch ein enthaltener Branch kann zusätzlich geschützt sein', 'An already-contained branch can have additional protection'],
      [
        'feature/fertig bleibt im Vergleichsziel enthalten, ist wegen feature/* aber gesperrt und nicht mehr ausgewählt. Der Schutz ist ein eigener Grund neben dem historischen Vergleich.',
        'feature/fertig remains contained in the comparison target but is blocked by feature/* and no longer selected. Protection is a separate reason alongside the historical comparison.',
      ],
      candidate(merged[0]),
      { prepare: seed({ ...open, patterns, kept: true }) },
    ),
    s(
      'protected-manual',
      ['Das Muster schützt auch die offene Arbeit', 'The pattern also protects the unmerged work'],
      [
        'feature/offene-arbeit ist ebenfalls gesperrt. Die Checkbox bleibt deaktiviert; eine zusätzliche Force-Bestätigung würde einen gespeicherten Schutz nicht aufheben.',
        'feature/offene-arbeit is blocked too. Its checkbox stays disabled; additional forced confirmation would not override saved protection.',
      ],
      candidate(manual),
      { prepare: seed({ ...open, patterns, kept: true }) },
    ),
    s(
      'other-group',
      ['fix/integriert wird vom Muster nicht erfasst', 'The pattern does not cover fix/integriert'],
      [
        'Der fix/-Name entspricht nicht feature/* und bleibt als enthaltener Kandidat auswählbar. Die Zusammenfassung zählt deshalb jetzt nur noch eine lokale Vorauswahl.',
        'The fix/ name does not match feature/* and remains selectable as a contained candidate. The summary therefore now counts only one preselected local branch.',
      ],
      candidate(merged[1]),
      { prepare: seed({ ...open, patterns }) },
    ),
    s(
      'edit-again',
      ['Öffne den gespeicherten Schutz erneut', 'Open the saved protection again'],
      [
        'Falls der zusätzliche Schutz geschlossen ist, klappe ihn auf. Nun sollen die tatsächlich gespeicherten fünf Zeilen angezeigt werden; wir stellen anschließend die eingebauten Vorgaben wieder her.',
        'If additional protection is closed, expand it. It should now show the five actually saved lines. We will then restore the built-in defaults.',
      ],
      '.branch-cleanup-protection > summary',
      { prepare: seed({ ...open, patterns }), gesture: 'enter', completion: element('.branch-cleanup-protection[open]') },
    ),
    s(
      'clear',
      ['Entferne die benutzerdefinierten Eingaben', 'Remove the custom entries'],
      [
        'Leere das ganze Feld. Der eingebaute Schutz wird dadurch nicht dauerhaft entfernt. Beim Speichern ergänzt die App ihre vier Pflichtnamen wieder.',
        'Clear the entire field. This does not permanently remove built-in protection. Saving restores the app’s four mandatory names.',
      ],
      field,
      { prepare: seed(protectedOpen), completion: value(field, '') },
    ),
    s(
      'save-defaults',
      ['Speichere die Rückkehr zu den Vorgaben', 'Save the return to defaults'],
      [
        'Wähle erneut Schutz speichern und neu prüfen. Nur das zusätzliche feature/*-Muster wird entfernt; der eingebaute Schutz bleibt erhalten.',
        'Choose Save protection and inspect again. Only the additional feature/* pattern is removed; built-in protection remains.',
      ],
      save,
      { prepare: seed({ ...protectedOpen, draftPatterns: '' }), completion: element(checkbox(merged[0]) + ':not(:disabled):checked') },
    ),
    s(
      'defaults-again',
      ['Die sichere Auswahl entspricht wieder dem Anfang', 'The safe selection matches the initial state again'],
      [
        'feature/fertig und fix/integriert sind wieder vorausgewählt. main bleibt gesperrt, und offene Arbeit bleibt ungewählt. Falls nötig, klappe Zusätzlicher Branch-Schutz auf, um die wieder ergänzten Pflichtnamen zu prüfen.',
        'feature/fertig and fix/integriert are preselected again. main stays blocked and unmerged work stays unselected. If needed, expand Additional branch protection to inspect the restored mandatory names.',
      ],
      '.branch-cleanup-protection > summary',
      { prepare: seed(open), gesture: 'enter', completion: element('.branch-cleanup-protection[open]') },
    ),
    s(
      'mandatory',
      ['Die vier eingebauten Namen sind wieder eingetragen', 'The four built-in names are restored'],
      [
        'Das Feld enthält wieder main, master, develop und development. Die App hat den leeren Entwurf beim Speichern normalisiert. Dieser Schutz bleibt auch ohne zusätzliche Muster bestehen.',
        'The field again contains main, master, develop and development. The app normalized the empty draft when saving. This protection remains without additional patterns.',
      ],
      field,
      { prepare: seed(protection) },
    ),
    s(
      'cancel',
      ['Schließe die Prüfung ohne Löschung', 'Close the inspection without deletion'],
      [
        'Wähle Abbrechen. Die vorbereiteten Branches sollen vollständig erhalten bleiben. Die Schutzänderungen dieser Lektion betrafen nur die simulierte Umgebung.',
        'Choose Cancel. All prepared branches should remain. This lesson’s protection changes affected only the simulated environment.',
      ],
      button('cancel'),
      { prepare: seed(protection), completion: { kind: 'absent', selector: dialog } },
    ),
    s(
      'finish',
      ['Du kannst Vergleich und zusätzliche Sperren unterscheiden', 'You can distinguish comparison from additional safeguards'],
      [
        'Du hast ein anderes Vergleichsziel geprüft, dessen Schutz gesehen, ein Muster gespeichert, seine Wirkung kontrolliert und die Vorgaben wiederhergestellt. Weiter beendet die Lektion; es wurde kein Branch gelöscht.',
        'You inspected another comparison target and its protection, saved a pattern, checked its effect and restored the defaults. Next completes this lesson; no branch was deleted.',
      ],
      panel,
      { prepare: seed() },
    ),
  ],
};
