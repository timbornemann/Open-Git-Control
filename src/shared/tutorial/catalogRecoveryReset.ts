import type { TutorialChapter } from './types';
import { recoveryStep as s, recoveryControl as c, recoveryList, recoveryDetail, recoveryEntry, recoveryNavigation } from './recoveryLessonHelpers';
import { resetRecoveryRecipe as recipe, resetRecoveryMessage } from './recoveryResetLessonHelpers';
import { recoveryPrompt, recoveryConfirm, recoveryCancel } from './recoveryInspectLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
import { graphRow, fileRow, fileTab, historyViewer } from './historyLessonHelpers';
import { branchControl } from './branchLessonHelpers';
import { fileControl } from './fileLessonHelpers';
export const TUTORIAL_RECOVERY_RESET: TutorialChapter = {
  id: 'recovery-reset',
  section: 'repo',
  title: ['Den aktuellen Branch bewusst auf einen gespeicherten Stand setzen', 'Deliberately reset the current branch to a saved revision'],
  description: [
    'Hard Reset, Zielstand, Folgen, Abbrechen und bestätigtes Zurücksetzen mit anschließender Dateiprüfung kennenlernen.',
    'Learn hard reset, the target revision, consequences, cancellation and confirmed reset followed by a file check.',
  ],
  question: [
    'Wie setze ich den aktuellen Branch über Recovery Center auf einen gespeicherten Commit?',
    'How do I reset the current branch to a saved commit through Recovery Center?',
  ],
  keywords: 'recovery reset hard branch zurücksetzen wiederherstellen head index staging arbeitsdateien bestätigen abbrechen',
  steps: [
    s(
      'scope',
      ['main soll wieder auf den gespeicherten vierten Stand zeigen', 'main should point to the saved fourth revision again'],
      [
        'Im vorbereiteten Beispiel steht main nach einem früheren Reset am zweiten Commit. Wir verschieben diesen Branch bewusst auf den erhaltenen vierten Commit und prüfen anschließend die Arbeitsdateien.',
        'In this prepared example main points to the second commit after an earlier reset. We will deliberately move this branch to the retained fourth commit and then inspect working files.',
      ],
      '[data-tutorial="graph"]',
      { prepare: recipe() },
    ),
    s(
      'current',
      ['Prüfe zuerst den aktuellen Branch und Ausgangsstand', 'First check the current branch and starting revision'],
      [
        'HEAD gehört zu main am zweiten Commit. Dieser Branch wird durch die folgende Aktion verschoben. Das Beispiel hat derzeit keine offenen Dateiänderungen.',
        'HEAD belongs to main at the second commit. This is the branch the following action will move. The example currently has no open file changes.',
      ],
      mergeHead(2),
      { prepare: recipe() },
    ),
    s(
      'find',
      ['Öffne das Recovery Center', 'Open the Recovery Center'],
      [
        'Öffne Recovery Center neben der Commit-Suche oder über das kompakte ⋯-Menü.',
        'Open Recovery Center beside commit search or through the compact ⋯ menu.',
      ],
      recoveryNavigation,
      { prepare: recipe(), completion: element(recoveryList(5)) },
    ),
    s(
      'choose',
      ['Wähle den erhaltenen vierten Commit', 'Select the retained fourth commit'],
      [
        'Wähle den gespeicherten Begrüßungscommit. Prüfe seinen Kurz-Hash und seine Nachricht vor dem Zurücksetzen.',
        'Select the saved greeting commit. Check its short hash and message before resetting.',
      ],
      recoveryEntry(4),
      { prepare: recipe('center'), completion: element(recoveryDetail(4)) },
    ),
    s(
      'target',
      ['Die Auswahl ist das Ziel für main und die Arbeitsdateien', 'The selection is the target for main and working files'],
      [
        'Der gewählte vierte Commit ist das Ziel. Ein Hard Reset setzt HEAD, Index und erfasste Arbeitsdateien gemeinsam auf dessen gespeicherten Stand.',
        'The selected fourth commit is the target. A hard reset sets HEAD, the index and tracked working files to its saved revision together.',
      ],
      '.recovery-center__selection-meta',
      { prepare: recipe('selected') },
    ),
    s(
      'advanced',
      ['Öffne die weiteren Wiederherstellungsoptionen', 'Open more recovery options'],
      ['Klappe Weitere Wiederherstellungsoptionen auf und suche Aktuellen Branch zurücksetzen.', 'Expand More recovery options and find Reset current branch.'],
      c('advanced') + ' > summary',
      { prepare: recipe('selected'), gesture: 'enter', completion: element(c('advanced') + '[open]') },
    ),
    s(
      'mode',
      ['Diese Aktion verwendet Hard Reset', 'This action uses hard reset'],
      [
        'Der angezeigte Git-Modus ersetzt auch den Index und die erfassten Arbeitsdateien. Nicht committete Änderungen daran würden verloren gehen. Der Reflog bewahrt gespeicherte Commits, keine verworfenen Entwürfe.',
        'The displayed Git mode also replaces the index and tracked working files. Uncommitted changes to them would be lost. The reflog preserves saved commits, not discarded drafts.',
      ],
      c('reset'),
      { prepare: recipe('advanced') },
    ),
    s(
      'open',
      ['Öffne die Bestätigung für das Zurücksetzen', 'Open the reset confirmation'],
      [
        'Klicke Zurücksetzen. Die Bestätigung erlaubt zuerst eine Prüfung der Zielangaben und Folgen.',
        'Click Reset. The confirmation first lets you review the target and consequences.',
      ],
      c('reset'),
      { prepare: recipe('advanced'), completion: element(recoveryPrompt) },
    ),
    s(
      'message',
      ['Der aktuelle Branch und seine Arbeitsdateien werden umgestellt', 'The current branch and working files will change'],
      [
        'Lies die Beschreibung: Der aktive Branch main und die Arbeitsdateien sollen zum ausgewählten Commit wechseln.',
        'Read the description: the active main branch and working files should move to the selected commit.',
      ],
      recoveryPrompt + ' .dialog-message',
      { prepare: recipe('prompt') },
    ),
    s(
      'context',
      ['Prüfe den gespeicherten Zielstand erneut', 'Check the saved target revision again'],
      [
        'Kontrolliere Nachricht und Kurz-Hash des vierten Commits. Die Aktion gilt diesem gespeicherten Stand.',
        'Check the fourth commit’s message and short hash. The action applies to this saved revision.',
      ],
      recoveryPrompt + ' .dialog-context-list',
      { prepare: recipe('prompt') },
    ),
    s(
      'impact',
      ['Prüfe die Folgen für ungespeicherte Arbeit', 'Review the consequences for unsaved work'],
      [
        'Änderungen an erfassten Dateien und im Index gehen bei Hard Reset verloren. Unversionierte Dateien können bei Pfadkonflikten ersetzt werden. Commits nach dem Zielstand bleiben nur über andere Referenzen oder Wiederherstellungspunkte erreichbar.',
        'A hard reset discards tracked-file and index changes. Untracked files can be replaced when paths conflict. Commits after the target remain reachable only through other references or recovery points.',
      ],
      recoveryPrompt + ' .dialog-impact',
      { prepare: recipe('prompt') },
    ),
    s(
      'cancel',
      ['Brich den ersten Versuch ab', 'Cancel the first attempt'],
      [
        'Klicke Abbrechen. Die Bestätigung wird geschlossen und main bleibt am zweiten Commit.',
        'Click Cancel. The confirmation closes and main stays on the second commit.',
      ],
      recoveryCancel,
      { prepare: recipe('prompt'), completion: { kind: 'absent', selector: recoveryPrompt } },
    ),
    s(
      'cancelled',
      ['Abbrechen hat keinen weiteren Reset aufgezeichnet', 'Cancellation recorded no additional reset'],
      [
        'Die fünf vorhandenen Wiederherstellungspunkte sind unverändert. Eine Auswahl oder geöffnete Bestätigung allein hat den Branch nicht verschoben.',
        'The five existing recovery points are unchanged. Selection or an open confirmation alone did not move the branch.',
      ],
      c('list'),
      { prepare: recipe('cancelled') },
    ),
    s(
      'reopen',
      ['Öffne die Bestätigung nach der Prüfung erneut', 'Reopen the confirmation after reviewing it'],
      ['Klicke noch einmal Zurücksetzen und prüfe den vierten Commit als Ziel.', 'Click Reset again and check the fourth commit as the target.'],
      c('reset'),
      { prepare: recipe('cancelled'), completion: element(recoveryPrompt) },
    ),
    s(
      'confirm',
      ['Setze main auf den ausgewählten Stand', 'Reset main to the selected revision'],
      [
        'Bestätige mit Branch zurücksetzen. Die Erfolgsmeldung muss den vierten Commit nennen.',
        'Confirm with Reset branch. The success message must identify the fourth commit.',
      ],
      recoveryConfirm,
      { prepare: recipe('prompt'), completion: { kind: 'text', selector: '.recovery-center__notice--success p', value: resetRecoveryMessage } },
    ),
    s(
      'recorded',
      ['Der neue Reset erscheint als weiterer Verlaufspunkt', 'The new reset appears as another history point'],
      [
        'Der Verlauf enthält nun sechs Einträge. Der neue Reset beschreibt den Wechsel des aktiven Branches zum vierten Commit.',
        'History now contains six entries. The new reset describes moving the active branch to the fourth commit.',
      ],
      c('list'),
      { prepare: recipe('reset') },
    ),
    s(
      'return',
      ['Prüfe den geänderten Branch im Graphen', 'Inspect the changed branch in the graph'],
      ['Klicke Zurück zum Graph. main bleibt als aktiver Branch geöffnet.', 'Click Back to graph. main remains the active branch.'],
      '[data-tutorial="close-recovery"]',
      { prepare: recipe('reset'), completion: element(mergeHead(4)) },
    ),
    s(
      'head',
      ['HEAD und main zeigen jetzt auf den vierten Commit', 'HEAD and main now point to the fourth commit'],
      [
        'Die bestehende Branch-Referenz wurde verschoben. Es entstand kein zusätzlicher Commit und kein zusätzlicher Branch.',
        'The existing branch reference moved. No additional commit or branch was created.',
      ],
      mergeHead(4),
      { prepare: recipe('result') },
    ),
    s(
      'remote',
      ['Die Remote-Markierung bleibt am zweiten Commit', 'The remote label stays on the second commit'],
      [
        'origin/main und v1.0.0 bleiben unverändert. Das Zurücksetzen war eine lokale Aktion und hat keinen Server aktualisiert.',
        'origin/main and v1.0.0 remain unchanged. Resetting was a local action and did not update any server.',
      ],
      graphRow(2) + ' .commit-refs',
      { prepare: recipe('result') },
    ),
    s(
      'inspector',
      ['Öffne den Inspector zur Dateiprüfung', 'Open the inspector to check files'],
      ['Öffne den rechten Inspector, um den neuen Arbeitsstand zu lesen.', 'Open the right inspector to read the new working revision.'],
      branchControl('inspector-toggle'),
      { prepare: recipe('result'), completion: element(branchControl('inspector-toggle') + '[aria-expanded="true"]') },
    ),
    s(
      'tree',
      ['Öffne Working Directory', 'Open Working Directory'],
      [
        'Wähle Working Directory. Der aktivierte Knopf bestätigt den Wechsel zum Arbeitsdateibaum.',
        'Choose Working Directory. The active button confirms the switch to the working-file tree.',
      ],
      '[data-tutorial="open-files"]',
      {
        prepare: { ...recipe('result'), actions: [...recipe('result').actions!, { expand: branchControl('inspector-toggle') }] },
        completion: element('[data-tutorial="open-files"][aria-pressed="true"]'),
      },
    ),
    s(
      'open-file',
      ['Öffne die aktuelle README', 'Open the current README'],
      ['Öffne README.md aus dem Arbeitsdateibaum.', 'Open README.md from the working-file tree.'],
      fileRow('README.md'),
      { prepare: recipe('tree'), completion: element(historyViewer()) },
    ),
    s(
      'text',
      ['Lies die Textansicht des neuen Arbeitsstands', 'Read the text view of the new working revision'],
      ['Wähle Text, um den tatsächlichen aktuellen Dateiinhalt zu lesen.', 'Choose Text to read the actual current file contents.'],
      fileTab('text'),
      { prepare: recipe('files'), completion: element(historyViewer() + '[data-tab="text"]') },
    ),
    s(
      'files',
      ['Die Arbeitsdatei entspricht dem vierten Commit', 'The working file matches the fourth commit'],
      [
        'Die Welt-Begrüßung ist wieder in der aktuellen Arbeitsdatei vorhanden. Index und Arbeitsdateien stimmen im Beispiel mit dem neuen HEAD überein; es gibt keine vorgemerkten Änderungen.',
        'The world greeting is present again in the current working file. In this example the index and working files match the new HEAD; there are no staged changes.',
      ],
      historyViewer(),
      { prepare: recipe('files') },
    ),
    s(
      'close-file',
      ['Schließe die Dateiprüfung', 'Close the file check'],
      ['Schließe die README und kehre zum zurückgesetzten Branch zurück.', 'Close the README and return to the reset branch.'],
      fileControl('close-file'),
      { prepare: recipe('files'), completion: { kind: 'absent', selector: historyViewer() } },
    ),
    s(
      'finish',
      ['Branch, Zielstand und Arbeitsdateien wurden geprüft', 'Branch, target revision and working files have been checked'],
      [
        'main steht jetzt am vierten Commit. Du hast die Folgen gelesen, zuerst abgebrochen und dann bewusst bestätigt. Weiter beendet die Lektion.',
        'main now points to the fourth commit. You reviewed the consequences, cancelled first and then deliberately confirmed. Next finishes this lesson.',
      ],
      mergeHead(4),
      { prepare: recipe('result') },
    ),
  ],
};
