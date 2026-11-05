import type { TutorialChapter } from './types';
import { rewordStep as s, rewordRecipe, rewordControl as c, rewordMenu, rewordDialog, rewordCancel, rewordConfirm } from './rewordLessonHelpers';
import { graphRow, commitPanel } from './historyLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
function protectedLesson(referenced: boolean): TutorialChapter {
  const guard = referenced ? 'referenced' : 'published',
    number = referenced ? 3 : 2;
  const recipe = (stage: Parameters<typeof rewordRecipe>[0] = 'start') => rewordRecipe(stage, { guard });
  return {
    id: referenced ? 'reword-referenced' : 'reword-protected',
    section: 'repo',
    title: referenced
      ? ['Nachrichtenkorrektur: weitere Referenzen schützen', 'Message editing: protect other references']
      : ['Nachrichtenkorrektur: veröffentlichte Historie schützen', 'Message editing: protect published history'],
    description: referenced
      ? [
          'Einen durch einen lokalen Tag geschützten Vorfahren prüfen und die Ablehnung verstehen.',
          'Inspect an ancestor protected by a local tag and understand the refusal.',
        ]
      : [
          'Einen bereits veröffentlichten Commit prüfen und sicher ohne Umschreiben zurückkehren.',
          'Inspect an already published commit and safely return without rewriting it.',
        ],
    question: referenced
      ? ['Warum verhindert ein Tag das Bearbeiten einer Commit-Nachricht?', 'Why does a tag prevent editing a commit message?']
      : ['Warum kann ich die Nachricht eines veröffentlichten Commits nicht bearbeiten?', 'Why can’t I edit a published commit message?'],
    keywords:
      'reword nachricht bearbeiten geschützt gesperrt blockiert published veröffentlicht referenced referenziert tag ancestor vorfahre sicherheit protection',
    steps: [
      s(
        'scope',
        ['Die Schutzprüfung gehört zum Nachrichteneditor', 'Protection checks are part of the message editor'],
        referenced
          ? [
              'Ein vorbereiteter lokaler Tag bewahrt hier den vierten Commit. Wir prüfen, weshalb auch die Nachricht des dritten Commits in seiner Vorgängerhistorie geschützt ist.',
              'A prepared local tag preserves the fourth commit here. We will check why the message of the earlier third commit in its history is protected too.',
            ]
          : [
              'origin/main zeigt hier auf den zweiten Commit. Wir öffnen dessen Nachrichteneditor und prüfen, weshalb keine neue Historie veröffentlicht werden darf.',
              'origin/main points to the second commit here. We will open its message editor and check why replacement history cannot be published.',
            ],
        '[data-tutorial="graph"]',
        { prepare: recipe() },
      ),
      s(
        'reference',
        referenced
          ? ['Der lokale Tag bewahrt den aktuellen Stand', 'The local tag preserves the current revision']
          : ['Der Zielcommit ist bereits auf origin bekannt', 'The target commit is already known on origin'],
        referenced
          ? [
              'vor-nachrichtenkorrektur zeigt auf den vierten Commit. Dessen Vorgänger sind dadurch ebenfalls über diese Referenz erreichbar.',
              'vor-nachrichtenkorrektur points to the fourth commit. Its ancestors are therefore also reachable through this reference.',
            ]
          : [
              'Die Markierung origin/main am zweiten Commit ist in diesem festen Beispiel der bekannte veröffentlichte Stand. Die App prüft vor einem echten Schreibvorgang zusätzlich die aktuellen Serverreferenzen.',
              'The origin/main label on the second commit is the known published revision in this fixed example. Before a real write, the app additionally checks current server references.',
            ],
        graphRow(referenced ? 4 : 2) + ' .commit-refs',
        { prepare: recipe() },
      ),
      s(
        'select',
        ['Wähle den zu prüfenden Commit', 'Select the commit to inspect'],
        referenced
          ? [
              'Wähle den dritten Dokumentationscommit. Der Tag steht nicht direkt an ihm, enthält ihn aber in seiner Historie.',
              'Select the third documentation commit. The tag is not directly attached to it, but includes it in its history.',
            ]
          : ['Wähle den zweiten Commit mit der Markierung origin/main.', 'Select the second commit marked origin/main.'],
        graphRow(number),
        { prepare: recipe(), completion: element(commitPanel(number)) },
      ),
      s(
        'details',
        ['Die bisherige Nachricht bleibt lesbar', 'The existing message remains readable'],
        [
          'Die Commit-Details zeigen die gespeicherten Angaben. Das bloße Auswählen verändert weder den Commit noch einen Branch.',
          'The commit details show the saved information. Selecting it changes neither the commit nor any branch.',
        ],
        '.commit-details-description',
        { prepare: recipe('selected') },
      ),
      s(
        'menu',
        ['Öffne das Kontextmenü des Zielcommits', 'Open the target commit’s context menu'],
        ['Öffne mit der rechten Maustaste das Menü dieses ausgewählten Commits.', 'Right-click this selected commit to open its menu.'],
        graphRow(number),
        { prepare: recipe('selected'), gesture: 'contextmenu', completion: element(rewordMenu) },
      ),
      s(
        'open',
        ['Starte die Prüfung im Nachrichteneditor', 'Start the checks in the message editor'],
        [
          'Wähle Commit-Nachricht bearbeiten. Die Prüfung erfolgt vor dem Freigeben der Felder und des Übernehmen-Knopfs.',
          'Choose Edit commit message. Checks run before the fields and Apply change button are enabled.',
        ],
        rewordMenu,
        { prepare: recipe('menu'), completion: element(c('block') + `[data-block-reason="${guard}"]`) },
      ),
      s(
        'reason',
        ['Lies den konkreten Sperrgrund', 'Read the specific reason for the block'],
        referenced
          ? [
              'Die Historie ist über eine weitere Referenz erreichbar. Eine Korrektur würde nur main verschieben und zugleich eine andere Fassung am Tag zurücklassen; diese Aktion wird deshalb abgewiesen.',
              'The history is reachable through another reference. A correction would move only main while leaving a different version at the tag, so this action is refused.',
            ]
          : [
              'Der Commit ist bereits veröffentlicht. Diese Aktion schreibt ausschließlich ungepushte Historie um; sie bietet keine Freigabe zum Erzwingen einer Änderung am Server.',
              'The commit is already published. This action rewrites only unpublished history; it offers no override to force a server change.',
            ],
        c('block'),
        { prepare: recipe('dialog') },
      ),
      s(
        'target',
        ['Der Dialog prüft weiterhin den gewählten Commit', 'The dialog still checks the selected commit'],
        [
          'Der kurze Hash bezeichnet den ausgewählten alten Commit. Auch bei einer Ablehnung zeigt die App nicht versehentlich die Nachricht des aktuellen HEAD.',
          'The short hash identifies the selected old commit. Even on refusal the app does not accidentally show the current HEAD’s message.',
        ],
        c('commit'),
        { prepare: recipe('dialog') },
      ),
      s(
        'title',
        ['Der gespeicherte Titel ist gesperrt', 'The saved title is disabled'],
        [
          'Das Titelfeld zeigt den gespeicherten Text, lässt sich bei dieser Sperre aber nicht bearbeiten. Es wurde noch kein Entwurf und kein Ersatzcommit geschrieben.',
          'The title field shows the saved text but cannot be edited while blocked. No draft or replacement commit has been written.',
        ],
        c('title'),
        { prepare: recipe('dialog') },
      ),
      s(
        'description',
        ['Auch die Beschreibung bleibt unverändert', 'The description also remains unchanged'],
        [
          'Das mehrzeilige Beschreibungsfeld ist ebenfalls deaktiviert. Eine Teiländerung nur der Beschreibung umgeht die Schutzprüfung nicht.',
          'The multiline description is disabled too. Editing just the description cannot bypass the protection checks.',
        ],
        c('description'),
        { prepare: recipe('dialog') },
      ),
      s(
        'confirm',
        ['Übernehmen bleibt deaktiviert', 'Apply change stays disabled'],
        [
          'Die App bietet hier keine Bestätigung zum Umgehen der Sperre an. Ein unveröffentlichter und nicht anderweitig referenzierter Commit kann in einer eigenen Übung bearbeitet werden.',
          'The app offers no confirmation to bypass this block. An unpublished commit without other references can be edited in a separate practice lesson.',
        ],
        rewordConfirm,
        { prepare: recipe('dialog') },
      ),
      s(
        'impact',
        ['Die normale Folge wäre eine neue Historie', 'The normal outcome would be new history'],
        [
          'Die allgemeine Erklärung beschreibt neue Hashes und eine Sicherung. Hier wird diese Aktion wegen des Sperrgrunds gar nicht ausgeführt und erzeugt auch keine neue Sicherung.',
          'The general explanation describes new hashes and a backup. Here the block prevents the action from running at all, so it creates no new backup.',
        ],
        c('impact'),
        { prepare: recipe('dialog') },
      ),
      s(
        'cancel',
        ['Schließe die gesperrte Aktion', 'Close the blocked action'],
        [
          'Klicke Abbrechen. Der vorhandene Branch, seine Commits und die schützende Referenz bleiben erhalten.',
          'Click Cancel. The existing branch, its commits and the protecting reference remain intact.',
        ],
        rewordCancel,
        { prepare: recipe('dialog'), completion: { kind: 'all', conditions: [{ kind: 'absent', selector: rewordDialog }, element(mergeHead(4))] } },
      ),
      s(
        'unchanged-head',
        ['HEAD steht weiterhin auf dem vierten Commit', 'HEAD still points to the fourth commit'],
        [
          'Es wurde kein neuer Hash veröffentlicht. Der normale Graph enthält die ursprüngliche lokale Historie.',
          'No new hash was published. The normal graph contains the original local history.',
        ],
        mergeHead(4),
        { prepare: recipe('cancelled') },
      ),
      s(
        'unchanged-ref',
        ['Die schützende Referenz bleibt erhalten', 'The protecting reference is retained'],
        referenced
          ? [
              'Der Tag steht weiterhin am vierten Commit und bewahrt seine vollständige Vorgängerhistorie. Für die Übung wurde keine Referenz gelöscht oder verschoben.',
              'The tag still points to the fourth commit and preserves its complete ancestor history. No reference was deleted or moved for this exercise.',
            ]
          : [
              'origin/main und v1.0.0 stehen weiterhin am zweiten Commit. Weder die lokale Markierung noch ein Server wurde verändert.',
              'origin/main and v1.0.0 still point to the second commit. Neither the local label nor any server was changed.',
            ],
        graphRow(referenced ? 4 : 2) + ' .commit-refs',
        { prepare: recipe('cancelled') },
      ),
      s(
        'finish',
        ['Die Ablehnung wurde sicher nachvollzogen', 'The refusal has been safely examined'],
        [
          'Du hast Zielcommit, Sperrgrund, deaktivierte Felder und unveränderten Ergebnisstand geprüft. Weiter beendet die Lektion.',
          'You checked the target commit, reason, disabled fields and unchanged result. Next finishes this lesson.',
        ],
        '[data-tutorial="graph"]',
        { prepare: recipe('cancelled') },
      ),
    ],
  };
}
export const TUTORIAL_REWORD_PROTECTED = protectedLesson(false);
export const TUTORIAL_REWORD_REFERENCED = protectedLesson(true);
