import type { TutorialChapter } from './types';
import { recoveryStep as s, recoveryControl as c, recoveryList, recoveryNavigation, recoveryEntry } from './recoveryLessonHelpers';
import { messageRecoveryRecipe as recipe, messageRecoveryName as name, messageRecoverySuccess } from './messageRecoveryLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
import { graphRow, commitPanel } from './historyLessonHelpers';
import { branchControl } from './branchLessonHelpers';
const sourceValue = (value: string, count: number) => ({
  kind: 'all' as const,
  conditions: [{ kind: 'value' as const, selector: c('source'), value: [value, value] as const }, element(recoveryList(count))],
});
export const TUTORIAL_RECOVERY_MESSAGE: TutorialChapter = {
  id: 'recovery-message',
  section: 'repo',
  title: ['Die Sicherung vor einer Nachrichtenkorrektur wiederfinden', 'Find the backup from before a message edit'],
  description: [
    'Reflog und Nachrichtensicherung trennen, Filter zurücksetzen und die ursprüngliche Historie auf einem zusätzlichen Branch öffnen.',
    'Distinguish reflog and message backup, reset filters and open the original history on an additional branch.',
  ],
  question: ['Wo finde ich die Sicherung vor dem Bearbeiten einer Commit-Nachricht?', 'Where do I find the backup from before editing a commit message?'],
  keywords: 'recovery sicherung backup nachricht bearbeiten reword original ursprünglich wiederherstellen quellfilter source history branch',
  steps: [
    s(
      'scope',
      ['Eine Nachrichtenkorrektur hat die lokale Historie ersetzt', 'A message edit replaced local history'],
      [
        'Das Beispiel enthält bereits die korrigierte Nachricht des früheren dritten Commits. main zeigt auf den neuen Folgecommit. Die vorherige Historie bleibt als eigene Nachrichtensicherung erhalten.',
        'The example already contains the corrected message of the former third commit. main points to the new following commit. The previous history remains available as a separate message backup.',
      ],
      '[data-tutorial="graph"]',
      { prepare: recipe() },
    ),
    s(
      'head',
      ['Der neue HEAD gehört zur korrigierten Historie', 'The new HEAD belongs to the corrected history'],
      [
        'main steht auf dem neuen Folgecommit. Die alte dritte und vierte Fassung fehlen ohne normale Referenz im Graphen. Wir suchen jetzt bewusst die Sicherung von davor.',
        'main points to the new following commit. Without a normal reference the old third and fourth versions are absent from the graph. We will deliberately look for the earlier backup.',
      ],
      mergeHead(6),
      { prepare: recipe() },
    ),
    s(
      'find',
      ['Öffne das Recovery Center', 'Open the Recovery Center'],
      [
        'Öffne Recovery Center neben der Commit-Suche. Bei wenig Platz führt der Weg über das ⋯-Menü.',
        'Open Recovery Center beside commit search. In a compact view use the ⋯ menu.',
      ],
      recoveryNavigation,
      { prepare: recipe(), completion: element(recoveryList(6)) },
    ),
    s(
      'source',
      ['Wähle zwischen Verlauf und Nachrichtensicherungen', 'Choose between history and message backups'],
      [
        'Dieser Filter erscheint, weil eine Nachrichtensicherung vorhanden ist. Alle Wiederherstellungspunkte zeigt den lokalen Reflog und die ausdrücklich gespeicherte Sicherung gemeinsam.',
        'This filter appears because a message backup exists. All recovery points shows both the local reflog and the explicitly saved backup.',
      ],
      c('source'),
      { prepare: recipe('center') },
    ),
    s(
      'history',
      ['Zeige zunächst nur den lokalen Git-Verlauf', 'First show only local Git history'],
      [
        'Wähle Lokaler Git-Verlauf. Die fünf aufgezeichneten HEAD-Stände bleiben sichtbar; der zusätzliche Sicherungseintrag wird ausgeblendet.',
        'Choose Local Git history. The five recorded HEAD states remain visible; the additional backup entry is hidden.',
      ],
      c('source'),
      { prepare: recipe('center'), completion: sourceValue('history', 5) },
    ),
    s(
      'history-explained',
      ['Ein Verlaufseintrag ist nicht die eigene Sicherungsreferenz', 'A history entry is not the separate backup reference'],
      [
        'Der Reflog kann ebenfalls alte Commits enthalten. Die Nachrichtenkorrektur bewahrt ihren ursprünglichen HEAD zusätzlich unter einer eigenen Referenz, die wir als eigene Quelle auswählen können.',
        'The reflog can contain old commits too. Message editing additionally preserves its original HEAD under a separate reference that can be selected as its own source.',
      ],
      c('list'),
      { prepare: recipe('history') },
    ),
    s(
      'backup',
      ['Zeige die Sicherung vor der Nachrichtenänderung', 'Show the backup from before the message edit'],
      [
        'Wähle Sicherungen vor Nachrichtenänderungen. Genau eine Sicherung für den ursprünglichen Branch main bleibt übrig.',
        'Choose Backups before message edits. Exactly one backup for the original main branch remains.',
      ],
      c('source'),
      { prepare: recipe('history'), completion: sourceValue('backup', 1) },
    ),
    s(
      'original-head',
      ['Gesichert wurde der ursprüngliche vierte HEAD', 'The original fourth HEAD was backed up'],
      [
        'Die Sicherung zeigt auf den alten vierten Commit, nicht nur auf den bearbeiteten dritten. Dadurch bleiben auch dessen ursprüngliche Vorgänger und die alte Folgecommit-Kette erreichbar.',
        'The backup points to the old fourth commit, not just the edited third one. This also preserves its original parents and the old following-commit chain.',
      ],
      recoveryEntry(4, 'backup'),
      { prepare: recipe('backup') },
    ),
    s(
      'missing',
      ['Suche innerhalb der gewählten Quelle', 'Search within the selected source'],
      [
        'Schreibe keine-beispielsicherung. Textsuche und Quellenfilter wirken zusammen; ohne Treffer ist die Sicherung weiterhin vorhanden.',
        'Enter keine-beispielsicherung. Text search and the source filter work together; no matches does not remove the backup.',
      ],
      c('search'),
      {
        prepare: recipe('backup'),
        completion: {
          kind: 'all',
          conditions: [{ kind: 'value', selector: c('search'), value: ['keine-beispielsicherung', 'keine-beispielsicherung'] }, element(recoveryList(0))],
        },
      },
    ),
    s(
      'show-all',
      ['Setze beide Filter gemeinsam zurück', 'Reset both filters together'],
      [
        'Klicke Alle Einträge anzeigen. Das leert die Suche und setzt die Quelle wieder auf Alle Wiederherstellungspunkte.',
        'Click Show all entries. This clears the search and changes the source back to All recovery points.',
      ],
      c('show-all'),
      { prepare: recipe('empty'), completion: sourceValue('all', 6) },
    ),
    s(
      'all-again',
      ['Der ursprüngliche und der korrigierte Stand bleiben erhalten', 'Both the original and corrected revisions remain available'],
      [
        'Die sechs Einträge umfassen wieder Reflog und Nachrichtensicherung. Filtern hat weder main noch die Sicherungsreferenz verschoben.',
        'The six entries again include reflog and message backup. Filtering moved neither main nor the backup reference.',
      ],
      c('list'),
      { prepare: recipe('center') },
    ),
    s(
      'backup-again',
      ['Wähle die Sicherungsquelle erneut', 'Select the backup source again'],
      [
        'Wähle erneut Sicherungen vor Nachrichtenänderungen, damit die weitere Aktion eindeutig zur alten Historie gehört.',
        'Choose Backups before message edits again so the next action clearly applies to the old history.',
      ],
      c('source'),
      { prepare: recipe('center'), completion: sourceValue('backup', 1) },
    ),
    s(
      'details',
      ['Öffne die Git-Details dieser Sicherung', 'Open this backup’s Git details'],
      [
        'Klappe Git-Details auf. Die technische Referenz unterscheidet sich vom normalen HEAD@{…}-Eintrag.',
        'Expand Git details. The technical reference differs from a normal HEAD@{…} entry.',
      ],
      c('git-details') + ' > summary',
      { prepare: recipe('backup'), gesture: 'enter', completion: element(c('git-details') + '[open]') },
    ),
    s(
      'reference',
      ['Die eigene Referenz hält die alte Historie erreichbar', 'The separate reference keeps old history reachable'],
      [
        'refs/ogc/commit-reword/… ist die von der App angelegte Sicherungsreferenz. Sie bewahrt den ursprünglichen Stand unabhängig davon, wo main nach der Korrektur steht.',
        'refs/ogc/commit-reword/… is the app’s backup reference. It preserves the original revision independently of where main points after the edit.',
      ],
      c('reference'),
      { prepare: recipe('details') },
    ),
    s(
      'hash',
      ['Der vollständige Hash gehört zum ursprünglichen HEAD', 'The full hash belongs to the original HEAD'],
      [
        'Dieser Hash bezeichnet den alten vierten Commit. Der neue Folgecommit auf main hat einen anderen Hash, obwohl seine gespeicherten Dateien gleich sind.',
        'This hash identifies the old fourth commit. The new following commit on main has a different hash even though its saved files are the same.',
      ],
      c('full-hash'),
      { prepare: recipe('details') },
    ),
    s(
      'action',
      ['Der Eintrag nennt den ursprünglich gesicherten Branch', 'The entry names the originally backed-up branch'],
      [
        'Nachrichten-Sicherung: main beschreibt die Herkunft dieser Sicherung. Sie wechselt beim späteren Öffnen eines Recovery-Branches nicht ihr Ziel.',
        'Message backup: main describes this backup’s origin. Opening a recovery branch later does not change its target.',
      ],
      c('git-action'),
      { prepare: recipe('details') },
    ),
    s(
      'close-details',
      ['Schließe die technischen Angaben wieder', 'Close the technical details again'],
      ['Klappe Git-Details zu. Die ausgewählte Sicherung bleibt erhalten.', 'Collapse Git details. The selected backup stays available.'],
      c('git-details') + ' > summary',
      { prepare: recipe('details'), gesture: 'enter', completion: element(c('git-details') + ':not([open])') },
    ),
    s(
      'branch-purpose',
      ['Öffne die alte Historie auf einem zusätzlichen Branch', 'Open old history on an additional branch'],
      [
        'Ein neuer Branch am alten vierten Commit bewahrt die ursprüngliche Nachricht und ihre Nachfolger. Die korrigierte Historie auf main bleibt daneben erhalten.',
        'A new branch at the old fourth commit preserves the original message and its descendants. The corrected history on main remains alongside it.',
      ],
      c('branch-purpose'),
      { prepare: recipe('backup') },
    ),
    s(
      'name',
      ['Gib dem zusätzlichen Branch einen eigenen Namen', 'Give the additional branch its own name'],
      [
        'Schreibe recovery/vor-nachricht. Der Name macht deutlich, dass dieser Branch den Stand vor der Nachrichtenänderung bewahrt.',
        'Enter recovery/vor-nachricht. The name makes clear that this branch preserves the revision from before the message edit.',
      ],
      c('branch-name'),
      { prepare: recipe('backup'), completion: { kind: 'value', selector: c('branch-name'), value: [name, name] } },
    ),
    s(
      'preview',
      ['Prüfe den ursprünglichen Zielcommit', 'Check the original target commit'],
      [
        'Die Vorschau verbindet den alten vierten Commit mit recovery/vor-nachricht. Die Eingabe allein hat noch keinen Branch erstellt.',
        'The preview connects the old fourth commit with recovery/vor-nachricht. Entering the name alone has not created a branch.',
      ],
      c('branch-preview'),
      { prepare: recipe('named') },
    ),
    s(
      'cancel',
      ['Kehre zunächst ohne Wiederherstellung zum Graphen zurück', 'First return to the graph without recovering'],
      [
        'Klicke Zurück zum Graph. Ein noch nicht erstellter Branch ist ein Formulareintrag, keine Git-Änderung.',
        'Click Back to graph. A branch that has not been created is a form entry, not a Git change.',
      ],
      '[data-tutorial="close-recovery"]',
      { prepare: recipe('named'), completion: element(mergeHead(6)) },
    ),
    s(
      'cancelled',
      ['main bleibt auf der korrigierten Historie', 'main remains on the corrected history'],
      [
        'Die Rückkehr hat weder den aktuellen Branch gewechselt noch die Sicherung gelöscht. Die neue Historie mit ihrem korrigierten Dokumentationscommit bleibt aktiv.',
        'Returning neither switched the current branch nor deleted the backup. The new history with its corrected documentation commit remains active.',
      ],
      mergeHead(6),
      { prepare: recipe('cancelled') },
    ),
    s(
      'find-again',
      ['Öffne die vorhandene Sicherung erneut', 'Open the existing backup again'],
      [
        'Öffne Recovery Center erneut. Die Quelle startet wieder mit allen Einträgen; der verworfene Namensentwurf ist keine gespeicherte Branch-Erstellung.',
        'Open Recovery Center again. The source starts with all entries again; the discarded name draft is not a saved branch creation.',
      ],
      recoveryNavigation,
      { prepare: recipe('cancelled'), completion: element(recoveryList(6)) },
    ),
    s(
      'backup-final',
      ['Begrenze die Aktion wieder auf die Nachrichtensicherung', 'Limit the action to the message backup again'],
      [
        'Wähle Sicherungen vor Nachrichtenänderungen. Prüfe den ursprünglichen vierten Hash als Ziel.',
        'Choose Backups before message edits. Check the original fourth hash as the target.',
      ],
      c('source'),
      { prepare: recipe('center'), completion: sourceValue('backup', 1) },
    ),
    s(
      'name-again',
      ['Trage den gewünschten Branch-Namen erneut ein', 'Enter the desired branch name again'],
      ['Schreibe erneut recovery/vor-nachricht.', 'Enter recovery/vor-nachricht again.'],
      c('branch-name'),
      { prepare: recipe('backup'), completion: { kind: 'value', selector: c('branch-name'), value: [name, name] } },
    ),
    s(
      'restore',
      ['Erstelle und öffne den Branch an der alten Sicherung', 'Create and open the branch at the old backup'],
      [
        'Klicke Branch erstellen & öffnen. main soll seine neue Historie behalten, während der zusätzliche Branch die alte Historie öffnet.',
        'Click Create branch & open. main should retain its new history while the additional branch opens the old one.',
      ],
      c('create-branch'),
      { prepare: recipe('named'), completion: { kind: 'text', selector: '.recovery-center__notice--success p', value: messageRecoverySuccess } },
    ),
    s(
      'backup-retained',
      ['Die Sicherung bleibt auch nach dem Öffnen erhalten', 'The backup is retained after opening it'],
      [
        'Der Quellenfilter zeigt weiterhin dieselbe ursprüngliche Nachrichtensicherung. Der neue Branch macht ihre Historie zusätzlich über eine normale Branch-Referenz erreichbar.',
        'The source filter still shows the same original message backup. The new branch additionally makes its history reachable through a normal branch reference.',
      ],
      recoveryEntry(4, 'backup'),
      { prepare: recipe('created') },
    ),
    s(
      'return',
      ['Prüfe beide Historien im normalen Graphen', 'Inspect both histories in the normal graph'],
      ['Klicke Zurück zum Graph. Der neue Recovery-Branch bleibt aktiv.', 'Click Back to graph. The new recovery branch stays active.'],
      '[data-tutorial="close-recovery"]',
      { prepare: recipe('created'), completion: element(mergeHead(4)) },
    ),
    s(
      'main-preserved',
      ['main bewahrt weiterhin den neuen Folgecommit', 'main still preserves the new following commit'],
      [
        'main steht weiterhin am neuen Folgecommit mit korrigiertem Vorgänger. recovery/vor-nachricht zeigt dagegen auf den ursprünglichen vierten Commit. Beide Ketten sind jetzt normal erreichbar.',
        'main still points to the new following commit with its corrected parent. recovery/vor-nachricht points to the original fourth commit instead. Both chains are now normally reachable.',
      ],
      graphRow(6) + ' .commit-refs',
      { prepare: recipe('result') },
    ),
    s(
      'inspector',
      ['Öffne den Inspector für den Nachrichtenvergleich', 'Open the inspector to compare messages'],
      [
        'Öffne den rechten Inspector. Eine Commit-Auswahl zeigt Details, ohne den aktiven Branch zu wechseln.',
        'Open the right inspector. Selecting a commit shows details without switching the active branch.',
      ],
      branchControl('inspector-toggle'),
      { prepare: recipe('result'), completion: element(branchControl('inspector-toggle') + '[aria-expanded="true"]') },
    ),
    s(
      'select-new',
      ['Wähle den korrigierten Dokumentationscommit', 'Select the corrected documentation commit'],
      [
        'Wähle den neu geschriebenen Dokumentationscommit, der zum main-Zweig gehört.',
        'Select the rewritten documentation commit belonging to the main history.',
      ],
      graphRow(5),
      {
        prepare: { ...recipe('result'), actions: [...recipe('result').actions!, { expand: branchControl('inspector-toggle') }] },
        completion: element(commitPanel(5)),
      },
    ),
    s(
      'new-message',
      ['Die korrigierte Nachricht bleibt auf main erhalten', 'The corrected message stays on main'],
      [
        'Hier steht die präzisierte Beschreibung des Lernprojekts. Das Öffnen des alten Recovery-Branches hat diesen Commit nicht rückgängig gemacht.',
        'This shows the clarified learning-project description. Opening the old recovery branch did not undo this commit.',
      ],
      '.commit-details-description',
      { prepare: recipe('new-commit') },
    ),
    s(
      'select-old',
      ['Wähle die ursprüngliche Dokumentationsfassung', 'Select the original documentation version'],
      [
        'Wähle jetzt den alten dritten Dokumentationscommit aus der Recovery-Historie.',
        'Now select the old third documentation commit from the recovered history.',
      ],
      graphRow(3),
      { prepare: recipe('new-commit'), completion: element(commitPanel(3)) },
    ),
    s(
      'old-message',
      ['Die Sicherung hat die ursprüngliche Nachricht bewahrt', 'The backup preserved the original message'],
      [
        'Titel und Beschreibung entsprechen der Fassung vor der Korrektur. Die Dateiinhalte beider Fassungen sind gleich; deshalb ist der Unterschied an Nachricht und Hash zu erkennen.',
        'The title and description match the version before the edit. Both versions have identical file contents, so the difference is in their messages and hashes.',
      ],
      '.commit-details-description',
      { prepare: recipe('old-commit') },
    ),
    s(
      'finish',
      ['Ursprüngliche und korrigierte Historie sind getrennt erreichbar', 'Original and corrected history are separately reachable'],
      [
        'Du hast Quellenfilter, Sicherungsreferenz, Abbrechen und Wiederherstellen auf einem zusätzlichen Branch geprüft. Es wurde kein Server verändert. Weiter beendet die Lektion.',
        'You checked the source filter, backup reference, cancellation and recovery on an additional branch. No server was changed. Next finishes this lesson.',
      ],
      mergeHead(4),
      { prepare: recipe('result') },
    ),
  ],
};
