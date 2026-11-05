import type { TutorialChapter } from './types';
import { recoveryStep as s, recoveryControl as c, recoveryNavigation, recoveryEntry, recoveryList, recoveryDetail } from './recoveryLessonHelpers';
import {
  inspectRecoveryRecipe as recipe,
  recoveryPrompt,
  recoveryConfirm,
  recoveryCancel,
  inspectedMessage,
  inspectRecoveryName as name,
  inspectedBranchMessage,
} from './recoveryInspectLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
import { graphRow, fileRow, fileTab, historyViewer } from './historyLessonHelpers';
import { branchControl } from './branchLessonHelpers';
import { fileControl } from './fileLessonHelpers';
const closed = { kind: 'absent' as const, selector: recoveryPrompt };
const tree = () => {
  const base = recipe('detached');
  return {
    ...base,
    actions: [
      ...base.actions!,
      { expand: branchControl('inspector-toggle') },
      { click: '[data-tutorial="open-files"]' },
      { waitFor: '[data-tutorial="open-files"][aria-pressed="true"]' },
      { waitFor: fileRow('README.md') },
    ],
    ready: fileRow('README.md'),
  };
};
export const TUTORIAL_RECOVERY_INSPECT: TutorialChapter = {
  id: 'recovery-inspect',
  section: 'repo',
  title: ['Einen früheren Stand ohne Branch ansehen', 'Inspect an earlier revision without a branch'],
  description: [
    'Erweiterte Optionen, Bestätigung, Abbrechen, losgelösten HEAD und den Übergang auf einen eigenen Branch ausprobieren.',
    'Try advanced options, confirmation, cancellation, detached HEAD and moving onto your own branch.',
  ],
  question: ['Wie sehe ich einen früheren Stand an, ohne einen Branch zurückzusetzen?', 'How do I inspect an earlier revision without resetting a branch?'],
  keywords: 'recovery ansehen inspect checkout detached head branch losgelöst ohne branch bestätigen abbrechen dateien',
  steps: [
    s(
      'scope',
      ['Ansehen wechselt die Arbeitsdateien, ohne main zu verschieben', 'Inspecting switches working files without moving main'],
      [
        'main steht im Beispiel nach einem früheren Reset am zweiten Commit. Wir öffnen den erhaltenen vierten Commit zunächst ohne Branch. Alle Änderungen bleiben im Übungsprojekt.',
        'After an earlier reset, main points to the second commit in this example. We will first open the retained fourth commit without a branch. All changes stay inside the practice project.',
      ],
      '[data-tutorial="graph"]',
      { prepare: recipe() },
    ),
    s(
      'find',
      ['Öffne das Recovery Center', 'Open the Recovery Center'],
      ['Öffne Recovery Center neben der Commit-Suche oder über das kompakte ⋯-Menü.', 'Open Recovery Center beside commit search or from the compact ⋯ menu.'],
      recoveryNavigation,
      { prepare: recipe(), completion: element(recoveryList(5)) },
    ),
    s(
      'choose',
      ['Wähle den früheren vierten Commit', 'Select the former fourth commit'],
      [
        'Wähle den gespeicherten Begrüßungscommit. Der aktuelle main bleibt durch die Auswahl unverändert.',
        'Select the saved greeting commit. Selecting it leaves the current main unchanged.',
      ],
      recoveryEntry(4),
      { prepare: recipe('center'), completion: element(recoveryDetail(4)) },
    ),
    s(
      'selection',
      ['Prüfe den Zielstand vor der Aktion', 'Check the target revision before acting'],
      [
        'Kurz-Hash und Nachricht gehören zum alten vierten Commit. Im Beispiel sind keine offenen Arbeitsdateiänderungen vorhanden.',
        'The short hash and message belong to the old fourth commit. This example has no open working-file changes.',
      ],
      '.recovery-center__selection-meta',
      { prepare: recipe('selected') },
    ),
    s(
      'advanced',
      ['Öffne die weiteren Wiederherstellungsoptionen', 'Open more recovery options'],
      [
        'Klappe Weitere Wiederherstellungsoptionen auf. Ansehen und Zurücksetzen haben unterschiedliche Wirkungen.',
        'Expand More recovery options. Inspecting and resetting have different effects.',
      ],
      c('advanced') + ' > summary',
      { prepare: recipe('selected'), gesture: 'enter', completion: element(c('advanced') + '[open]') },
    ),
    s(
      'inspect-purpose',
      ['Stand ansehen erstellt noch keinen Branch', 'Inspect state does not create a branch'],
      [
        'Die Aktion wechselt zu den Dateien des gewählten Commits. main behält sein Ziel; HEAD zeigt anschließend unmittelbar auf den alten Commit.',
        'This action switches to the selected commit’s files. main keeps its target; HEAD then points directly to the old commit.',
      ],
      c('inspect'),
      { prepare: recipe('advanced') },
    ),
    s(
      'open',
      ['Öffne die Bestätigung für Stand ansehen', 'Open the Inspect state confirmation'],
      [
        'Klicke Stand ansehen. Die Bestätigung erklärt zuerst den Wechsel der Arbeitsdateien und den Zustand außerhalb eines Branches.',
        'Click Inspect state. The confirmation first explains the working-file switch and the state outside a branch.',
      ],
      c('inspect'),
      { prepare: recipe('advanced'), completion: element(recoveryPrompt) },
    ),
    s(
      'caution',
      ['Die Arbeitsdateien wechseln zum Zielcommit', 'Working files switch to the target commit'],
      [
        'Du öffnest hier nicht nur einen historischen Diff. Nach der Bestätigung werden die Arbeitsdateien auf den gewählten Stand gewechselt.',
        'This does not merely open a historical diff. After confirmation the working files switch to the selected revision.',
      ],
      recoveryPrompt + ' .dialog-message',
      { prepare: recipe('prompt') },
    ),
    s(
      'context',
      ['Der Kontext nennt den gespeicherten Zielstand', 'The context identifies the saved target revision'],
      [
        'Prüfe den Begrüßungsstand und seinen Kurz-Hash. main steht davor weiterhin am zweiten Commit.',
        'Check the greeting revision and its short hash. Before confirmation main still points to the second commit.',
      ],
      recoveryPrompt + ' .dialog-context-list',
      { prepare: recipe('prompt') },
    ),
    s(
      'impact',
      ['Die Branch-Referenzen bleiben erhalten', 'Branch references are preserved'],
      [
        'Diese Aktion verschiebt main nicht. Für neue gespeicherte Arbeit empfiehlt die App danach einen eigenen Branch, damit neue Commits dauerhaft erreichbar bleiben.',
        'This action does not move main. For new saved work the app then recommends a branch of your own so new commits remain reachable.',
      ],
      recoveryPrompt + ' .dialog-impact',
      { prepare: recipe('prompt') },
    ),
    s(
      'cancel',
      ['Brich den ersten Versuch ab', 'Cancel the first attempt'],
      [
        'Klicke Abbrechen. Die Bestätigung schließt sich, ohne die Arbeitsdateien oder den aktiven Branch zu wechseln.',
        'Click Cancel. The confirmation closes without switching working files or the active branch.',
      ],
      recoveryCancel,
      { prepare: recipe('prompt'), completion: closed },
    ),
    s(
      'cancelled',
      ['Der frühere Stand wurde noch nicht geöffnet', 'The earlier revision has not been opened yet'],
      [
        'Die erweiterten Optionen bleiben sichtbar. Die Auswahl ist nur eine Vorbereitung; es wurde kein zusätzlicher HEAD-Wechsel aufgezeichnet.',
        'The advanced options remain visible. Selection is only preparation; no additional HEAD movement was recorded.',
      ],
      c('inspect'),
      { prepare: recipe('cancelled') },
    ),
    s(
      'reopen',
      ['Öffne die Bestätigung erneut', 'Open the confirmation again'],
      ['Klicke erneut Stand ansehen und prüfe noch einmal den Zielcommit.', 'Click Inspect state again and check the target commit once more.'],
      c('inspect'),
      { prepare: recipe('cancelled'), completion: element(recoveryPrompt) },
    ),
    s(
      'confirm',
      ['Öffne den gespeicherten Stand ohne Branch', 'Open the saved revision without a branch'],
      [
        'Bestätige mit Stand öffnen. Die Erfolgsmeldung muss den gewählten vierten Commit nennen.',
        'Confirm with Open state. The success message must identify the selected fourth commit.',
      ],
      recoveryConfirm,
      { prepare: recipe('prompt'), completion: { kind: 'text', selector: '.recovery-center__notice--success p', value: inspectedMessage } },
    ),
    s(
      'success',
      ['Ansehen wurde als eigener Wechsel aufgezeichnet', 'Inspecting was recorded as a separate switch'],
      [
        'Der Verlauf enthält nun sechs Einträge, einschließlich des Wechsels zum alten Commit. Es wurde dabei kein neuer Commit erstellt.',
        'History now contains six entries, including the switch to the old commit. No new commit was created.',
      ],
      c('list'),
      { prepare: recipe('inspected') },
    ),
    s(
      'return',
      ['Prüfe den geöffneten Stand im Graphen', 'Inspect the opened revision in the graph'],
      ['Klicke Zurück zum Graph, um HEAD und die erhaltenen Branches zu sehen.', 'Click Back to graph to see HEAD and the retained branches.'],
      '[data-tutorial="close-recovery"]',
      { prepare: recipe('inspected'), completion: element(mergeHead(4)) },
    ),
    s(
      'detached',
      ['HEAD zeigt jetzt direkt auf einen Commit', 'HEAD now points directly to a commit'],
      [
        'Am vierten Commit steht HEAD ohne Branch-Namen. Das ist ein losgelöster HEAD. Der Stand ist geöffnet, aber es wurde noch kein zusätzlicher Branch angelegt.',
        'The fourth commit is marked HEAD without a branch name. This is a detached HEAD. The revision is open, but no additional branch has been created.',
      ],
      mergeHead(4),
      { prepare: recipe('detached') },
    ),
    s(
      'main',
      ['main bleibt am zweiten Commit', 'main stays on the second commit'],
      [
        'main und origin/main sind unverändert. Das unterscheidet Ansehen vom Zurücksetzen des aktuellen Branches.',
        'main and origin/main are unchanged. This distinguishes inspecting from resetting the current branch.',
      ],
      graphRow(2) + ' .commit-refs',
      { prepare: recipe('detached') },
    ),
    s(
      'inspector',
      ['Öffne den Inspector für die Arbeitsdateien', 'Open the inspector for working files'],
      [
        'Öffne den rechten Inspector, um den Dateibaum des tatsächlich geöffneten Arbeitsstands zu sehen.',
        'Open the right inspector to see the file tree of the working revision you actually opened.',
      ],
      branchControl('inspector-toggle'),
      { prepare: recipe('detached'), completion: element(branchControl('inspector-toggle') + '[aria-expanded="true"]') },
    ),
    s(
      'tree',
      ['Öffne den Arbeitsdateibaum', 'Open the working-file tree'],
      [
        'Wähle die Dateiansicht im Inspector. Sie zeigt die aktuellen Arbeitsdateien, nicht nur eine alte Commit-Auswahl.',
        'Choose the inspector’s file view. It shows current working files, rather than just an old commit selection.',
      ],
      '[data-tutorial="open-files"]',
      {
        prepare: { ...recipe('detached'), actions: [...recipe('detached').actions!, { expand: branchControl('inspector-toggle') }] },
        completion: element('[data-tutorial="open-files"][aria-pressed="true"]'),
      },
    ),
    s(
      'open-file',
      ['Lies die aktuelle README', 'Read the current README'],
      ['Öffne README.md aus dem Arbeitsdateibaum.', 'Open README.md from the working-file tree.'],
      fileRow('README.md'),
      { prepare: tree(), completion: element(historyViewer()) },
    ),
    s(
      'text',
      ['Wähle die Textansicht der Arbeitsdatei', 'Choose the working file’s text view'],
      [
        'Wähle Text. Hier lesen wir den geöffneten Dateiinhalt, nicht einen leeren Diff einer unveränderten Datei.',
        'Choose Text. We are reading the opened file contents here, rather than an empty diff of an unchanged file.',
      ],
      fileTab('text'),
      { prepare: recipe('files'), completion: element(historyViewer() + '[data-tab="text"]') },
    ),
    s(
      'files',
      ['Die Arbeitsdatei enthält wieder den vierten Stand', 'The working file contains the fourth revision again'],
      [
        'Die Welt-Begrüßung stammt aus dem vierten Commit. Die Datei ist unverändert geöffnet; durch das Lesen wurde keine neue Änderung vorgemerkt.',
        'The world greeting comes from the fourth commit. The file is open unchanged; reading it staged no new change.',
      ],
      historyViewer(),
      { prepare: recipe('files') },
    ),
    s(
      'close-file',
      ['Schließe die Dateiansicht', 'Close the file view'],
      ['Schließe die README und kehre zum geöffneten Stand zurück.', 'Close the README and return to the opened revision.'],
      fileControl('close-file'),
      { prepare: recipe('files'), completion: { kind: 'absent', selector: historyViewer() } },
    ),
    s(
      'find-again',
      ['Sichere den angesehenen Stand auf einem Branch', 'Preserve the inspected revision on a branch'],
      [
        'Öffne Recovery Center erneut. Jetzt wollen wir einen Branch am geöffneten vierten Commit erstellen.',
        'Open Recovery Center again. We now want to create a branch at the opened fourth commit.',
      ],
      recoveryNavigation,
      { prepare: recipe('detached'), completion: element(recoveryList(6)) },
    ),
    s(
      'name',
      ['Wähle einen Namen für die weitere Arbeit', 'Choose a name for further work'],
      [
        'Schreibe recovery/angesehen. Der neue Branch soll am bereits geöffneten vierten Commit entstehen.',
        'Enter recovery/angesehen. The new branch should be created at the fourth commit already open.',
      ],
      c('branch-name'),
      { prepare: recipe('reopened'), completion: { kind: 'value', selector: c('branch-name'), value: [name, name] } },
    ),
    s(
      'create',
      ['Erstelle den Branch am angesehenen Stand', 'Create the branch at the inspected revision'],
      [
        'Klicke Branch erstellen & öffnen. HEAD wechselt von einem direkten Commit-Ziel zur neuen Branch-Referenz am selben Commit.',
        'Click Create branch & open. HEAD switches from pointing directly to a commit to the new branch reference at that same commit.',
      ],
      c('create-branch'),
      { prepare: recipe('named'), completion: { kind: 'text', selector: '.recovery-center__notice--success p', value: inspectedBranchMessage } },
    ),
    s(
      'return-final',
      ['Prüfe den jetzt aktiven Branch', 'Check the branch that is now active'],
      [
        'Klicke Zurück zum Graph. Die Dateien bleiben auf dem angesehenen Stand; die neue Branch-Referenz bewahrt ihn zusätzlich.',
        'Click Back to graph. Files stay at the inspected revision; the new branch reference additionally preserves it.',
      ],
      '[data-tutorial="close-recovery"]',
      { prepare: recipe('branched'), completion: element(mergeHead(4)) },
    ),
    s(
      'finish',
      ['Der angesehene Stand hat jetzt einen eigenen Branch', 'The inspected revision now has its own branch'],
      [
        'HEAD zeigt auf recovery/angesehen am vierten Commit, während main am zweiten Commit bleibt. Weiter beendet die Lektion.',
        'HEAD points to recovery/angesehen at the fourth commit while main stays on the second commit. Next finishes this lesson.',
      ],
      mergeHead(4),
      { prepare: recipe('result') },
    ),
  ],
};
