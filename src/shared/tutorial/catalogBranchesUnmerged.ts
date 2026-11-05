import type { TutorialChapter } from './types';
import { practiceCommitHash } from './exampleGitIds';
import { branchStep as s, branchPanel as panel, branchRow as row, branchElement as element } from './branchLessonHelpers';
import { branchMenu as menu, branchAction as action, dialogAction } from './branchManageHelpers';
import {
  branchUnmergedRecipe as seed,
  unmergedBranch as name,
  ordinaryDeleteDialog as ordinary,
  forceDeleteDialog as forced,
  deleteConfirm,
  forceConfirm,
} from './branchUnmergedHelpers';
const closed = { kind: 'absent' as const, selector: '[role="dialog"]' };
const fourthCommit = '.commit-row[data-commit-hash="' + practiceCommitHash(4) + '"]';
const thirdCommit = '.commit-row[data-commit-hash="' + practiceCommitHash(3) + '"]';
export const TUTORIAL_BRANCHES_UNMERGED: TutorialChapter = {
  id: 'branches-unmerged',
  section: 'repo',
  title: ['Nicht zusammengeführte Branches und Force-Delete', 'Unmerged branches and force deletion'],
  description: [
    'Prüfe einen Branch mit einem zusätzlichen Commit, erlebe die reguläre Löschprüfung und brich die zusätzliche Warnung zuerst ab.',
    'Inspect a branch containing an extra commit, encounter the ordinary deletion check and cancel the additional warning first.',
  ],
  question: ['Warum lässt sich ein Branch nicht löschen?', 'Why can’t I delete a branch?'],
  keywords: 'branch löschen delete force unmerged nicht zusammengeführt warnung abbruch cancel verlorener commit schutz',
  steps: [
    s(
      'overview',
      ['Ein Branch enthält noch eigene Arbeit', 'A branch still contains its own work'],
      [
        'main steht in dieser Übung am dritten Commit. feature/offene-arbeit zeigt auf den vierten, noch nicht in main enthaltenen Commit. Die Arbeitsdateien sind sauber; es geht um gespeicherte Historie, nicht um offene Editor-Änderungen.',
        'In this exercise main points to the third commit. feature/offene-arbeit points to the fourth commit, which main does not yet contain. The working files are clean; this concerns saved history rather than unsaved editor changes.',
      ],
      panel,
      { continue: false, prepare: seed() },
    ),
    s(
      'source-reference',
      ['Der Übungsbranch reicht einen Commit weiter', 'The practice branch reaches one commit further'],
      [
        'Der zusätzliche lokale Name gehört zur neueren gespeicherten Fassung. Sein Löschen würde diese Arbeit nicht in main übernehmen. Wir unterscheiden deshalb eine enthaltene Referenz von einem Branch mit eigener Arbeit.',
        'The additional local name belongs to the newer saved version. Deleting it would not bring its work into main. We therefore distinguish an already-contained reference from a branch with its own work.',
      ],
      row(name),
      { prepare: seed() },
    ),
    s(
      'extra-commit',
      ['Im Graphen bleibt der zusätzliche Commit sichtbar', 'The graph still shows the extra commit'],
      [
        'Der oberste Commit ist über feature/offene-arbeit erreichbar. main und origin/main zeigen auf seinen Vorgänger. Die vierte gespeicherte Fassung ist also nicht schon in diesen beiden Referenzen enthalten.',
        'The newest commit is reachable through feature/offene-arbeit. main and origin/main point to its parent. That newest saved revision is therefore not already contained in those two references.',
      ],
      fourthCommit,
      { prepare: seed() },
    ),
    s(
      'current-main',
      ['main bleibt der aktive Arbeitsstand', 'main remains the active working state'],
      [
        'HEAD steht an main. Eine Löschung des inaktiven Übungsbranches wird weder den aktiven Branch wechseln noch dessen Dateien auf den neueren Stand bringen.',
        'HEAD belongs to main. Deleting the inactive practice branch will neither switch the active branch nor bring its files to the newer state.',
      ],
      row('main', true),
      { prepare: seed() },
    ),
    s(
      'open-menu',
      ['Öffne die Aktionen von feature/offene-arbeit', 'Open feature/offene-arbeit’s actions'],
      [
        'Öffne das Kontextmenü des inaktiven Übungsbranches per Rechtsklick oder Umschalt+F10. Prüfe den Namen im Menü, bevor du eine Löschaktion wählst.',
        'Open the inactive practice branch’s context menu with right-click or Shift+F10. Check the menu’s branch name before choosing a deletion action.',
      ],
      row(name),
      { prepare: seed(), gesture: 'contextmenu', completion: element(menu(name)) },
    ),
    s(
      'delete',
      ['Fordere die reguläre lokale Löschung an', 'Request ordinary local deletion'],
      [
        'Wähle Branch löschen. Zunächst erscheint die normale Bestätigung für die lokale Referenz. Der zusätzliche Schutz vor nicht zusammengeführter Arbeit wird beim anschließenden Versuch geprüft.',
        'Choose Delete branch. First you see the ordinary confirmation for the local reference. The additional unmerged-work protection is checked when the operation is attempted.',
      ],
      action('delete'),
      { prepare: seed({ menu: true }), completion: element(ordinary) },
    ),
    s(
      'review',
      ['Prüfe den betroffenen und den aktiven Branch', 'Check the affected and active branches'],
      [
        'Die Bestätigung nennt feature/offene-arbeit als Löschziel und main als aktiven Branch. Es wird keine Server-Referenz entfernt und keine Zusammenführung ausgeführt.',
        'The confirmation identifies feature/offene-arbeit as the deletion target and main as the active branch. It removes no server reference and performs no merge.',
      ],
      ordinary + ' .dialog-context-list',
      { prepare: seed({ dialog: 'delete' }) },
    ),
    s(
      'try-regular',
      ['Bestätige den regulären Versuch', 'Confirm the ordinary attempt'],
      [
        'Bestätige Branch löschen. Weil main den zusätzlichen Commit nicht enthält, soll der reguläre Versuch die Referenz behalten und eine separate Force-Delete-Warnung öffnen.',
        'Confirm Delete branch. Because main does not contain the extra commit, the ordinary attempt should keep the reference and open a separate force-deletion warning.',
      ],
      deleteConfirm,
      { prepare: seed({ dialog: 'delete' }), completion: element(forced) },
    ),
    s(
      'not-merged',
      ['Der zusätzliche Commit verhindert die normale Löschung', 'The extra commit prevents ordinary deletion'],
      [
        'Die Warnung bedeutet: Der Branch ist noch nicht vollständig zusammengeführt. Er ist weiterhin vorhanden. Eine gewöhnliche Löschbestätigung hat die zusätzliche Prüfung nicht umgangen.',
        'The warning means that the branch is not fully merged. It still exists. Confirming ordinary deletion did not bypass the additional check.',
      ],
      forced + ' .dialog-message',
      { prepare: seed({ dialog: 'force' }) },
    ),
    s(
      'force-impact',
      ['Force-Delete übernimmt keine Arbeit', 'Force deletion does not integrate work'],
      [
        'Erzwungenes Löschen entfernt die lokale Referenz trotz der fehlenden Zusammenführung. Es erstellt weder einen Merge noch eine Sicherung. Verlassene Commits können später bereinigt werden; verlasse dich deshalb nicht auf ihre dauerhafte Wiederherstellbarkeit.',
        'Forced deletion removes the local reference despite the missing merge. It creates neither a merge nor a backup. Unreferenced commits can later be pruned, so do not rely on their permanent recoverability.',
      ],
      forced + ' .dialog-impact',
      { prepare: seed({ dialog: 'force' }) },
    ),
    s(
      'cancel-force',
      ['Brich die zusätzliche Warnung zuerst ab', 'Cancel the additional warning first'],
      [
        'Wähle Abbrechen. Damit lassen wir die eigene Arbeit am Übungsbranch erhalten. Auch eine bereits bestätigte reguläre Löschanfrage verpflichtet dich nicht zur erzwungenen Löschung.',
        'Choose Cancel. This keeps the practice branch’s own work. Having confirmed an ordinary deletion request does not require you to proceed with forced deletion.',
      ],
      forced + ' ' + dialogAction('cancel'),
      { prepare: seed({ dialog: 'force' }), completion: { kind: 'all', conditions: [closed, element(row(name))] } },
    ),
    s(
      'kept',
      ['Branch und zusätzlicher Commit sind erhalten', 'The branch and extra commit remain'],
      [
        'feature/offene-arbeit steht weiterhin in der Liste und der vierte Commit bleibt im Graphen erreichbar. main bleibt aktiv und seine Arbeitsdateien sind unverändert.',
        'feature/offene-arbeit is still listed and the fourth commit remains reachable in the graph. main stays active and its working files are unchanged.',
      ],
      row(name),
      { prepare: seed() },
    ),
    s(
      'retry-menu',
      ['Öffne denselben Branch erneut', 'Open the same branch again'],
      [
        'Nur für dieses isolierte Lernprojekt probieren wir nun auch die bestätigte erzwungene Löschung aus. Öffne erneut die Aktionen von feature/offene-arbeit.',
        'For this isolated learning project, we will also try confirmed forced deletion. Open feature/offene-arbeit’s actions again.',
      ],
      row(name),
      { prepare: seed(), gesture: 'contextmenu', completion: element(menu(name)) },
    ),
    s(
      'retry-delete',
      ['Wähle noch einmal Branch löschen', 'Choose Delete branch again'],
      [
        'Wähle erneut die lokale Löschaktion. Der Ablauf beginnt wieder mit der gewöhnlichen Bestätigung; der vorherige Abbruch hat keine Freigabe gespeichert.',
        'Choose the local deletion action again. The flow starts again with ordinary confirmation; the previous cancellation stored no authorization.',
      ],
      action('delete'),
      { prepare: seed({ menu: true }), completion: element(ordinary) },
    ),
    s(
      'retry-regular',
      ['Lass die Zusammenführungsprüfung erneut laufen', 'Run the merged-work check again'],
      [
        'Bestätige den normalen Versuch erneut. Die fehlende Zusammenführung muss wieder erkannt werden. Es wird weiterhin nicht automatisch auf Force-Delete gewechselt.',
        'Confirm the ordinary attempt again. The missing merge must be detected again. The operation still does not automatically proceed with forced deletion.',
      ],
      deleteConfirm,
      { prepare: seed({ dialog: 'delete' }), completion: element(forced) },
    ),
    s(
      'review-force',
      ['Prüfe die ausdrückliche Force-Delete-Auswahl', 'Review the explicit force-deletion choice'],
      [
        'Die zusätzliche Bestätigung betrifft wieder ausschließlich feature/offene-arbeit. In einer eigenen Arbeitsumgebung würdest du vor dieser Entscheidung prüfen, ob ihre Commits noch benötigt oder anderweitig gesichert sind.',
        'The additional confirmation again concerns only feature/offene-arbeit. In your own workspace, check whether its commits are still needed or saved elsewhere before making this decision.',
      ],
      forced + ' .dialog-context-list',
      { prepare: seed({ dialog: 'force' }) },
    ),
    s(
      'confirm-force',
      ['Entferne die Beispielreferenz ausdrücklich', 'Explicitly remove the example reference'],
      [
        'Bestätige jetzt Force-Delete. Wir entfernen ausschließlich die vorbereitete lokale Übungsreferenz. Danach soll sie verschwunden sein; main bleibt am dritten Commit aktiv.',
        'Now confirm Force-delete. We remove only the prepared local practice reference. Afterwards it should be gone while main remains active at the third commit.',
      ],
      forceConfirm,
      {
        prepare: seed({ dialog: 'force' }),
        completion: { kind: 'all', conditions: [closed, { kind: 'absent', selector: row(name) }, element(row('main', true))] },
      },
    ),
    s(
      'removed',
      ['Der Branch-Name ist entfernt', 'The branch name is removed'],
      [
        'Die lokale Liste enthält feature/offene-arbeit nicht mehr. Der aktive main und die entfernte Referenz origin/main sind erhalten. Das Löschen eines lokalen Branches ist keine Server-Löschung.',
        'The local list no longer contains feature/offene-arbeit. The active main and remote-tracking reference origin/main remain. Deleting a local branch is not server deletion.',
      ],
      panel,
      { prepare: seed({ deleted: true }) },
    ),
    s(
      'reachable-history',
      ['Der normale Graph zeigt nur noch erreichbare Historie', 'The normal graph now shows only reachable history'],
      [
        'Der vierte Commit hat in diesem Beispiel keine verbleibende Branch-Referenz. Deshalb zeigt der normale Graph jetzt drei erreichbare Commits. Sein Inhalt wurde nicht nach main kopiert.',
        'In this example the fourth commit has no remaining branch reference. The normal graph therefore now shows three reachable commits. Its contents were not copied into main.',
      ],
      thirdCommit,
      { prepare: seed({ deleted: true }) },
    ),
    s(
      'working-state',
      ['Der Arbeitsstand wurde nicht gewechselt', 'The working state did not switch'],
      [
        'HEAD steht weiterhin am dritten Commit von main. Sowohl Index als auch Arbeitsdateien bleiben sauber auf diesem Stand. Eine Referenzlöschung ersetzt keinen Checkout.',
        'HEAD still points to main’s third commit. Both index and working files remain clean at that state. Deleting a reference does not replace a checkout.',
      ],
      row('main', true),
      { prepare: seed({ deleted: true }) },
    ),
    s(
      'finish',
      ['Du kennst die zweite Löschentscheidung', 'You know the second deletion decision'],
      [
        'Du hast den regulären Versuch, die zusätzliche Warnung, Abbrechen und die ausdrückliche Force-Bestätigung durchlaufen. Weiter beendet diese Lektion. Jeder erneute Einstieg setzt ihre Beispieldaten frisch zurück.',
        'You completed the ordinary attempt, additional warning, cancellation and explicit forced confirmation. Next completes this lesson. Every fresh entry restores its example data.',
      ],
      panel,
      { prepare: seed({ deleted: true }) },
    ),
  ],
};
