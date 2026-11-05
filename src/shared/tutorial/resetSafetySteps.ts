import type { TutorialStep } from './types';
import {
  resetStep as s,
  resetRecipe as recipe,
  resetMenu,
  resetDialog,
  resetConfirm,
  resetGuardDialog as dialog,
  resetGuardConfirm as confirm,
  resetGuardCancel as cancel,
  resetResult,
  type ResetMode,
} from './resetLessonHelpers';
import { graphRow, historyContent } from './historyLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
export const resetSafetySteps = (mode: ResetMode): TutorialStep[] => [
  s(
    'guard-message',
    ['Die App hat zusätzlich offene Änderungen erkannt', 'The app also detected open changes'],
    [
      'Die allgemeine Schutzabfrage erscheint wegen der vorgemerkten, geänderten und neuen Dateien. Der Reset ist noch nicht ausgeführt.',
      'The general safety confirmation appears because there are staged, modified and new files. Reset has not executed yet.',
    ],
    dialog(mode) + ' .dialog-message',
    { prepare: recipe(mode, 'guard') },
  ),
  s(
    'guard-command',
    ['Prüfe den vollständigen ausstehenden Befehl', 'Check the complete pending command'],
    [
      'Die Anzeige nennt git reset --' +
        mode +
        ' und den vollständigen Ziel-Hash. Prüfe, dass weiterhin genau dieser Modus und der dritte Commit gewählt sind.',
      'The display names git reset --' + mode + ' and the full target hash. Check that this exact mode and the third commit are still selected.',
    ],
    dialog(mode) + ' .dialog-context-list dd:nth-of-type(1)',
    { prepare: recipe(mode, 'guard') },
  ),
  s(
    'guard-hint',
    ['Der Arbeitsbaum ist vor diesem Vorgang nicht sauber', 'The working tree is not clean before this operation'],
    [
      'Der Hinweis beschreibt unseren vorbereiteten Ausgangszustand. Die README besitzt eine Indexfassung und eine spätere Arbeitsfassung; daneben liegt die neue Notiz.',
      'The hint describes the prepared starting state. The README has an index version and a later working version; a new note exists alongside them.',
    ],
    dialog(mode) + ' .dialog-context-list dd:nth-of-type(2)',
    { prepare: recipe(mode, 'guard') },
  ),
  s(
    'guard-impact',
    ['Die zusätzliche Abfrage ändert den Reset-Modus nicht', 'The additional confirmation does not change the reset mode'],
    mode === 'hard'
      ? [
          'Der zuvor geprüfte Hard Reset verwirft weiterhin Index- und erfasste Arbeitsentwürfe. Die zusätzliche allgemeine Schutzabfrage ersetzt diese Verlustwarnung nicht.',
          'The hard reset reviewed earlier still discards index and tracked working drafts. This additional general confirmation does not replace that loss warning.',
        ]
      : mode === 'mixed'
        ? [
            'Mixed setzt weiterhin den Index auf den dritten Commit. Die Arbeitsdateien bleiben erhalten; die frühere nur im Index gespeicherte Fassung wird ersetzt.',
            'Mixed still resets the index to the third commit. Working files remain intact; the earlier version stored only in the index is replaced.',
          ]
        : [
            'Soft verschiebt weiterhin nur HEAD und main. Index und Arbeitsdateien bleiben als getrennte Fassungen erhalten.',
            'Soft still moves only HEAD and main. Index and working files remain intact as separate versions.',
          ],
    dialog(mode) + ' .dialog-impact',
    { prepare: recipe(mode, 'guard') },
  ),
  s(
    'guard-cancel',
    ['Brich auch diese Schutzabfrage zuerst ab', 'Cancel this safety confirmation first too'],
    [
      'Klicke Abbrechen. Obwohl die erste Bestätigung schon angenommen war, wird der Git-Befehl jetzt nicht ausgeführt.',
      'Click Cancel. Even though the first confirmation was accepted, the Git command will not execute now.',
    ],
    cancel(mode),
    {
      prepare: recipe(mode, 'guard'),
      completion: {
        kind: 'all',
        conditions: [
          { kind: 'absent', selector: resetDialog },
          element(mergeHead(4)),
          {
            kind: 'working-tree',
            staged: ['README.md'],
            unstaged: ['README.md'],
            untracked: ['notes.txt'],
            content: [
              { path: 'README.md', source: 'index', value: historyContent('index') },
              { path: 'README.md', source: 'worktree', value: historyContent('work') },
            ],
          },
        ],
      },
    },
  ),
  s(
    'guard-kept',
    ['Beide Entwürfe und der bisherige HEAD bleiben erhalten', 'Both drafts and the former HEAD remain intact'],
    [
      'main steht weiter am vierten Commit. Die Staging- und Team-Fassungen sind unverändert vorhanden. Die zweite Schutzabfrage war eine eigenständige Entscheidung.',
      'main still points to the fourth commit. The Staging and Team versions remain unchanged. The second safety confirmation was a separate decision.',
    ],
    mergeHead(4),
    { prepare: recipe(mode, 'guard-cancelled') },
  ),
  s(
    'guard-menu',
    ['Wähle das Ziel für den endgültigen Versuch erneut', 'Select the target again for the final attempt'],
    ['Öffne das Kontextmenü des dritten Commits erneut.', 'Open the third commit’s context menu again.'],
    graphRow(3),
    { prepare: recipe(mode, 'guard-cancelled'), gesture: 'contextmenu', completion: element(resetMenu(mode)) },
  ),
  s(
    'guard-reset-open',
    ['Öffne erneut die Modus-Bestätigung', 'Open mode confirmation again'],
    [
      'Wähle erneut Reset --' + mode + '. Wir bestätigen anschließend beide Prüfungen bewusst.',
      'Choose Reset --' + mode + ' again. We will then deliberately accept both confirmations.',
    ],
    resetMenu(mode),
    { prepare: recipe(mode, 'menu'), completion: element(resetDialog) },
  ),
  s(
    'guard-reopen',
    ['Gehe von der Modus-Bestätigung zur Schutzabfrage', 'Proceed from mode confirmation to the safety confirmation'],
    [
      'Bestätige den Modus erneut. Die zusätzliche Abfrage nennt danach wieder den vollständigen Befehl und die offenen Änderungen.',
      'Confirm the mode again. The additional confirmation then identifies the full command and open changes again.',
    ],
    resetConfirm,
    { prepare: recipe(mode, 'dialog'), completion: element(dialog(mode)) },
  ),
  s(
    'guard-confirm',
    ['Führe den geprüften Reset jetzt aus', 'Execute the reviewed reset now'],
    [
      'Klicke Trotzdem ausführen. Erst jetzt führt die App den Git-Befehl aus. Die Übung prüft den neuen HEAD, den Index, die Arbeitsdatei und die unabhängige Notiz getrennt.',
      'Click Run anyway. Only now does the app execute the Git command. The exercise checks the new HEAD, index, working file and independent note separately.',
    ],
    confirm(mode),
    { prepare: recipe(mode, 'guard'), completion: resetResult(mode) },
  ),
];
