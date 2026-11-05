import type { TutorialStep } from './types';
import { rebaseStep as s } from './rebaseLessonHelpers';
import { rebasePauseRecipe as recipe, rebaseControl } from './rebasePauseLessonHelpers';
import { isConflictRebaseLesson, type RebasePauseKind } from './rebasePauseExamples';
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileControl as c, fileTab } from './fileLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
export function rebasePauseResultSteps(kind: RebasePauseKind): TutorialStep[] {
  const conflict = isConflictRebaseLesson(kind),
    head = conflict ? 5 : 6,
    path = conflict ? 'README.md' : 'LICENSE';
  const before = conflict ? 'resolved' : kind === 'edit' ? 'amended' : 'staged';
  return [
    s(
      'pause-continue',
      ['Setze den vorbereiteten Rebase fort', 'Continue the prepared rebase'],
      [
        conflict
          ? 'Klicke Fortsetzen in der Rebase-Gruppe. Die vorgemerkte Lösung wird als einzelner Commit auf Basis 2 gespeichert. Die ausgelassene dritte Todo-Zeile wird nicht nachträglich wieder eingefügt.'
          : kind === 'edit'
            ? 'Klicke Fortsetzen. Jetzt wird die noch ausstehende Begrüßung auf deinen korrigierten Lizenzcommit angewendet; die eigene Nachricht dieses Nachfolgers bleibt erhalten.'
            : 'Klicke Fortsetzen. Git übernimmt die vorgemerkte Ergänzung mit der bisherigen Nachricht in den angehaltenen Commit und spielt anschließend die Begrüßung erneut ab.',
        conflict
          ? 'Click Continue in the Rebase group. The staged resolution is saved as one commit on base 2. The omitted third todo line is not reinserted afterward.'
          : kind === 'edit'
            ? 'Click Continue. The remaining greeting is now replayed on your corrected license commit; the descendant retains its own message.'
            : 'Click Continue. Git includes the staged addition in the stopped commit with its existing message and then replays the greeting.',
      ],
      rebaseControl('continue'),
      { prepare: recipe(kind, before), action: 'rebased', completion: element(mergeHead(head)) },
    ),
    s(
      'pause-result',
      ['main ist wieder der aktive Branch', 'main is the active branch again'],
      [
        conflict
          ? 'HEAD und main zeigen gemeinsam auf Commit 5. Der Konfliktzustand ist beendet, und der Commit baut direkt auf Basis 2 auf.'
          : 'HEAD und main zeigen gemeinsam auf Commit 6. Commit 5 enthält die korrigierte Lizenz; Commit 6 enthält die wieder angewendete Begrüßung.',
        conflict
          ? 'HEAD and main both point to commit 5. The conflict state is finished and the commit builds directly on base 2.'
          : 'HEAD and main both point to commit 6. Commit 5 contains the corrected license and commit 6 contains the replayed greeting.',
      ],
      mergeHead(head),
      { prepare: recipe(kind, 'continued') },
    ),
    s(
      'pause-completed',
      ['Die Rebase-Aktionsgruppe ist verschwunden', 'The Rebase action group is gone'],
      [
        'Der bestätigte Abschluss beendet den laufenden Vorgang. Die separate Vorgangsanzeige braucht gegebenenfalls einen kurzen Aktualisierungszyklus; sie ist keine zweite auszuführende Git-Aktion.',
        'Confirmed completion ends the pending operation. The separate status display may need a brief refresh cycle; it is not a second Git action to perform.',
      ],
      '[data-tutorial="staging"]',
      { prepare: recipe(kind, 'continued') },
    ),
    s(
      'pause-result-refs',
      ['Andere Referenzen wurden nicht mitverschoben', 'Other references did not move along'],
      [
        'origin/main und v1.0.0 bleiben auf Commit 2; feature/begruessung bleibt auf Commit 1. Der Rebase ist lokal abgeschlossen und führt keinen Push aus.',
        'origin/main and v1.0.0 stay on commit 2; feature/begruessung stays on commit 1. The rebase is complete locally and performs no push.',
      ],
      graphRow(2) + ' .commit-refs',
      { prepare: recipe(kind, 'continued') },
    ),
    s(
      'pause-select-result',
      ['Wähle den neu gespeicherten Commit 5', 'Select newly saved commit 5'],
      [
        conflict
          ? 'Klicke den neuen HEAD 5. Seine Nachricht stammt weiterhin vom übernommenen vierten Patch, während seine Dateiänderung deine bestätigte Lösung enthält.'
          : 'Klicke den korrigierten älteren Commit 5 unter HEAD. Die Begrüßung bleibt als eigener Nachfolger davon getrennt.',
        conflict
          ? 'Click new HEAD 5. Its message still belongs to the replayed fourth patch while its file change contains your confirmed resolution.'
          : 'Click corrected older commit 5 below HEAD. The greeting remains a separate descendant.',
      ],
      graphRow(5),
      { prepare: recipe(kind, 'continued'), completion: element(commitPanel(5)) },
    ),
    s(
      'pause-result-message',
      ['Prüfe die tatsächlich gespeicherte Nachricht', 'Check the message actually saved'],
      [
        conflict
          ? 'Die Beschreibung gehört weiterhin zum Begrüßungscommit. Die Konfliktauflösung erzeugt keine erfundene Merge-Nachricht mit zwei Vorgängern.'
          : kind === 'edit'
            ? 'Hier steht die bewusst eingegebene Beschreibung der Edit-Pause. Sie gehört zu deinem ausdrücklichen Amend, nicht zur späteren Begrüßung.'
            : 'Die ursprüngliche Beschreibung des Lizenzcommits ist unverändert. Die vorgemerkte Korrektur wurde beim Fortsetzen ohne Eingabe einer neuen Nachricht übernommen.',
        conflict
          ? 'The description still belongs to the greeting commit. Resolving the conflict does not invent a merge message with two parents.'
          : kind === 'edit'
            ? 'This is the description deliberately entered during the edit pause. It belongs to your explicit amend rather than the later greeting.'
            : 'The license commit’s original description is unchanged. Continue included the staged correction without a new message being entered.',
      ],
      '.commit-details-description',
      { prepare: recipe(kind, 'commit') },
    ),
    s(
      'pause-result-author',
      ['Die ursprüngliche Urheberschaft bleibt erhalten', 'Original authorship is preserved'],
      [
        conflict
          ? 'Alex bleibt der Autor des übernommenen Begrüßungspatches. Der neue Commit hat einen neuen Hash und einen einzelnen Vorgänger.'
          : 'Sam bleibt Autor des Lizenzcommits, einschließlich des ursprünglichen Autordatums. Ein neuer Hash macht die übernommene Arbeit nicht zu einer Änderung mit anderer Urheberschaft.',
        conflict
          ? 'Alex remains the author of the replayed greeting patch. The new commit has a new hash and one parent.'
          : 'Sam remains the license commit’s author, including the original author date. A new hash does not change the authorship of the replayed work.',
      ],
      graphRow(5) + ' .commit-author',
      { prepare: recipe(kind, 'commit') },
    ),
    s(
      'pause-result-file',
      ['Öffne die gespeicherte Ergebnisdatei', 'Open the saved result file'],
      [
        conflict
          ? 'Klicke README.md und prüfe den tatsächlich gespeicherten Patch gegen Basis 2.'
          : 'Klicke LICENSE und prüfe den ursprünglichen Projekthinweis zusammen mit deiner Ergänzung gegen Basis 2.',
        conflict
          ? 'Click README.md and inspect the actual saved patch against base 2.'
          : 'Click LICENSE and inspect the original project note together with your addition against base 2.',
      ],
      commitPanel(5) + ' ' + commitFile(path),
      { prepare: recipe(kind, 'commit'), completion: element(historyViewer(5, path)) },
    ),
    s(
      'pause-result-tab',
      ['Wähle die Diff-Ansicht', 'Select the Diff view'],
      [
        'Die Diff-Ansicht vergleicht den neuen Commit mit seinem tatsächlichen Vorgänger. Der vollständige Text bleibt separat über Text erreichbar.',
        'Diff compares the new commit with its actual parent. The full text remains separately available through Text.',
      ],
      fileTab('diff'),
      { prepare: recipe(kind, 'diff'), completion: element(historyViewer(5, path) + '[data-tab="diff"]') },
    ),
    s(
      'pause-result-diff',
      ['Prüfe die bestätigte Änderung', 'Inspect the confirmed change'],
      [
        conflict
          ? 'Die kleine ursprüngliche Projektbeschreibung wird durch deine aufgelöste Begrüßung ersetzt. Der ausgelassene Dokumentationscommit ist kein zusätzlicher Vorgänger.'
          : 'Der neue Patch ergänzt den Projekthinweis und deine präzisierende Edit-Zeile. Der danach erneut abgespielte Begrüßungscommit verändert diese Lizenz nicht.',
        conflict
          ? 'Your resolved greeting replaces the original small project description. The omitted documentation commit is not an additional parent.'
          : 'The new patch adds the project note and your clarifying edit line. The greeting replayed afterward does not change this license.',
      ],
      '.file-viewer-diff',
      { prepare: recipe(kind, 'diff') },
    ),
    s(
      'pause-close-result',
      ['Schließe den geprüften Diff', 'Close the inspected diff'],
      [
        'Schließe den Dateibetrachter. Der Rebase bleibt abgeschlossen; dies verändert keine gespeicherte Datei.',
        'Close the file viewer. The rebase remains complete; this does not edit any saved file.',
      ],
      c('close-file'),
      { prepare: recipe(kind, 'diff'), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'pause-complete',
      ['Diese Pausenvariante ist abgeschlossen', 'This pause variant is complete'],
      [
        'Du hast den Zwischenstand geprüft, Dateien vorbereitet und den Rebase bis zur Rückkehr zum ursprünglichen Branch abgeschlossen. Jede Wiederholung beginnt mit frischen Beispieldaten.',
        'You inspected the intermediate state, prepared files and completed the rebase through returning to the original branch. Every repeat starts with fresh sample data.',
      ],
      mergeHead(head),
      { prepare: recipe(kind, 'continued') },
    ),
  ];
}
