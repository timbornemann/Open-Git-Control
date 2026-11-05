import type { TutorialStep, TutorialText } from './types';
import {
  resetStep as s,
  resetRecipe as recipe,
  resetMenu,
  resetDialog,
  resetConfirm,
  resetCancel,
  resetGuardDialog,
  type ResetMode,
} from './resetLessonHelpers';
import { mergeHead, mergeContext, element } from './mergeLessonHelpers';
import { graphRow } from './historyLessonHelpers';
const effects: Record<ResetMode, TutorialText> = {
  soft: [
    'Soft verschiebt HEAD und den aktuellen Branch. Index und Arbeitsdateien bleiben erhalten. Ihre Unterschiede werden danach gegen den neuen HEAD angezeigt.',
    'Soft moves HEAD and the current branch. Index and working files remain intact. Their differences are then shown against the new HEAD.',
  ],
  mixed: [
    'Mixed verschiebt HEAD und ersetzt den Index durch den Zielstand. Die Arbeitsdateien bleiben erhalten. Eine nur im Index vorhandene frühere Fassung wird dabei nicht gesondert bewahrt.',
    'Mixed moves HEAD and replaces the index with the target revision. Working files remain intact. An earlier version held only in the index is not separately preserved.',
  ],
  hard: [
    'Hard verschiebt HEAD und ersetzt Index sowie erfasste Arbeitsdateien durch den Zielstand. Die beiden offenen README-Entwürfe gehen verloren. Unabhängige unversionierte Dateien werden nicht pauschal gelöscht.',
    'Hard moves HEAD and replaces the index and tracked working files with the target revision. Both open README drafts are lost. Independent untracked files are not generally deleted.',
  ],
};
export const resetReviewSteps = (mode: ResetMode): TutorialStep[] => [
  s(
    'menu',
    ['Öffne das Kontextmenü des Zielcommits', 'Open the target commit’s context menu'],
    [
      'Öffne am dritten Commit das Menü mit der rechten Maustaste oder Umschalt+F10. Die Reset-Aktion gilt diesem Zielstand.',
      'Open the third commit’s menu with a right-click or Shift+F10. The reset action applies to this target revision.',
    ],
    graphRow(3),
    { prepare: recipe(mode, 'source'), gesture: 'contextmenu', completion: element(resetMenu(mode)) },
  ),
  s('mode', ['Prüfe Reset --' + mode, 'Check Reset --' + mode], effects[mode], resetMenu(mode), { prepare: recipe(mode, 'menu') }),
  s(
    'open',
    ['Öffne zuerst die Bestätigung', 'Open confirmation first'],
    [
      'Klicke den gewählten Reset-Eintrag. Die Bestätigung erlaubt dir, Ziel und Folgen vor der Änderung zu prüfen.',
      'Click the selected reset entry. Confirmation lets you review the target and consequences before making the change.',
    ],
    resetMenu(mode),
    { prepare: recipe(mode, 'menu'), completion: element(resetDialog) },
  ),
  s('message', ['Lies, welche Zustände umgestellt werden', 'Read which states will change'], effects[mode], resetDialog + ' .dialog-message', {
    prepare: recipe(mode, 'dialog'),
  }),
  s(
    'target-context',
    ['Prüfe den Ziel-Hash', 'Check the target hash'],
    [
      'Der Dialog nennt den dritten Commit als Ziel. main wird auf diesen gespeicherten Stand gesetzt.',
      'The dialog identifies the third commit as the target. main will point to this saved revision.',
    ],
    mergeContext(1),
    { prepare: recipe(mode, 'dialog') },
  ),
  s(
    'mode-context',
    ['Prüfe den vollständigen Reset-Modus', 'Check the complete reset mode'],
    [
      'Der Modus --' +
        mode +
        ' legt fest, was mit Index und Arbeitsdateien passiert. Wähle die Aktion nach der gewünschten Wirkung, nicht nur nach dem Ziel-Hash.',
      'The --' + mode + ' mode determines what happens to the index and working files. Choose the action for its intended effect as well as the target hash.',
    ],
    mergeContext(2),
    { prepare: recipe(mode, 'dialog') },
  ),
  s('impact', ['Lies die Folgen vor dem Bestätigen', 'Read the consequences before confirming'], effects[mode], resetDialog + ' .dialog-impact', {
    prepare: recipe(mode, 'dialog'),
  }),
  s(
    'cancel',
    ['Behalte den Ausgangszustand zunächst bei', 'Keep the starting state for now'],
    [
      'Klicke Abbrechen im Dialog. Diese Entscheidung schließt nur die Bestätigung; main und die beiden offenen Dateifassungen bleiben unverändert.',
      'Click Cancel in the dialog. This closes only confirmation; main and the two open file versions remain unchanged.',
    ],
    resetCancel,
    { prepare: recipe(mode, 'dialog'), completion: { kind: 'absent', selector: resetDialog } },
  ),
  s(
    'kept',
    ['Der vierte Commit ist weiterhin HEAD', 'The fourth commit is still HEAD'],
    [
      'Der Reset wurde nicht ausgeführt. Der vorgemerkte Staging-Text und der spätere Team-Entwurf im Arbeitsordner sind weiterhin getrennt vorhanden.',
      'The reset was not performed. The staged Staging text and later Team draft in the working directory still exist separately.',
    ],
    mergeHead(4),
    { prepare: recipe(mode, 'cancelled') },
  ),
  s(
    'menu-again',
    ['Öffne dasselbe Ziel erneut', 'Open the same target again'],
    [
      'Öffne erneut das Kontextmenü am dritten Commit. Die nächste Bestätigung wird den Reset bewusst ausführen.',
      'Open the third commit’s context menu again. We will deliberately execute the reset after the next confirmation.',
    ],
    graphRow(3),
    { prepare: recipe(mode, 'cancelled'), gesture: 'contextmenu', completion: element(resetMenu(mode)) },
  ),
  s(
    'open-again',
    ['Öffne die geprüfte Reset-Bestätigung erneut', 'Open the reviewed reset confirmation again'],
    ['Wähle erneut Reset --' + mode + ' für den dritten Commit.', 'Choose Reset --' + mode + ' for the third commit again.'],
    resetMenu(mode),
    { prepare: recipe(mode, 'menu'), completion: element(resetDialog) },
  ),
  s(
    'confirm',
    ['Bestätige zunächst den gewählten Reset-Modus', 'First confirm the selected reset mode'],
    [
      'Bestätige den geprüften Modus. Wegen der offenen Dateien zeigt die App danach eine zusätzliche Schutzabfrage. Der Reset wird erst nach deren Bestätigung ausgeführt.',
      'Confirm the reviewed mode. Because there are open file changes, the app then shows an additional safety confirmation. Reset executes only after that confirmation too.',
    ],
    resetConfirm,
    { prepare: recipe(mode, 'dialog'), completion: element(resetGuardDialog(mode)) },
  ),
];
