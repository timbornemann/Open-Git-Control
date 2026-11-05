import type { TutorialChapter } from './types';
import {
  branchStep as s,
  branchControl as c,
  branchPanel as panel,
  branchRow as row,
  branchName as original,
  branchElement as element,
  branchValue as value,
} from './branchLessonHelpers';
import {
  branchManageRecipe as seed,
  renamedBranch as renamed,
  branchMenu as menu,
  branchAction as action,
  renameField as field,
  dialogAction as dialog,
} from './branchManageHelpers';
const menuClosed = { kind: 'absent' as const, selector: c('branch-menu') };
const dialogClosed = { kind: 'absent' as const, selector: '[role="dialog"]' };
export const TUTORIAL_BRANCHES_MANAGE: TutorialChapter = {
  id: 'branches-manage',
  section: 'repo',
  title: ['Branches umbenennen und bewusst löschen', 'Rename branches and delete deliberately'],
  description: [
    'Kontextmenü, Namensprüfung, Abbrechen, Umbenennen, aktiven und geschützten Hauptbranch sowie die Bestätigung einer lokalen Löschung einzeln üben.',
    'Practice the context menu, name validation, cancellation, renaming, active and protected primary branches, and confirmation of local deletion.',
  ],
  question: ['Wie benenne ich einen Branch um oder lösche ihn?', 'How do I rename or delete a branch?'],
  keywords: 'branch rename umbenennen löschen delete entfernen current aktiv hauptbranch protected schutz name abbrechen cancel escape tastatur kontextmenü',
  steps: [
    s(
      'overview',
      ['Ein Name lässt sich ändern oder entfernen', 'A name can be changed or removed'],
      [
        'Das Lernprojekt enthält zusätzlich feature/lernen am selben Commit wie main. Wir bearbeiten nur diesen vorbereiteten lokalen Namen und lassen die Arbeitsdateien unverändert. Noch nicht zusammengeführte Arbeit und Stapelbereinigung bekommen eigene Übungen.',
        'The learning project includes feature/lernen at the same commit as main. We will manage only this prepared local name and leave working files unchanged. Unmerged work and bulk cleanup have separate exercises.',
      ],
      panel,
      { continue: false, prepare: seed() },
    ),
    s(
      'branch-menu',
      ['Öffne die Aktionen des Übungsbranches', 'Open the practice branch’s actions'],
      [
        'Fokussiere feature/lernen und drücke Umschalt+F10; alternativ öffnet ein Rechtsklick dasselbe Menü. Die Menüüberschrift soll den gewählten Branch nennen.',
        'Focus feature/lernen and press Shift+F10; right-click opens the same menu. Its heading should name the selected branch.',
      ],
      row(original),
      { prepare: seed(), gesture: 'contextmenu', completion: element(menu(original)) },
    ),
    s(
      'menu-target',
      ['Das Menü gehört zum ausgewählten Namen', 'The menu belongs to the selected name'],
      [
        'Die Überschrift zeigt feature/lernen, während main aktiv bleibt. Checkout, Merge, Umbenennen und Löschen haben unterschiedliche Folgen. Jetzt wählen wir ausdrücklich das Umbenennen.',
        'The heading shows feature/lernen while main remains active. Checkout, merge, rename and delete have different effects. For now, we will choose Rename.',
      ],
      menu(original),
      { prepare: seed({ menu: original }) },
    ),
    s(
      'rename',
      ['Öffne den Umbenennen-Dialog', 'Open the Rename dialog'],
      [
        'Wähle Umbenennen im Kontextmenü. Der Dialog soll den bisherigen Namen anzeigen. Noch ist keine Referenz verändert.',
        'Choose Rename in the context menu. The dialog should show the existing name. No reference has changed yet.',
      ],
      action('rename'),
      { prepare: seed({ menu: original }), completion: element(field) },
    ),
    s(
      'existing-name',
      ['Der vorhandene Name ist vorbelegt', 'The existing name is prefilled'],
      [
        'Das Feld enthält feature/lernen. Umbenennen betrifft den lokalen Namen; es bearbeitet keine Dateien und veröffentlicht keinen neuen Remote-Branch.',
        'The field contains feature/lernen. Renaming affects the local name; it does not edit files or publish a new remote branch.',
      ],
      field,
      { prepare: seed({ dialog: 'rename' }) },
    ),
    s(
      'invalid-name',
      ['Probiere einen Namen mit Leerzeichen', 'Try a name containing a space'],
      [
        'Ersetze den Namen durch mein branch. Der Dialog soll die ungültige Schreibweise erkennen, bevor eine Änderung bestätigt werden kann.',
        'Replace the name with mein branch. The dialog should recognize the invalid syntax before the change can be confirmed.',
      ],
      field,
      { prepare: seed({ dialog: 'rename' }), completion: value(field, 'mein branch') },
    ),
    s(
      'invalid-explained',
      ['Die Eingabeprüfung verhindert die Bestätigung', 'Input validation prevents confirmation'],
      [
        'Das Leerzeichen ist in einem Branch-Namen nicht erlaubt. Die Bestätigung bleibt deaktiviert. Wir korrigieren den Namen, statt die Prüfung zu umgehen.',
        'A space is not allowed in a branch name. Confirmation remains disabled. We will correct the name.',
      ],
      field,
      { prepare: seed({ dialog: 'rename', value: 'mein branch' }) },
    ),
    s(
      'cancel-rename',
      ['Brich die erste Umbenennung bewusst ab', 'Cancel the first rename deliberately'],
      [
        'Wähle Abbrechen. Damit verwirfst du die ungültige Eingabe. Wir prüfen danach, dass der ursprüngliche Name bestehen bleibt.',
        'Choose Cancel to discard the invalid input. We will then check that the original name remains.',
      ],
      dialog('cancel'),
      { prepare: seed({ dialog: 'rename', value: 'mein branch' }), completion: { kind: 'all', conditions: [dialogClosed, element(row(original))] } },
    ),
    s(
      'unchanged',
      ['feature/lernen ist weiterhin vorhanden', 'feature/lernen is still present'],
      [
        'Der Dialog ist geschlossen, und der ursprüngliche Eintrag bleibt erhalten. Abbrechen hat weder einen zweiten Branch erstellt noch den Commit verschoben.',
        'The dialog is closed and the original entry remains. Cancel neither created a second branch nor moved the commit.',
      ],
      row(original),
      { prepare: seed() },
    ),
    s(
      'rename-menu',
      ['Öffne das Kontextmenü erneut', 'Open the context menu again'],
      [
        'Öffne wieder die Aktionen von feature/lernen. Dieses Mal werden wir die geprüfte Umbenennung bestätigen.',
        'Open feature/lernen’s actions again. This time we will confirm the validated rename.',
      ],
      row(original),
      { prepare: seed(), gesture: 'contextmenu', completion: element(menu(original)) },
    ),
    s(
      'rename-again',
      ['Wähle erneut Umbenennen', 'Choose Rename again'],
      [
        'Öffne noch einmal den Umbenennen-Dialog. Er beginnt wieder mit dem vorhandenen Branch-Namen.',
        'Open the Rename dialog again. It starts with the existing branch name.',
      ],
      action('rename'),
      { prepare: seed({ menu: original }), completion: element(field) },
    ),
    s(
      'new-name',
      ['Gib feature/kapitel ein', 'Enter feature/kapitel'],
      [
        'Trage feature/kapitel ein. Die gültige Eingabe soll die Bestätigung ermöglichen.',
        'Enter feature/kapitel. The valid input should enable confirmation.',
      ],
      ':is(' + field + ',' + row(renamed) + ')',
      { prepare: seed({ dialog: 'rename' }), completion: { kind: 'any', conditions: [value(field, renamed), element(row(renamed))] } },
    ),
    s(
      'confirm-rename',
      ['Bestätige die lokale Umbenennung', 'Confirm the local rename'],
      [
        'Bestätige Umbenennen. Danach soll feature/kapitel in der Liste stehen und feature/lernen verschwunden sein. main bleibt aktiv.',
        'Confirm Rename. Afterwards feature/kapitel should appear and feature/lernen should be gone. main remains active.',
      ],
      ':is(' + dialog('confirm') + ',' + row(renamed) + ')',
      {
        prepare: seed({ dialog: 'rename', value: renamed }),
        completion: { kind: 'all', conditions: [element(row(renamed)), element(panel + ':not(:has([data-branch-name="feature/lernen"]))')] },
      },
    ),
    s(
      'renamed',
      ['Der neue Name zeigt auf denselben Commit', 'The new name points to the same commit'],
      [
        'Der lokale Name lautet nun feature/kapitel. Der Dateistand ist gleich geblieben. Eine Umbenennung ist keine Zusammenführung und kein neuer Commit.',
        'The local name is now feature/kapitel. File contents remain unchanged. A rename is neither a merge nor a new commit.',
      ],
      row(renamed),
      { prepare: seed({ renamed: true }) },
    ),
    s(
      'current-menu',
      ['Untersuche die Aktionen des aktiven main', 'Inspect the active main branch’s actions'],
      [
        'Öffne das Kontextmenü von main. Er ist aktuell ausgecheckt; deshalb unterscheiden sich seine verfügbaren Aktionen von einem inaktiven Branch.',
        'Open main’s context menu. It is currently checked out, so its available actions differ from an inactive branch.',
      ],
      row('main'),
      { prepare: seed({ renamed: true }), gesture: 'contextmenu', completion: element(menu('main')) },
    ),
    s(
      'current-explained',
      ['Der aktive Branch wird nicht lokal gelöscht', 'The active branch is not deleted locally'],
      [
        'Für den aktuell ausgecheckten Branch wird keine Löschaktion angeboten. Vor einer regulären lokalen Löschung musst du auf einen anderen Branch wechseln.',
        'No Delete action is offered for the checked-out branch. Before ordinary local deletion, switch to another branch.',
      ],
      menu('main'),
      { prepare: seed({ renamed: true, menu: 'main' }) },
    ),
    s(
      'close-current',
      ['Schließe das Menü mit Escape', 'Close the menu with Escape'],
      [
        'Drücke Escape im Menü. Das beendet nur die Menüauswahl und ändert keinen Branch.',
        'Press Escape in the menu. This closes only the menu and changes no branch.',
      ],
      menu('main'),
      { prepare: seed({ renamed: true, menu: 'main' }), gesture: 'escape', completion: menuClosed },
    ),
    s(
      'switch-renamed',
      ['Wechsle vorübergehend zum umbenannten Branch', 'Switch temporarily to the renamed branch'],
      [
        'Klicke feature/kapitel. Wir können anschließend main als inaktiven Hauptbranch betrachten. Beide Namen zeigen hier auf denselben gespeicherten Stand.',
        'Click feature/kapitel. We can then inspect main as an inactive primary branch. Both names point to the same saved state here.',
      ],
      row(renamed),
      { prepare: seed({ renamed: true }), completion: element(row(renamed, true)) },
    ),
    s(
      'primary-menu',
      ['Öffne das Menü des jetzt inaktiven main', 'Open the now-inactive main branch’s menu'],
      [
        'Öffne erneut main per Kontextmenü. HEAD steht nun am Übungsbranch; main besitzt zusätzlich seinen Schutz als Hauptbranch.',
        'Open main’s context menu again. HEAD now belongs to the practice branch; main also has primary-branch protection.',
      ],
      row('main'),
      { prepare: seed({ renamed: true, active: true }), gesture: 'contextmenu', completion: element(menu('main')) },
    ),
    s(
      'primary-protection',
      ['Der Hauptbranch bleibt vor dem Löschen geschützt', 'The primary branch stays protected from deletion'],
      [
        'Die Löschaktion für main ist deaktiviert. Der Schutz gilt zusätzlich zur Prüfung des aktiven Branches und wird vor einem echten Schreibvorgang erneut geprüft. Wir versuchen ihn nicht zu umgehen.',
        'Delete is disabled for main. This protection is separate from the active-branch check and is rechecked before a real write. We will leave it protected.',
      ],
      action('delete'),
      { prepare: seed({ renamed: true, active: true, menu: 'main' }) },
    ),
    s(
      'close-primary',
      ['Beende die geschützte Menüauswahl', 'Close the protected branch’s menu'],
      ['Schließe das Menü mit Escape. main bleibt unverändert erhalten.', 'Close the menu with Escape. main remains unchanged.'],
      menu('main'),
      { prepare: seed({ renamed: true, active: true, menu: 'main' }), gesture: 'escape', completion: menuClosed },
    ),
    s(
      'return-main',
      ['Wechsle für die Übungslöschung zurück zu main', 'Return to main before practice deletion'],
      [
        'Klicke main. Der zusätzliche Übungsbranch ist danach inaktiv und kann gezielt entfernt werden.',
        'Click main. The additional practice branch will then be inactive and can be removed deliberately.',
      ],
      row('main'),
      { prepare: seed({ renamed: true, active: true }), completion: element(row('main', true)) },
    ),
    s(
      'delete-menu',
      ['Öffne die Aktionen von feature/kapitel', 'Open feature/kapitel’s actions'],
      [
        'Öffne das Kontextmenü des zusätzlichen Übungsbranches. Kontrolliere den Namen in der Überschrift, bevor du Löschen auswählst.',
        'Open the additional practice branch’s context menu. Check the heading before choosing Delete.',
      ],
      row(renamed),
      { prepare: seed({ renamed: true }), gesture: 'contextmenu', completion: element(menu(renamed)) },
    ),
    s(
      'delete',
      ['Öffne die Löschbestätigung', 'Open deletion confirmation'],
      [
        'Wähle Branch löschen. Es soll zunächst eine Bestätigung erscheinen; die Referenz wird noch nicht durch das Öffnen des Dialogs entfernt.',
        'Choose Delete branch. A confirmation should appear first; opening the dialog alone does not remove the reference.',
      ],
      action('delete'),
      { prepare: seed({ renamed: true, menu: renamed }), completion: element(dialog('confirm')) },
    ),
    s(
      'review-delete',
      ['Prüfe Ziel und aktiven Branch', 'Check the target and active branch'],
      [
        'Der Dialog nennt feature/kapitel als Ziel und main als aktiven Branch. Es geht um eine lokale Referenz. Die Arbeitsdateien und ein möglicher Server-Branch werden dadurch nicht gelöscht.',
        'The dialog names feature/kapitel as the target and main as the active branch. This concerns a local reference. It does not delete working files or a possible server branch.',
      ],
      '[role="dialog"]',
      { prepare: seed({ renamed: true, dialog: 'delete' }) },
    ),
    s(
      'cancel-delete',
      ['Brich die erste Löschung ab', 'Cancel the first deletion'],
      ['Wähle Abbrechen. Der lokale Übungsbranch soll weiterhin vorhanden bleiben.', 'Choose Cancel. The local practice branch should remain.'],
      dialog('cancel'),
      { prepare: seed({ renamed: true, dialog: 'delete' }), completion: { kind: 'all', conditions: [dialogClosed, element(row(renamed))] } },
    ),
    s(
      'kept-after-cancel',
      ['Die Referenz wurde nicht entfernt', 'The reference was not removed'],
      [
        'feature/kapitel ist noch in der Liste. Die Bestätigung ist eine echte Entscheidung und keine bloße Information nach einer bereits ausgeführten Löschung.',
        'feature/kapitel is still listed. Confirmation is a real decision, not merely information after deletion has already happened.',
      ],
      row(renamed),
      { prepare: seed({ renamed: true }) },
    ),
    s(
      'retry-menu',
      ['Öffne die Branch-Aktionen noch einmal', 'Open the branch actions once more'],
      [
        'Öffne wieder feature/kapitel. Dieses Mal bestätigen wir die gezielte Löschung des zusätzlichen lokalen Namens.',
        'Open feature/kapitel’s actions again. This time we will confirm removal of the additional local name.',
      ],
      row(renamed),
      { prepare: seed({ renamed: true }), gesture: 'contextmenu', completion: element(menu(renamed)) },
    ),
    s(
      'retry-delete',
      ['Wähle erneut Branch löschen', 'Choose Delete branch again'],
      ['Öffne die Bestätigung erneut. Der Zielname muss wieder feature/kapitel sein.', 'Open confirmation again. The target must still be feature/kapitel.'],
      action('delete'),
      { prepare: seed({ renamed: true, menu: renamed }), completion: element(dialog('confirm')) },
    ),
    s(
      'confirm-delete',
      ['Bestätige das Entfernen der lokalen Referenz', 'Confirm removal of the local reference'],
      [
        'Bestätige Branch löschen. Der Übungsbranch zeigt auf denselben bereits in main enthaltenen Commit; ein erzwungenes Löschen ist hier nicht nötig.',
        'Confirm Delete branch. This practice branch points to a commit already contained in main, so forced deletion is not needed here.',
      ],
      dialog('confirm'),
      {
        prepare: seed({ renamed: true, dialog: 'delete' }),
        completion: { kind: 'all', conditions: [dialogClosed, element(panel + ':not(:has([data-branch-name="feature/kapitel"]))')] },
      },
    ),
    s(
      'deleted',
      ['main und die Dateien bleiben erhalten', 'main and the files remain'],
      [
        'Der zusätzliche Name ist aus der lokalen Liste entfernt. main bleibt aktiv, und die gespeicherten Dateien sind weiterhin vorhanden. Das Löschen eines enthaltenen Branch-Namens löscht nicht automatisch die gemeinsame Historie.',
        'The additional name is gone from the local list. main remains active and the saved files remain. Deleting an already-contained branch name does not automatically delete shared history.',
      ],
      panel,
      { prepare: seed({ deleted: true }) },
    ),
    s(
      'finish',
      ['Du kannst lokale Branch-Namen bewusst verwalten', 'You can manage local branch names deliberately'],
      [
        'Du hast Umbenennen und Löschen jeweils abgebrochen und bestätigt sowie den aktiven und den geschützten Hauptbranch unterschieden. Weiter schließt diese Lektion ab. Nicht zusammengeführte Arbeit und Bereinigung folgen als getrennte Fälle.',
        'You cancelled and confirmed both rename and delete, and distinguished active-branch and primary-branch protection. Next completes this lesson. Unmerged work and cleanup are separate cases.',
      ],
      panel,
      { prepare: seed({ deleted: true }) },
    ),
  ],
};
