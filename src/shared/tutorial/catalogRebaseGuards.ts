import type { TutorialChapter, TutorialText } from './types';
import { rebaseStep as s, rebaseMenu } from './rebaseLessonHelpers';
import {
  rebaseGuardRecipe as recipe,
  rebaseGuardHead,
  rebaseGuardTarget,
  rebaseGuardId,
  REBASE_GUARD_MESSAGES,
  rebaseGuardFailure,
  rebaseGuardDismiss,
  type RebaseGuardKind,
} from './rebaseGuardLessonHelpers';
import { graphRow, commitPanel } from './historyLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
import { tree } from './stagingLessonHelpers';
type Copy = { title: TutorialText; description: TutorialText; question: TutorialText; reason: TutorialText };
const copy: Record<RebaseGuardKind, Copy> = {
  root: {
    title: ['Rebase-Grenze: den Root-Commit erkennen', 'Rebase limit: recognize the root commit'],
    description: [
      'Den ersten Commit und seinen fehlenden Vorgänger prüfen; die Ablehnung lesen und den unveränderten Arbeitsstand kontrollieren.',
      'Inspect the first commit and its missing parent; read the refusal and check the unchanged working state.',
    ],
    question: ['Warum öffnet der Root-Commit keinen interaktiven Rebase?', 'Why does the root commit not open interactive rebase?'],
    reason: [
      'Der erste Commit hat keinen Vorgänger. Dieses Menü startet den gewählten Bereich auf dem Vorgänger seiner Auswahl und bietet hier keinen Root-Rebase an.',
      'The first commit has no parent. This menu starts the selected range on its parent and does not offer a root rebase here.',
    ],
  },
  'off-head': {
    title: ['Rebase-Grenze: Commit außerhalb des aktuellen HEAD-Pfads', 'Rebase limit: a commit outside the current HEAD path'],
    description: [
      'Eine andere Entwicklungslinie auswählen, die Grenze zum aktiven Branch erkennen und die verweigerte Aktion ohne Branchwechsel prüfen.',
      'Select another development line, distinguish it from the active branch and inspect the refusal without switching branches.',
    ],
    question: [
      'Warum kann ich einen Commit eines anderen Branches nicht direkt auf main rebasen?',
      'Why can I not directly rebase another branch’s commit while on main?',
    ],
    reason: [
      'Der fünfte Commit gehört zu feature/begruessung und liegt nicht in der Vorgängerkette von main. Eine Auswahl im Graphen wechselt den aktiven Branch nicht.',
      'The fifth commit belongs to feature/begruessung and is not in main’s ancestor chain. Selecting it in the graph does not switch the active branch.',
    ],
  },
  merge: {
    title: ['Rebase-Grenze: ein Bereich mit Merge-Commit', 'Rebase limit: a range containing a merge commit'],
    description: [
      'Einen vorbereiteten Merge mit zwei Vorgängern untersuchen und die ausdrückliche Grenze dieses interaktiven Rebase-Dialogs kennenlernen.',
      'Inspect a prepared merge with two parents and learn this interactive rebase dialog’s explicit limit.',
    ],
    question: ['Warum lehnt der interaktive Rebase einen Merge-Commit ab?', 'Why does interactive rebase refuse a merge commit?'],
    reason: [
      'Der sechste Commit hat zwei Vorgänger. Dieser Dialog unterstützt nur seinen angebotenen linearen Ablauf und weist einen Bereich mit Merge-Commits ausdrücklich ab.',
      'The sixth commit has two parents. This dialog supports only its offered linear flow and explicitly refuses a range containing merge commits.',
    ],
  },
};
function build(kind: RebaseGuardKind): TutorialChapter {
  const head = rebaseGuardHead(kind),
    selected = rebaseGuardTarget(kind);
  const unchanged = { kind: 'all' as const, conditions: [element(mergeHead(head)), tree([], [], [])] };
  return {
    id: rebaseGuardId(kind),
    section: 'repo',
    title: copy[kind].title,
    description: copy[kind].description,
    question: copy[kind].question,
    keywords: 'rebase schutz grenze abgelehnt root merge vorgänger parent head pfad branch anderer unverändert fehlermeldung',
    steps: [
      s('scope', copy[kind].title, copy[kind].description, '[data-tutorial="graph"]', { prepare: recipe(kind) }),
      s(
        'guard-head',
        ['Prüfe zuerst den aktiven Branch', 'First check the active branch'],
        [
          'main und HEAD stehen auf demselben gespeicherten Ziel. Die spätere Auswahl soll diesen Branch nicht unbemerkt wechseln oder seine Historie verändern.',
          'main and HEAD point to the same saved target. The later selection must not silently switch this branch or change its history.',
        ],
        mergeHead(head),
        { prepare: recipe(kind) },
      ),
      s('guard-target', ['Untersuche den besonderen Zielcommit', 'Inspect the special target commit'], copy[kind].reason, graphRow(selected), {
        prepare: recipe(kind),
      }),
      s(
        'guard-select',
        ['Wähle den beschriebenen Commit aus', 'Select the commit described above'],
        [
          'Klicke diesen Commit. Seine Auswahl öffnet nur die Details; sie ändert keine Arbeitsdatei und führt noch keinen Rebase aus.',
          'Click this commit. Selecting it only opens details; it changes no working file and does not run a rebase.',
        ],
        graphRow(selected),
        { prepare: recipe(kind), completion: element(commitPanel(selected)) },
      ),
      s(
        'guard-message',
        ['Der Titel identifiziert die Auswahl', 'The subject identifies the selection'],
        [
          'Prüfe den Titel im Graphen und den Hash der geöffneten Details. Das Kontextmenü bezieht sich genau auf diese Auswahl.',
          'Check the subject in the graph and the hash in the open details. The context menu applies precisely to this selection.',
        ],
        graphRow(selected) + ' .commit-subject',
        { prepare: recipe(kind, 'selected') },
      ),
      s(
        'guard-menu',
        ['Öffne das Kontextmenü der Auswahl', 'Open the selection’s context menu'],
        [
          'Öffne das Menü mit Rechtsklick oder Umschalt+F10. Der Rebase-Eintrag bleibt sichtbar; die Gültigkeit des Bereichs wird beim Öffnen der Aktion geprüft.',
          'Open the menu with a right-click or Shift+F10. The rebase entry remains visible; the range is validated when the action is opened.',
        ],
        graphRow(selected),
        { prepare: recipe(kind, 'selected'), gesture: 'contextmenu', completion: element(rebaseMenu) },
      ),
      s('guard-review', ['Die angebotene Aktion hat eine klare Grenze', 'The offered action has a clear limit'], copy[kind].reason, rebaseMenu, {
        prepare: recipe(kind, 'menu'),
      }),
      s(
        'attempt',
        ['Probiere die geschützte Auswahl aus', 'Try the protected selection'],
        [
          'Klicke Interaktiver Rebase bis … und lies die erwartete Ablehnung. Die App soll keinen Todo-Dialog öffnen und keinen Ersatzvorgang ausführen.',
          'Click Interactive rebase through … and read the expected refusal. The app must not open a todo dialog or run a replacement operation.',
        ],
        rebaseMenu,
        {
          prepare: recipe(kind, 'menu'),
          completion: { kind: 'all', conditions: [unchanged, { kind: 'feedback', trigger: rebaseMenu, message: REBASE_GUARD_MESSAGES[kind], error: true }] },
        },
      ),
      s(
        'guard-notice',
        ['Die Meldung erklärt genau diesen Grund', 'The message explains this specific reason'],
        copy[kind].reason,
        rebaseGuardFailure + ' .toast-msg',
        { prepare: recipe(kind, 'rejected') },
      ),
      s(
        'guard-preserved',
        ['HEAD und main sind unverändert', 'HEAD and main are unchanged'],
        [
          'Der bisherige aktive Commit steht noch am selben Hash. Diese Vorprüfung hat keine teilweise Umschreibung gestartet und keinen Branch ausgewechselt.',
          'The active commit still has the same hash. This preflight check started no partial rewrite and switched no branch.',
        ],
        mergeHead(head),
        { prepare: recipe(kind, 'rejected') },
      ),
      s(
        'guard-no-editor',
        ['Es gibt keinen begonnenen Rebase zum Fortsetzen', 'There is no started rebase to continue'],
        [
          'Der Graph bleibt erhalten. Es gibt keinen Todo-Dialog, keinen losgelösten Rebase-Zwischenstand und keine neue Indexänderung; hier genügt das Schließen der Meldung.',
          'The graph is retained. There is no todo dialog, detached rebase state or new staged change; dismissing the message is sufficient here.',
        ],
        '[data-tutorial="graph"]',
        { prepare: recipe(kind, 'rejected') },
      ),
      s(
        'guard-dismiss',
        ['Schließe die gelesene Meldung', 'Dismiss the message after reading'],
        [
          'Schließe die Fehlermeldung mit dem Kreuz. Das führt keine neue Git-Aktion aus und umgeht die Einschränkung nicht.',
          'Close the error message with its cross. This runs no new Git action and does not bypass the restriction.',
        ],
        rebaseGuardDismiss,
        { prepare: recipe(kind, 'rejected'), completion: { kind: 'all', conditions: [unchanged, { kind: 'absent', selector: rebaseGuardFailure }] } },
      ),
      s(
        'guard-complete',
        ['Die unveränderte Rückkehr ist geprüft', 'The unchanged return is verified'],
        [
          'Du kennst jetzt diesen Ablehnungsgrund. Für die unterstützten linearen Bereiche bieten die übrigen Rebase-Lektionen eigene frische Übungen.',
          'You now understand this refusal reason. Other rebase lessons provide fresh exercises for the supported linear ranges.',
        ],
        mergeHead(head),
        { prepare: recipe(kind, 'dismissed') },
      ),
    ],
  };
}
export const TUTORIAL_REBASE_GUARDS = (['root', 'off-head', 'merge'] as const).map(build);
