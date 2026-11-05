import type { TutorialChapter } from './types';
import {
  recoveryStep as s,
  recoveryRecipe as recipe,
  recoveryControl as c,
  recoveryEntry,
  recoveryDetail,
  recoveryList,
  recoveryNavigation,
  recoveryName,
  recoverySuccess,
} from './recoveryLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer, hash } from './historyLessonHelpers';
import { branchControl } from './branchLessonHelpers';
import { fileControl } from './fileLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
const opened = { open: true };
const selected = { open: true, selected: true };
const named = { ...selected, name: recoveryName };
const created = { ...named, created: true };
const graph = { ...created, graph: true };
const commit = { ...graph, commit: true };
const file = { ...commit, file: true };
export const TUTORIAL_RECOVERY: TutorialChapter = {
  id: 'recovery',
  section: 'repo',
  title: ['Einen früheren Commit finden und auf einem neuen Branch öffnen', 'Find an earlier commit and open it on a new branch'],
  description: [
    'Reflog, Suche, Hash, Git-Details und Branch-Namen prüfen und den gespeicherten Stand sicher wieder erreichbar machen.',
    'Inspect the reflog, search, hash, Git details and branch name, then safely make a saved revision reachable again.',
  ],
  question: ['Wie finde ich einen verlorenen Commit und arbeite damit weiter?', 'How do I find a lost commit and continue working on it?'],
  keywords: 'recovery wiederherstellung reflog verloren lost reset branch retten suchen hash git details sicher wiederherstellen',
  steps: [
    s(
      'scope',
      ['Ein früherer Reset hat main zurückgesetzt', 'An earlier reset moved main back'],
      [
        'In diesem vorbereiteten Beispiel wurde main vom vierten auf den zweiten Commit zurückgesetzt. Die gespeicherten älteren Objekte existieren noch. Wir machen den früheren Stand auf einem zusätzlichen Branch wieder erreichbar.',
        'In this prepared example main was reset from the fourth to the second commit. The earlier saved objects still exist. We will make the former revision reachable again on an additional branch.',
      ],
      '[data-tutorial="graph"]',
      { prepare: recipe() },
    ),
    s(
      'current',
      ['Der normale Graph zeigt jetzt nur die erreichbare Historie', 'The normal graph now shows only reachable history'],
      [
        'HEAD und origin/main stehen am zweiten Commit. Der dritte und vierte Commit haben hier keine normale Referenz mehr. Ihr Fehlen im Graphen bedeutet nicht, dass sie sofort gelöscht wurden.',
        'HEAD and origin/main point to the second commit. The third and fourth commits no longer have a normal reference here. Their absence from the graph does not mean they were immediately deleted.',
      ],
      mergeHead(2),
      { prepare: recipe() },
    ),
    s(
      'find',
      ['Öffne das Recovery Center', 'Open the Recovery Center'],
      [
        'Öffne Recovery Center über das Verlaufssymbol neben der Commit-Suche. Bei wenig Platz öffnest du zuerst das ⋯-Menü und wählst dort Recovery Center.',
        'Open Recovery Center using the history icon beside commit search. In a compact view first open the ⋯ menu and choose Recovery Center there.',
      ],
      recoveryNavigation,
      { prepare: recipe(), completion: element(recoveryList(5)) },
    ),
    s(
      'history',
      ['Der Reflog bewahrt frühere HEAD-Bewegungen', 'The reflog records earlier HEAD movements'],
      [
        'Die Liste enthält den Reset und die vorherigen gespeicherten Commits. Sie ist lokal und hat eine begrenzte Aufbewahrung. Sichere einen wichtigen Stand rechtzeitig mit einem Branch.',
        'The list contains the reset and previous saved commits. It is local and retained for a limited time. Preserve an important revision with a branch in time.',
      ],
      c('list'),
      { prepare: recipe(opened) },
    ),
    s(
      'refresh',
      ['Aktualisieren liest die vorhandenen Punkte neu ein', 'Refresh reloads the existing points'],
      [
        'Mit diesem Knopf kannst du den lokalen Verlauf erneut einlesen, etwa nach einer externen Git-Aktion. Er erstellt keinen neuen Wiederherstellungspunkt und sichert keine offenen Dateiänderungen.',
        'Use this button to reload local history, for example after an external Git action. It creates no new recovery point and does not back up open file changes.',
      ],
      c('refresh'),
      { prepare: recipe(opened) },
    ),
    s(
      'types',
      ['Aktion und Zielcommit sind unterschiedliche Angaben', 'Action and target commit are different information'],
      [
        'Der jüngste Eintrag beschreibt den Reset auf den zweiten Commit. Die älteren Commit-Einträge beschreiben gespeicherte Arbeiten. Ein Hash kann deshalb in mehreren Einträgen vorkommen.',
        'The latest entry describes the reset to the second commit. Older commit entries describe saved work. A hash can therefore appear in multiple entries.',
      ],
      recoveryEntry(2, 'reset'),
      { prepare: recipe(opened) },
    ),
    s(
      'search-purpose',
      ['Suche in Nachricht, Hash oder Datum', 'Search by message, hash or date'],
      [
        'Die Suche filtert die Wiederherstellungspunkte, nicht den normalen Graphen. Die vollständigen Angaben und die Referenz werden ebenfalls berücksichtigt.',
        'Search filters recovery points rather than the normal graph. Full details and references are included too.',
      ],
      c('search'),
      { prepare: recipe(opened) },
    ),
    s(
      'search',
      ['Suche die früheren Feature-Commits', 'Search the earlier feature commits'],
      ['Schreibe feat: in das Suchfeld. Zwei gespeicherte Commit-Einträge bleiben übrig.', 'Enter feat: in the search field. Two saved commit entries remain.'],
      c('search'),
      {
        prepare: recipe(opened),
        completion: { kind: 'all', conditions: [{ kind: 'value', selector: c('search'), value: ['feat:', 'feat:'] }, element(recoveryList(2))] },
      },
    ),
    s(
      'matches',
      ['Die Suche verändert keine Referenz', 'Searching changes no reference'],
      [
        'Die beiden Treffer sind der frühere vierte Begrüßungscommit und der zweite App-Commit. main bleibt während der Suche auf dem zweiten Commit.',
        'The two matches are the former fourth greeting commit and the second app commit. main stays on the second commit while searching.',
      ],
      c('list'),
      { prepare: recipe({ ...opened, query: 'feat:' }) },
    ),
    s(
      'compare-second',
      ['Vergleiche zunächst mit dem zweiten App-Commit', 'First compare with the second app commit'],
      [
        'Wähle den zweiten Treffer „feat: App anlegen“. Die Details wechseln zum zweiten Commit, ohne eine Wiederherstellung auszuführen.',
        'Select the second result, “feat: add app”. The details switch to the second commit without performing recovery.',
      ],
      recoveryEntry(2),
      { prepare: recipe({ ...opened, query: 'feat:' }), completion: element(recoveryDetail(2)) },
    ),
    s(
      'choose',
      ['Wähle den früheren Begrüßungscommit', 'Select the former greeting commit'],
      [
        'Wähle den Commit „feat: Begrüßung ergänzen“. Rechts erscheinen seine Wiederherstellungsoptionen.',
        'Select “feat: update greeting”. Its recovery options appear in the details pane.',
      ],
      recoveryEntry(4),
      { prepare: recipe({ ...opened, query: 'feat:', selected: 2 }), completion: element(recoveryDetail(4)) },
    ),
    s(
      'selection',
      ['Prüfe Nachricht, Kurz-Hash und Datum', 'Check the message, short hash and date'],
      [
        'Der Kopfbereich nennt den ausgewählten gespeicherten Stand. Eine Auswahl allein öffnet noch keine alten Arbeitsdateien und verschiebt keinen Branch.',
        'The heading identifies the selected saved revision. Selecting it alone does not open old working files or move a branch.',
      ],
      '.recovery-center__selection-meta',
      { prepare: recipe(selected) },
    ),
    s(
      'details',
      ['Klappe die Git-Details auf', 'Expand Git details'],
      [
        'Öffne Git-Details. Hier kannst du Referenz, vollständigen Hash und ursprüngliche Git-Aktion prüfen.',
        'Open Git details to inspect the reference, full hash and original Git action.',
      ],
      c('git-details') + ' > summary',
      { prepare: recipe(selected), gesture: 'enter', completion: element(c('git-details') + '[open]') },
    ),
    s(
      'reference',
      ['Die Referenz bezeichnet diesen Verlaufseintrag', 'The reference identifies this history entry'],
      [
        'HEAD@{…} bezeichnet eine Position im lokal aufgezeichneten Verlauf. Neue Vorgänge können diese Position verschieben; für die Wiederherstellung verwendet die App den ausgewählten Commit-Hash.',
        'HEAD@{…} identifies a position in locally recorded history. New operations can shift that position; recovery uses the selected commit hash.',
      ],
      c('reference'),
      { prepare: recipe({ ...selected, details: true }) },
    ),
    s(
      'hash',
      ['Der vollständige Hash bezeichnet den gespeicherten Commit', 'The full hash identifies the saved commit'],
      [
        'Dieser vollständige Hash gehört zum früheren vierten Commit. Er ist das Ziel für den neuen Branch, unabhängig von der aktuellen Reflog-Position.',
        'This full hash belongs to the former fourth commit. It is the target for the new branch, independently of the current reflog position.',
      ],
      c('full-hash'),
      { prepare: recipe({ ...selected, details: true }) },
    ),
    s(
      'git-action',
      ['Die Git-Aktion erklärt, wie der Eintrag entstand', 'The Git action explains how the entry was created'],
      [
        'commit: und der gespeicherte Titel zeigen, dass dieser Punkt beim Speichern des Begrüßungscommits entstand. Andere Einträge können etwa einen Branchwechsel oder Reset beschreiben.',
        'commit: and the saved title show that this point was recorded when the greeting commit was saved. Other entries can describe a branch switch or reset.',
      ],
      c('git-action'),
      { prepare: recipe({ ...selected, details: true }) },
    ),
    s(
      'close-details',
      ['Klappe die technischen Angaben wieder zu', 'Collapse the technical details again'],
      [
        'Schließe Git-Details. Der gewählte Commit und die Wiederherstellungsoptionen bleiben erhalten.',
        'Close Git details. The selected commit and recovery options remain available.',
      ],
      c('git-details') + ' > summary',
      { prepare: recipe({ ...selected, details: true }), gesture: 'enter', completion: element(c('git-details') + ':not([open])') },
    ),
    s(
      'clear-search',
      ['Leere die Nachrichtensuche', 'Clear the message search'],
      [
        'Entferne den Suchtext mit dem Kreuz am Suchfeld. Alle fünf Verlaufseinträge werden wieder sichtbar.',
        'Remove the search text using the cross in the search field. All five history entries become visible again.',
      ],
      c('clear-search'),
      {
        prepare: recipe({ ...selected, query: 'feat:' }),
        completion: { kind: 'all', conditions: [{ kind: 'value', selector: c('search'), value: ['', ''] }, element(recoveryList(5))] },
      },
    ),
    s(
      'missing',
      ['Probiere eine Suche ohne Treffer', 'Try a search with no matches'],
      [
        'Schreibe kein-passender-lernstand. Die leere Trefferliste löscht keine gespeicherten Punkte.',
        'Enter kein-passender-lernstand. An empty result list deletes no saved points.',
      ],
      c('search'),
      {
        prepare: recipe(selected),
        completion: {
          kind: 'all',
          conditions: [{ kind: 'value', selector: c('search'), value: ['kein-passender-lernstand', 'kein-passender-lernstand'] }, element(recoveryList(0))],
        },
      },
    ),
    s(
      'empty',
      ['Ohne Treffer ist nur der Filter zu eng', 'No matches means the filter is too narrow'],
      [
        'Die gespeicherten Objekte bleiben erhalten. Du kannst einen anderen Begriff eingeben oder mit Alle Einträge anzeigen die Filter zurücksetzen.',
        'Saved objects remain intact. Enter a different query or use Show all entries to reset the filters.',
      ],
      '.recovery-center__history-list .recovery-center__empty',
      { prepare: recipe({ ...opened, query: 'kein-passender-lernstand' }) },
    ),
    s(
      'show-all',
      ['Zeige die vorhandenen Einträge wieder an', 'Show the existing entries again'],
      [
        'Klicke Alle Einträge anzeigen. Die Suche wird geleert und alle Verlaufspunkte erscheinen wieder.',
        'Click Show all entries. The search is cleared and all history points reappear.',
      ],
      c('show-all'),
      { prepare: recipe({ ...opened, query: 'kein-passender-lernstand' }), completion: element(recoveryList(5)) },
    ),
    s(
      'hash-search',
      ['Finde genau den früheren vierten Commit', 'Find exactly the former fourth commit'],
      [
        'Schreibe den hervorgehobenen Kurz-Hash ' + hash(4).slice(0, 7) + ' in die Suche. Der passende gespeicherte Commit bleibt übrig.',
        'Enter the highlighted short hash ' + hash(4).slice(0, 7) + ' into search. The matching saved commit remains.',
      ],
      c('search'),
      {
        prepare: recipe(opened),
        completion: {
          kind: 'all',
          conditions: [{ kind: 'value', selector: c('search'), value: [hash(4).slice(0, 7), hash(4).slice(0, 7)] }, element(recoveryList(1))],
        },
      },
    ),
    s(
      'select-again',
      ['Der eindeutig gefundene Stand wird angezeigt', 'The uniquely found revision is displayed'],
      [
        'Der verbleibende Commit wird in den Details angezeigt. Prüfe vor jeder Wiederherstellung, dass es der gewünschte Stand ist.',
        'The remaining commit is displayed in the details. Before every recovery, check that it is the desired revision.',
      ],
      recoveryEntry(4),
      { prepare: recipe({ ...opened, query: hash(4).slice(0, 7) }) },
    ),
    s(
      'branch-purpose',
      ['Ein neuer Branch bewahrt den aktuellen Branch', 'A new branch preserves the current branch'],
      [
        'Branch erstellen & öffnen erzeugt einen zusätzlichen lokalen Branch am gewählten Commit und wechselt dorthin. main wird dabei nicht zurück auf den alten Stand verschoben.',
        'Create branch & open creates an additional local branch at the selected commit and switches to it. It does not move main back to the old revision.',
      ],
      c('branch-purpose'),
      { prepare: recipe(selected) },
    ),
    s(
      'default-name',
      ['Der vorgeschlagene Name enthält den Kurz-Hash', 'The suggested name contains the short hash'],
      [
        'Der Vorschlag recovery-' + hash(4).slice(0, 7) + ' hilft bei der Zuordnung. Du kannst einen aussagekräftigen eigenen Namen wählen.',
        'The suggestion recovery-' + hash(4).slice(0, 7) + ' helps identify the revision. You can choose your own descriptive name.',
      ],
      c('branch-name'),
      { prepare: recipe(selected) },
    ),
    s(
      'empty-name',
      ['Prüfe die Pflichtangabe für den Branch-Namen', 'Check the required branch name'],
      ['Leere das Namensfeld. Ohne gültigen Namen bleibt die Aktion deaktiviert.', 'Clear the name field. Without a valid name the action stays disabled.'],
      c('branch-name'),
      { prepare: recipe(selected), completion: { kind: 'value', selector: c('branch-name'), value: ['', ''] } },
    ),
    s(
      'empty-name-blocked',
      ['Ein leerer Name erzeugt keinen Branch', 'An empty name creates no branch'],
      [
        'Der deaktivierte Knopf schützt vor einer unvollständigen Aktion. Die bisherige Auswahl bleibt unverändert.',
        'The disabled button prevents an incomplete action. The selected revision stays unchanged.',
      ],
      c('create-branch'),
      { prepare: recipe({ ...selected, name: '' }) },
    ),
    s(
      'invalid-name',
      ['Probiere einen Namen mit Leerzeichen', 'Try a name containing a space'],
      [
        'Schreibe recovery/mit leerzeichen. Git-Branch-Namen dürfen hier keine Leerzeichen enthalten; der Knopf bleibt deaktiviert.',
        'Enter recovery/mit leerzeichen. Git branch names cannot contain spaces here; the button stays disabled.',
      ],
      c('branch-name'),
      {
        prepare: recipe({ ...selected, name: '' }),
        completion: { kind: 'value', selector: c('branch-name'), value: ['recovery/mit leerzeichen', 'recovery/mit leerzeichen'] },
      },
    ),
    s(
      'name',
      ['Vergib einen gültigen aussagekräftigen Namen', 'Choose a valid descriptive name'],
      [
        'Ersetze den ungültigen Namen durch recovery/begruessung. Dieser Name beschreibt, welchen früheren Stand du bewahren möchtest.',
        'Replace the invalid name with recovery/begruessung. This name describes the earlier revision you want to preserve.',
      ],
      c('branch-name'),
      {
        prepare: recipe({ ...selected, name: 'recovery/mit leerzeichen' }),
        completion: { kind: 'value', selector: c('branch-name'), value: [recoveryName, recoveryName] },
      },
    ),
    s(
      'preview',
      ['Prüfe Zielcommit und neuen Branch-Namen gemeinsam', 'Review the target commit and new branch name together'],
      [
        'Die Vorschau verbindet den früheren Commit mit recovery/begruessung. Nach dem Erstellen ist dieser neue Branch aktiv; main bleibt auf dem zweiten Commit.',
        'The preview connects the earlier commit with recovery/begruessung. After creation this new branch will be active; main stays on the second commit.',
      ],
      c('branch-preview'),
      { prepare: recipe(named) },
    ),
    s(
      'restore',
      ['Erstelle den Recovery-Branch und öffne ihn', 'Create and open the recovery branch'],
      [
        'Klicke Branch erstellen & öffnen. Die Übung bestätigt den Erfolg für den gewählten Branch; es wird nichts veröffentlicht.',
        'Click Create branch & open. The practice confirms success for the selected branch; nothing is published.',
      ],
      c('create-branch'),
      { prepare: recipe(named), completion: { kind: 'text', selector: '.recovery-center__notice--success p', value: recoverySuccess } },
    ),
    s(
      'saved-only',
      ['Wiederhergestellt werden gespeicherte Commits', 'Recovery restores saved commits'],
      [
        'Die Aktion öffnet den gespeicherten Dateibaum des früheren Commits. Nicht committete Entwürfe, die zuvor verworfen wurden, sind nicht Teil dieser Sicherung.',
        'The action opens the earlier commit’s saved file tree. Uncommitted drafts discarded earlier are not part of this backup.',
      ],
      c('commit-note'),
      { prepare: recipe(created) },
    ),
    s(
      'return',
      ['Kehre zum normalen Verlauf zurück', 'Return to normal history'],
      [
        'Klicke Zurück zum Graph in der Kopfzeile des Recovery Centers. Der neue Recovery-Branch bleibt geöffnet.',
        'Click Back to graph in the Recovery Center header. The new recovery branch stays open.',
      ],
      '[data-tutorial="close-recovery"]',
      { prepare: recipe(created), completion: element(mergeHead(4)) },
    ),
    s(
      'recovered-head',
      ['Der alte vierte Commit ist wieder erreichbar', 'The former fourth commit is reachable again'],
      [
        'HEAD zeigt jetzt auf recovery/begruessung am alten vierten Commit. Auch der dritte Commit seiner Vorgängerhistorie erscheint wieder im normalen Graphen, weil der neue Branch diese Historie bewahrt.',
        'HEAD now points to recovery/begruessung at the former fourth commit. The earlier third commit reappears in the normal graph too because the new branch preserves this history.',
      ],
      mergeHead(4),
      { prepare: recipe(graph) },
    ),
    s(
      'main-preserved',
      ['main bleibt auf seinem bisherigen Stand', 'main stays at its previous revision'],
      [
        'main und origin/main stehen weiterhin am zweiten Commit. Du hast den früheren Stand zusätzlich gesichert, ohne diese Referenzen zu verschieben.',
        'main and origin/main still point to the second commit. You preserved the former revision additionally without moving these references.',
      ],
      graphRow(2) + ' .commit-refs',
      { prepare: recipe(graph) },
    ),
    s(
      'inspector',
      ['Öffne den Inspector für die Dateiprüfung', 'Open the inspector to check files'],
      [
        'Öffne den rechten Inspector. Anschließend können wir den wieder erreichbaren Commit und seine gespeicherten Änderungen auswählen.',
        'Open the right inspector. We can then select the recovered commit and inspect its saved changes.',
      ],
      branchControl('inspector-toggle'),
      { prepare: recipe(graph), completion: element(branchControl('inspector-toggle') + '[aria-expanded="true"]') },
    ),
    s(
      'select-result',
      ['Wähle den wiederhergestellten Commit', 'Select the recovered commit'],
      [
        'Wähle den vierten Begrüßungscommit im Graphen. Seine ursprüngliche Nachricht und Dateien bleiben erhalten.',
        'Select the fourth greeting commit in the graph. Its original message and files are retained.',
      ],
      graphRow(4),
      {
        prepare: { ...recipe(graph), actions: [...recipe(graph).actions!, { expand: branchControl('inspector-toggle') }] },
        completion: element(commitPanel(4)),
      },
    ),
    s(
      'open-file',
      ['Öffne den gespeicherten README-Diff', 'Open the saved README diff'],
      ['Öffne README.md aus der Commit-Dateiliste.', 'Open README.md from the commit file list.'],
      commitPanel(4) + ' ' + commitFile(),
      { prepare: recipe(commit), completion: element(historyViewer(4)) },
    ),
    s(
      'diff',
      ['Der gespeicherte Begrüßungsstand wurde erhalten', 'The saved greeting revision was retained'],
      [
        'Der Diff zeigt wieder die ursprüngliche Welt-Begrüßung aus dem vierten Commit gegenüber dem dritten Commit als Vorgänger. Der Recovery-Branch hat keine neue Dateiänderung erfunden.',
        'The diff again shows the original world greeting from the fourth commit against the earlier third revision. The recovery branch invented no new file change.',
      ],
      historyViewer(4),
      { prepare: recipe(file) },
    ),
    s(
      'close-file',
      ['Schließe die Dateiprüfung', 'Close the file check'],
      ['Schließe den Diff und kehre zum wiederhergestellten Branch zurück.', 'Close the diff and return to the recovered branch.'],
      fileControl('close-file'),
      { prepare: recipe(file), completion: { kind: 'absent', selector: historyViewer(4) } },
    ),
    s(
      'finish',
      ['Der frühere Commit ist auf einem eigenen Branch gesichert', 'The earlier commit is preserved on its own branch'],
      [
        'Du hast Suche, Git-Details, Namensprüfung, neue Referenz und gespeicherte Dateien geprüft. Weiter beendet diese Lektion.',
        'You checked search, Git details, name validation, the new reference and saved files. Next finishes this lesson.',
      ],
      mergeHead(4),
      { prepare: recipe(graph) },
    ),
  ],
};
