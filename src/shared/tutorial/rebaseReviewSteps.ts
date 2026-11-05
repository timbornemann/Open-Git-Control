import type { TutorialStep, TutorialText } from './types';
import {
  rebaseStep as s,
  rebaseRecipe as recipe,
  rebaseField,
  rebaseDialog,
  rebaseContext,
  rebaseCancel,
  rebaseMenu,
  rebaseConfirm,
} from './rebaseLessonHelpers';
import { rebaseTodo, rebaseResultNumber, type RebaseLessonMode } from './rebaseLessonExamples';
import { graphRow } from './historyLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
const instructions: Record<RebaseLessonMode, TutorialText> = {
  review: [
    'Lass beide Zeilen bei pick. Dadurch bleiben Reihenfolge, Nachrichten und Änderungen erhalten. Wir lernen zuerst das Prüfen und Abbrechen des Dialogs.',
    'Leave both lines as pick. This keeps the order, messages and changes. First we will learn to review and cancel the dialog.',
  ],
  reword: [
    'Ersetze nur pick am Anfang der ersten Zeile durch reword und deren Titel durch „docs: Zweck des Lernprojekts präzisieren“. Die zweite Zeile bleibt vollständig unverändert.',
    'Replace only pick at the start of the first line with reword and its subject with “docs: clarify the learning project’s purpose”. Leave the second line completely unchanged.',
  ],
  squash: [
    'Ersetze nur pick am Anfang der zweiten Zeile durch squash. Die erste Zeile bleibt pick; die zweite wird mit diesem vorherigen Commit kombiniert.',
    'Replace only pick at the start of the second line with squash. Keep the first line as pick; the second will be combined with that preceding commit.',
  ],
  fixup: [
    'Ersetze nur pick am Anfang der zweiten Zeile durch fixup. Die erste Zeile bleibt pick; die Änderungen der zweiten werden aufgenommen und ihre Nachricht verworfen.',
    'Replace only pick at the start of the second line with fixup. Keep the first line as pick; the second line’s changes will be included and its message discarded.',
  ],
  drop: [
    'Ersetze nur pick am Anfang der zweiten Zeile durch drop. Damit wird die neueste Begrüßungsänderung beim Neuaufbau ausgelassen; der ältere Dokumentationscommit bleibt.',
    'Replace only pick at the start of the second line with drop. This omits the newest greeting change during replay; the older documentation commit stays.',
  ],
  reorder: [
    'Verschiebe die vollständige zweite Zeile vor die erste. Beide behalten pick, ihren Hash und ihren eigenen Titel. Oben steht danach die Begrüßung, darunter der Lizenzhinweis.',
    'Move the complete second line above the first. Both retain pick, their hash and their own subject. The greeting is now first, followed by the license note.',
  ],
};
export function rebaseReviewSteps(mode: RebaseLessonMode): TutorialStep[] {
  return [
    s(
      'base',
      ['Die Basis bleibt außerhalb der Todo-Liste', 'The base stays outside the todo list'],
      [
        'Basis nennt den kurzen Hash des zweiten Commits. Dieser Vorgänger wird nicht bearbeitet. Die Todo-Zeilen beschreiben nur die ausgewählten Commits nach dieser Basis.',
        'Base gives the second commit’s short hash. This parent is not edited. The todo lines describe only the selected commits after this base.',
      ],
      rebaseContext(1),
      { prepare: recipe(mode, 'dialog') },
    ),
    s(
      'count',
      ['Zwei Commits werden angeboten', 'Two commits are offered'],
      [
        'Commit-Anzahl ist 2: der dritte und vierte Commit. Das ist die Größe des ursprünglichen Bereichs; squash, fixup oder drop können später weniger Ergebniscommits erzeugen.',
        'Commit count is 2: the third and fourth commits. This is the size of the original range; squash, fixup or drop can produce fewer result commits.',
      ],
      rebaseContext(2),
      { prepare: recipe(mode, 'dialog') },
    ),
    s(
      'order',
      ['Todo wird von oben nach unten ausgeführt', 'Todo runs from top to bottom'],
      [
        'Die erste Zeile ist der ältere dritte Commit, die zweite der neuere vierte. Diese Ausführungsreihenfolge ist die Umkehrung der sichtbaren Graph-Reihenfolge.',
        'The first line is the older third commit; the second is the newer fourth. This execution order is the reverse of the visible graph order.',
      ],
      rebaseField,
      { prepare: recipe(mode, 'dialog') },
    ),
    s(
      'action-column',
      ['Das erste Wort ist die Aktion', 'The first word is the action'],
      [
        'pick übernimmt die Änderung. reword ersetzt hier den Titel, edit pausiert zur Bearbeitung. squash und fixup verbinden mit der vorherigen behaltenen Zeile; drop lässt einen Commit aus.',
        'pick takes the change. Here reword replaces the subject and edit pauses for editing. squash and fixup combine with the preceding retained line; drop omits a commit.',
      ],
      rebaseField,
      { prepare: recipe(mode, 'dialog') },
    ),
    s(
      'hash-column',
      ['Der Hash bestimmt den ursprünglichen Commit', 'The hash identifies the original commit'],
      [
        'Nach der Aktion folgt der Hash des ursprünglichen Commits. Behalte ihn beim Ändern der Aktion unverändert. Beim Umordnen verschiebst du die ganze Zeile, damit Hash und Titel zusammenbleiben.',
        'The action is followed by the original commit’s hash. Keep it unchanged when changing the action. When reordering, move the complete line so hash and subject stay together.',
      ],
      rebaseField,
      { prepare: recipe(mode, 'dialog') },
    ),
    s(
      'subject-column',
      ['Der Rest der Zeile ist der Titel', 'The rest of the line is the subject'],
      [
        'Bei pick dient dieser Titel der Orientierung; seine Bearbeitung allein benennt nichts um. Bei reword verwendet die App ihn ausdrücklich als neuen vollständigen Titel und erhält die bisherige Beschreibung.',
        'For pick this subject is a label; editing it alone does not rename anything. For reword the app explicitly uses it as the new complete subject and preserves the existing description.',
      ],
      rebaseField,
      { prepare: recipe(mode, 'dialog') },
    ),
    s(
      'required',
      ['Eine Todo-Liste ist erforderlich', 'A todo list is required'],
      [
        'Das mehrzeilige Pflichtfeld braucht mindestens einen gültigen Eintrag. Arbeite innerhalb des angebotenen Bereichs. squash und fixup brauchen einen vorangehenden behaltenen Commit und können nicht allein beginnen.',
        'The required multiline field needs at least one valid entry. Stay within the offered range. squash and fixup need a preceding retained commit and cannot start on their own.',
      ],
      rebaseField,
      { prepare: recipe(mode, 'dialog') },
    ),
    s(
      'edit-todo',
      mode === 'review' ? ['Prüfe beide pick-Zeilen', 'Check both pick lines'] : ['Bearbeite gezielt die Todo-Liste', 'Make the intended todo edit'],
      instructions[mode],
      rebaseField,
      {
        prepare: recipe(mode, 'dialog'),
        ...(mode === 'review' ? {} : { completion: { kind: 'value' as const, selector: rebaseField, value: rebaseTodo(mode) } }),
      },
    ),
    s(
      'impact',
      ['Lies die Folgen des Umschreibens', 'Read the effect of rewriting'],
      [
        'Die Folgenzeile warnt vor lokalem Umschreiben und nennt Fortsetzen/Abbrechen bei Konflikten. Die allgemeine Angabe „nicht irreversibel“ ist keine Zusage, dass bereits veröffentlichte Historie problemlos umgeschrieben werden kann.',
        'The impact text warns about local rewriting and mentions continue/abort for conflicts. The general “not irreversible” label does not mean that rewriting published history is harmless.',
      ],
      rebaseDialog + ' .dialog-impact',
      { prepare: recipe(mode, 'edited') },
    ),
    s(
      'cancel',
      ['Probiere zuerst Abbrechen', 'Try Cancel first'],
      [
        'Klicke Abbrechen. Das Schließen des Todo-Dialogs führt noch keinen Rebase aus. main, Dateien und die alten Commit-Nachrichten müssen unverändert bleiben.',
        'Click Cancel. Closing the todo dialog does not run a rebase. main, files and the old commit messages must stay unchanged.',
      ],
      rebaseCancel,
      { prepare: recipe(mode, 'edited'), completion: { kind: 'absent', selector: rebaseField } },
    ),
    s(
      'cancel-check',
      ['HEAD ist noch der vierte Commit', 'HEAD is still the fourth commit'],
      [
        'Die Änderungen im Formular waren nur ein Entwurf. Der Graph zeigt weiterhin den bisherigen vierten Commit als HEAD; die vorbereitete Dateiänderung wurde nicht angewendet oder verworfen.',
        'The form edits were only a draft. The graph still shows the old fourth commit as HEAD; no prepared file change was applied or discarded.',
      ],
      mergeHead(4),
      { prepare: recipe(mode, 'cancelled') },
    ),
    s(
      'reopen-menu',
      ['Öffne das Kontextmenü erneut', 'Open the context menu again'],
      [
        'Öffne das Kontextmenü wieder am dritten Commit. Damit wählst du erneut denselben ursprünglichen Bereich.',
        'Open the third commit’s context menu again. This selects the same original range again.',
      ],
      graphRow(3),
      { prepare: recipe(mode, 'cancelled'), gesture: 'contextmenu', completion: element(rebaseMenu) },
    ),
    s(
      'reopen',
      ['Öffne einen frischen Todo-Dialog', 'Open a fresh todo dialog'],
      [
        'Wähle den interaktiven Rebase erneut. Die App liest den Bereich neu und bietet wieder zwei pick-Zeilen an; dein abgebrochener Formularentwurf wird nicht automatisch ausgeführt.',
        'Choose interactive rebase again. The app reads the range again and offers two pick lines; your cancelled form draft is not automatically executed.',
      ],
      rebaseMenu,
      { prepare: recipe(mode, 'menu'), completion: element(rebaseField) },
    ),
    s(
      'restore-todo',
      mode === 'review'
        ? ['Behalte die ursprüngliche Auswahl', 'Keep the original selection']
        : ['Trage die gewünschte Änderung erneut ein', 'Enter the intended edit again'],
      instructions[mode],
      rebaseField,
      {
        prepare: recipe(mode, 'dialog'),
        ...(mode === 'review' ? {} : { completion: { kind: 'value' as const, selector: rebaseField, value: rebaseTodo(mode) } }),
      },
    ),
    s(
      'apply-review',
      ['Prüfe den vollständigen Auftrag vor dem Start', 'Review the whole request before starting'],
      [
        'Prüfe Basis, ursprüngliche Commit-Anzahl und jede vollständige Todo-Zeile. Erst Rebase starten ändert die Historie; das Ausfüllen des Felds hat noch nichts veröffentlicht.',
        'Check the base, original commit count and every complete todo line. Only Start rebase changes history; filling the field has not published anything.',
      ],
      rebaseField,
      { prepare: recipe(mode, 'edited') },
    ),
    s(
      'apply',
      ['Starte den vorbereiteten Rebase', 'Start the prepared rebase'],
      [
        'Klicke Rebase starten und warte auf den bestätigten neuen Zustand. Die Übung erkennt den erfolgreichen Abschluss; ein Fehler schließt keinen Schritt erfolgreich ab.',
        'Click Start rebase and wait for the confirmed result. The exercise recognizes successful completion; an error does not complete the step.',
      ],
      rebaseConfirm,
      { prepare: recipe(mode, 'edited'), action: 'rebased', completion: element(mergeHead(rebaseResultNumber(mode))) },
    ),
  ];
}
