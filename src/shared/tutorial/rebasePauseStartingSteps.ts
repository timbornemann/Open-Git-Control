import type { TutorialStep } from './types';
import { rebaseStep as s, rebaseField, rebaseConfirm, rebaseContext } from './rebaseLessonHelpers';
import { rebaseStartingSteps } from './rebaseStartingSteps';
import { rebasePauseRecipe as recipe, rebaseControl, rebaseTodoValue, rebasePauseFailure, rebasePauseDismiss } from './rebasePauseLessonHelpers';
import { rebasePauseTodo, isConflictRebaseLesson, type RebasePauseKind, rebaseOriginalMain } from './rebasePauseExamples';
import { mergeHead, element } from './mergeLessonHelpers';
import { fileControl as c } from './fileLessonHelpers';
export function rebasePauseStartingSteps(kind: RebasePauseKind): TutorialStep[] {
  const conflict = isConflictRebaseLesson(kind);
  return [
    ...rebaseStartingSteps(conflict ? 'review' : 'reorder'),
    s(
      'pause-base',
      ['Die Basis bleibt der zweite Commit', 'The base stays the second commit'],
      [
        'Die zwei lokalen Commits werden auf dieser unveränderten Basis neu aufgebaut. Während einer Pause kann HEAD deshalb vorübergehend an einem älteren Stand stehen, während main noch den ursprünglichen vierten Commit bewahrt.',
        'The two local commits are replayed on this unchanged base. During a pause HEAD can temporarily point to an older revision while main still retains the original fourth commit.',
      ],
      rebaseContext(1),
      { prepare: recipe(kind, 'dialog') },
    ),
    s(
      'pause-count',
      ['Der ursprüngliche Bereich hat zwei Commits', 'The original range contains two commits'],
      [
        'Der Dialog zählt den dritten und vierten Commit. Ein zwischenzeitlicher Halt ist noch kein erfolgreich abgeschlossener Neuaufbau dieses gesamten Bereichs.',
        'The dialog counts the third and fourth commits. An intermediate stop is not a successfully completed replay of the entire range.',
      ],
      rebaseContext(2),
      { prepare: recipe(kind, 'dialog') },
    ),
    s(
      'pause-todo',
      conflict
        ? ['Lass den älteren Dokumentationspatch weg', 'Omit the older documentation patch']
        : ['Pausiere am älteren Commit mit edit', 'Pause at the older commit with edit'],
      [
        conflict
          ? 'Ersetze nur das erste pick durch drop. Die zweite Zeile bleibt pick. Die spätere Begrüßung baut auf dem nun ausgelassenen Dokumentationsstand auf; ihre Anwendung wird deshalb an der README stoppen.'
          : 'Ersetze nur das erste pick durch edit. Behalte Hash, Titel und die zweite pick-Zeile. edit übernimmt den ersten Commit und hält danach für deine Bearbeitung an.',
        conflict
          ? 'Replace only the first pick with drop. Keep the second line as pick. The later greeting builds on the now omitted documentation revision, so applying it will stop at the README.'
          : 'Replace only the first pick with edit. Keep the hash, subject and second pick line. edit takes the first commit and then stops for your changes.',
      ],
      rebaseField,
      { prepare: recipe(kind, 'dialog'), completion: rebaseTodoValue(rebasePauseTodo(kind)) },
    ),
    s(
      'pause-start',
      ['Starte den Rebase bis zur vorbereiteten Pause', 'Start the rebase up to the prepared pause'],
      [
        conflict
          ? 'Klicke Rebase starten. Die erwartete Konfliktmeldung bedeutet hier, dass Git einen Teilzustand erreicht hat und deine Auflösung braucht. Sie bedeutet nicht, dass HEAD und Dateien unverändert geblieben sind.'
          : 'Klicke Rebase starten. Die Erfolgsmeldung bestätigt den Start; bei edit wartet der laufende Rebase trotzdem noch auf deine spätere Fortsetzung.',
        conflict
          ? 'Click Start rebase. The expected conflict message means Git reached an intermediate state and needs your resolution. It does not mean HEAD and files stayed unchanged.'
          : 'Click Start rebase. The success message confirms startup; with edit the pending rebase still awaits your later continuation.',
      ],
      rebaseConfirm,
      { prepare: recipe(kind, 'todo'), action: conflict ? 'rebase-conflict' : 'rebase-paused', completion: element(mergeHead(conflict ? 2 : 3)) },
    ),
    s(
      'pause-head',
      ['HEAD ist während der Pause losgelöst', 'HEAD is detached during the pause'],
      [
        conflict
          ? 'HEAD steht auf Basis 2. Der ausgelassene dritte Commit wurde nicht angewendet; der vierte Patch konnte noch nicht gespeichert werden. main zeigt weiterhin auf den ursprünglichen vierten Commit.'
          : 'HEAD steht am übernommenen dritten Commit. main zeigt weiterhin auf den ursprünglichen vierten Commit. Deine Änderungen entstehen zunächst im losgelösten Rebase-Zustand.',
        conflict
          ? 'HEAD points to base 2. Omitted commit 3 was not applied and the fourth patch could not yet be saved. main still points to the original fourth commit.'
          : 'HEAD points to the replayed third commit. main still points to the original fourth commit. Your edits initially belong to the detached rebase state.',
      ],
      mergeHead(conflict ? 2 : 3),
      { prepare: recipe(kind, 'paused') },
    ),
    s(
      'pause-main',
      ['Der ursprüngliche Branch bleibt vorerst erhalten', 'The original branch is retained for now'],
      [
        'Die main-Referenz wird erst nach erfolgreichem Abschluss auf das Ergebnis verschoben. Ein bestätigter Abbruch kann stattdessen auf diesen ursprünglichen Branch-Stand zurückkehren.',
        'The main reference moves to the result only after successful completion. A confirmed abort can instead return to this original branch revision.',
      ],
      rebaseOriginalMain,
      { prepare: recipe(kind, 'paused') },
    ),
    ...(conflict
      ? [
          s(
            'pause-notice',
            ['Lies die erwartete Konfliktmeldung', 'Read the expected conflict message'],
            [
              'Die Meldung bestätigt den angehaltenen Replay und fordert Auflösen, Fortsetzen oder Abbrechen. Der zuvor geprüfte Zwischenstand bleibt erhalten, während du die Meldung liest.',
              'The message confirms the stopped replay and asks for resolution, continuation or abort. The intermediate state you inspected remains while you read it.',
            ],
            rebasePauseFailure + ' .toast-msg',
            { prepare: recipe(kind, 'paused') },
          ),
          s(
            'pause-dismiss',
            ['Schließe die gelesene Meldung', 'Dismiss the message after reading'],
            [
              'Schließe die Meldung mit dem Kreuz. Das beendet den Rebase nicht und verwirft keine Datei; du kannst anschließend seine Konflikte gezielt bearbeiten.',
              'Close the message with its cross. This neither ends the rebase nor discards a file; you can then work on its conflicts.',
            ],
            rebasePauseDismiss,
            { prepare: recipe(kind, 'paused'), completion: { kind: 'absent' as const, selector: rebasePauseFailure } },
          ),
        ]
      : []),
    s(
      'pause-inspector',
      ['Schließe die Commit-Details', 'Close the commit details'],
      [
        'Schließe den Commit-Inspektor, damit die Bereichswahl für den Arbeitsordner und die Staging Area wieder sichtbar wird.',
        'Close the commit inspector to reveal the working directory and staging area selector again.',
      ],
      c('close-inspector'),
      { prepare: recipe(kind, conflict ? 'notice-dismissed' : 'paused'), completion: element(c('open-staging')) },
    ),
    s(
      'pause-staging',
      ['Öffne die Staging Area', 'Open the staging area'],
      [
        'Klicke Staging Area. Dort zeigt die Aktionsgruppe Rebase den laufenden Vorgang samt Fortsetzen und Abbrechen. Die Anzeige wird unabhängig von der Commit-Liste aktualisiert.',
        'Click Staging Area. Its Rebase action group shows the pending operation with Continue and Abort. This status is updated independently of the commit list.',
      ],
      c('open-staging'),
      {
        prepare: recipe(kind, 'staging'),
        completion: { kind: 'all', conditions: [element(c('open-staging') + '[aria-pressed="true"]'), element(rebaseControl('actions'))] },
      },
    ),
    s(
      'pause-operation',
      ['Fortsetzen beendet den Vorgang erst nach der Vorbereitung', 'Continue finishes the operation after preparation'],
      [
        conflict
          ? 'Löse zuerst die Datei und merke ihre gewünschte Fassung vor. Abbrechen öffnet eine eigene Bestätigung und verwirft den Rebase samt seiner erfassten Auflösungen.'
          : 'Bereite die gewünschte Dateifassung vor. Fortsetzen kann vorgemerkte Änderungen mit der bisherigen Nachricht übernehmen; für eine bewusst geänderte Nachricht kannst du vorher Amend verwenden.',
        conflict
          ? 'First resolve the file and stage its intended contents. Abort opens a separate confirmation and discards the rebase and its tracked resolutions.'
          : 'Prepare the intended file contents. Continue can include staged changes with the existing message; to deliberately change the message you can use Amend first.',
      ],
      rebaseControl('actions'),
      { prepare: recipe(kind, 'staging') },
    ),
  ];
}
