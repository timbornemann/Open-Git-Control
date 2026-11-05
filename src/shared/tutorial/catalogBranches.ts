import type { TutorialChapter } from './types';
import {
  branchStep as s,
  branchRecipe as seed,
  branchControl as c,
  branchPanel as panel,
  branchRow as row,
  branchName as name,
  branchElement as element,
  branchValue as value,
} from './branchLessonHelpers';
import { graphRow } from './historyLessonHelpers';

export const TUTORIAL_BRANCHES: TutorialChapter = {
  id: 'branches',
  section: 'repo',
  title: ['Branches finden und lokal erstellen', 'Find branches and create one locally'],
  description: [
    'Lokale und entfernte Einträge, HEAD, Ein-/Ausklappen, Suche, Namen, Erstellen und die getrennte Veröffentlichung einzeln üben.',
    'Practice local and remote entries, HEAD, collapse/expand, filtering, names, creation and the separate publication decision.',
  ],
  question: ['Wie finde und erstelle ich einen lokalen Branch?', 'How do I find and create a local branch?'],
  keywords: 'branch branches zweig lokal local remote head erstellen create filter suche search name publish veröffentlichen enter tastatur keyboard',
  steps: [
    s(
      'overview',
      ['Ein Branch benennt einen gespeicherten Stand', 'A branch names a saved state'],
      [
        'Ein Branch ist ein beweglicher Name für einen Commit. Neue Commits verschieben den aktiven Branch. In dieser Lektion lesen wir zuerst die Branch-Liste und erstellen anschließend einen eigenen lokalen Namen.',
        'A branch is a movable name for a commit. New commits move the active branch. In this lesson, first read the branch list, then create a local branch of your own.',
      ],
      c('sidebar-toggle'),
      { continue: false, prepare: seed({ sidebarCollapsed: true }) },
    ),
    s(
      'open-sidebar',
      ['Öffne die Git-Seitenleiste', 'Open the Git sidebar'],
      [
        'Klicke oben links den Schalter zum Öffnen der Seitenleiste. Er blendet die Git-Bereiche des aktuellen Repositories ein. In kleinen Fenstern kann diese Leiste zunächst eingeklappt sein.',
        'Click the sidebar toggle at the upper left. It reveals the Git sections for the current repository. In a small window, this sidebar may initially be collapsed.',
      ],
      c('sidebar-toggle'),
      { prepare: seed({ sidebarCollapsed: true }), completion: element(panel) },
    ),
    s(
      'local',
      ['Lokale Branches gehören zu diesem Repository', 'Local branches belong to this repository'],
      [
        'Unter Lokal stehen main und feature/begruessung. Diese Namen existieren im ausgewählten Repository. Das Wort feature und der Schrägstrich sind eine Namenskonvention; sie erstellen keinen Dateiordner.',
        'The Local group contains main and feature/begruessung. These names exist in the selected repository. The word feature and slash are a naming convention; they do not create a file-system folder.',
      ],
      row('main'),
      { prepare: seed() },
    ),
    s(
      'head',
      ['HEAD kennzeichnet den aktiven Branch', 'HEAD marks the active branch'],
      [
        'Die Markierung HEAD und die hervorgehobene Zeile zeigen hier main. Ein Commit würde diesen Branch vorwärts bewegen. Das bloße Lesen oder Filtern der Liste ändert den aktiven Branch nicht.',
        'The HEAD badge and highlighted row identify main. A commit would move this branch forward. Reading or filtering the list does not change the active branch.',
      ],
      `${row('main')} .branch-head-badge`,
      { prepare: seed() },
    ),
    s(
      'remote',
      ['Remote-Einträge sind lokale Kenntnis vom Server', 'Remote entries are local knowledge of the server'],
      [
        'origin/main steht im Bereich Remote. Das ist der zuletzt bekannte Stand dieses entfernten Branches, kein geöffnetes Server-Verzeichnis. Fetch aktualisiert solche Einträge; das behandeln wir in den Synchronisierungslektionen.',
        'origin/main appears in the Remote group. It is the last known state of that remote branch, not an open server directory. Fetch updates these entries; the synchronization lessons cover that separately.',
      ],
      row('remotes/origin/main'),
      { prepare: seed() },
    ),
    s(
      'collapse',
      ['Klappe die Branch-Liste ein', 'Collapse the branch list'],
      [
        'Klicke die Überschrift beziehungsweise ihren Pfeil. Dadurch verschwindet die lange Liste aus der Seitenleiste. Branches werden dabei weder gelöscht noch gewechselt.',
        'Click the heading or its arrow. This hides the long list in the sidebar without deleting or switching any branches.',
      ],
      `${panel} .repo-card-toggle`,
      { prepare: seed(), completion: element(`${panel} .repo-card-toggle[aria-expanded="false"]`) },
    ),
    s(
      'collapsed',
      ['Der eingeklappte Bereich spart Platz', 'The collapsed section saves space'],
      [
        'Die Überschrift bleibt erreichbar. Der aktive Branch und seine Dateien bleiben erhalten. Einklappen ist eine Ansichtsentscheidung und kann bei vielen Git-Bereichen die Übersicht erleichtern.',
        'The heading remains available. The active branch and its files remain unchanged. Collapsing is a view choice that helps when the sidebar contains many Git sections.',
      ],
      panel,
      { prepare: seed({ collapsed: true }) },
    ),
    s(
      'expand',
      ['Blende die Einträge wieder ein', 'Show the entries again'],
      [
        'Klicke erneut auf die Überschrift. Das Suchfeld und beide Gruppen sollen wieder erscheinen. Diese Navigation gehört genauso zur Bedienung wie die späteren Git-Aktionen.',
        'Click the heading again. The search field and both groups should reappear. This navigation is part of using the interface, just like the Git actions that follow.',
      ],
      `${panel} .repo-card-toggle`,
      { prepare: seed({ collapsed: true }), completion: element(c('branch-filter')) },
    ),
    s(
      'search',
      ['Filtere nach dem Beispielbranch', 'Filter for the sample branch'],
      [
        'Trage feature/begruessung in die Branch-Suche ein. Die Suche betrachtet die Branch-Namen in beiden Gruppen und grenzt nur diese Liste ein.',
        'Enter feature/begruessung in the branch search. The filter matches branch names in both groups and narrows only this list.',
      ],
      c('branch-filter'),
      { prepare: seed(), completion: value(c('branch-filter'), 'feature/begruessung') },
    ),
    s(
      'search-result',
      ['Ein Treffer bedeutet keinen Branchwechsel', 'A match does not switch branches'],
      [
        'Der passende lokale Eintrag bleibt sichtbar. main ist durch den Filter ausgeblendet, bleibt aber aktiv. Ein Wechsel braucht einen bewussten Klick auf einen anderen lokalen Branch.',
        'The matching local entry remains visible. The filter hides main, but main remains active. Switching requires an intentional click on another local branch.',
      ],
      row('feature/begruessung'),
      { prepare: seed({ query: 'feature/begruessung' }) },
    ),
    s(
      'no-match',
      ['Probiere eine Suche ohne Treffer', 'Try a filter with no matches'],
      [
        'Ersetze den Suchtext durch kein-branch-42. So lernst du die leere Ergebnisanzeige kennen, ohne einen Branch zu löschen.',
        'Replace the filter with kein-branch-42. This lets you recognize an empty result without deleting a branch.',
      ],
      c('branch-filter'),
      {
        prepare: seed({ query: 'feature/begruessung' }),
        completion: { kind: 'all', conditions: [value(c('branch-filter'), 'kein-branch-42'), element(`${panel}:not(:has([data-branch-name]))`)] },
      },
    ),
    s(
      'empty',
      ['Die Liste ist gefiltert, das Repository ist vorhanden', 'The list is filtered; the repository still exists'],
      [
        'Beide Gruppen melden keine passenden Einträge. Das betrifft ausschließlich die aktuelle Suche. Prüfe deshalb zuerst den Suchtext, wenn du einen bekannten Branch nicht findest.',
        'Both groups report no matching entries. This concerns only the current filter. Check the filter first if a known branch seems to be missing.',
      ],
      `${panel} .repo-card-scroll`,
      { prepare: seed({ query: 'kein-branch-42' }) },
    ),
    s(
      'clear',
      ['Leere die Branch-Suche', 'Clear the branch filter'],
      [
        'Entferne den Suchtext vollständig. main, feature/begruessung und der Remote-Eintrag sollen wieder sichtbar sein, bevor wir einen Branch anlegen.',
        'Remove the entire filter. main, feature/begruessung and the remote entry should be visible again before creating a branch.',
      ],
      c('branch-filter'),
      { prepare: seed({ query: 'kein-branch-42' }), completion: { kind: 'all', conditions: [value(c('branch-filter'), ''), element(row('main', true))] } },
    ),
    s(
      'open-create',
      ['Öffne das Feld für einen neuen Branch', 'Open the new-branch field'],
      [
        'Klicke das Plus im Branch-Bereich. Es öffnet ein Namensfeld direkt in dieser Liste. Alle folgenden Eingaben betreffen nur das Lernprojekt.',
        'Click the plus in the Branches section. A name field opens directly in this list. Every following input affects only the learning project.',
      ],
      c('create-branch'),
      { prepare: seed(), completion: element(c('branch-name')) },
    ),
    s(
      'name-rules',
      ['Ein Branch-Name braucht eine gültige Schreibweise', 'A branch name needs valid syntax'],
      [
        'Namen dürfen beispielsweise keine Leerzeichen oder zwei aufeinanderfolgenden Punkte enthalten. feature/lernen ist eine gültige Konvention. Enter bestätigt den Namen; Escape bricht das Namensfeld ab.',
        'Names cannot contain spaces or two consecutive dots, for example. feature/lernen is a valid convention. Enter submits the name; Escape cancels the name field.',
      ],
      c('branch-name'),
      { prepare: seed({ creating: true }) },
    ),
    s(
      'invalid-name',
      ['Gib zunächst einen ungültigen Namen ein', 'First enter an invalid name'],
      [
        'Trage mein branch mit dem Leerzeichen ein. Wir prüfen die Rückmeldung vor dem eigentlichen Erstellen.',
        'Enter mein branch, including its space. We will inspect the validation feedback before creating the actual branch.',
      ],
      c('branch-name'),
      { prepare: seed({ creating: true }), completion: value(c('branch-name'), 'mein branch') },
    ),
    s(
      'invalid-submit',
      ['Prüfe den Namen mit Enter', 'Validate the name with Enter'],
      [
        'Drücke Enter im Namensfeld. Die App soll den ungültigen Namen ablehnen. main bleibt aktiv, und das Feld bleibt für die Korrektur geöffnet.',
        'Press Enter in the name field. The app should reject the invalid name. main remains active and the field stays open for correction.',
      ],
      c('branch-name'),
      {
        prepare: seed({ creating: true, name: 'mein branch' }),
        completion: {
          kind: 'feedback',
          trigger: c('branch-name'),
          message: ['Ungueltiger Branch-Name. Bitte Eingabe pruefen.', 'Invalid branch name. Please check the input.'],
          error: true,
        },
      },
    ),
    s(
      'correct-name',
      ['Korrigiere den Namen', 'Correct the name'],
      [
        'Ersetze die Eingabe durch feature/lernen. Der Schrägstrich gliedert den Namen; er kopiert keine Dateien und legt noch keinen zusätzlichen Commit an.',
        'Replace the input with feature/lernen. The slash organizes the name; it does not copy files or create an additional commit.',
      ],
      `:is(${c('branch-name')}, [role="dialog"])`,
      {
        prepare: seed({ creating: true, name: 'mein branch' }),
        completion: {
          kind: 'any',
          conditions: [value(c('branch-name'), name), { kind: 'all', conditions: [element(row(name, true)), element(c('dialog-cancel'))] }],
        },
      },
    ),
    s(
      'create',
      ['Erstelle den Branch mit Enter', 'Create the branch with Enter'],
      [
        'Drücke Enter im Namensfeld. Die App erstellt feature/lernen am aktuellen Commit und wechselt dorthin. Danach erscheint eine getrennte Entscheidung über das Veröffentlichen.',
        'Press Enter in the name field. The app creates feature/lernen at the current commit and switches to it. A separate publication decision appears afterwards.',
      ],
      `:is(${c('branch-name')}, [role="dialog"])`,
      { prepare: seed({ creating: true, name }), completion: { kind: 'all', conditions: [element(row(name, true)), element(c('dialog-cancel'))] } },
    ),
    s(
      'local-created',
      ['Lokal erstellen und veröffentlichen sind getrennt', 'Local creation and publication are separate'],
      [
        'Der neue Branch existiert bereits lokal. Die Nachfrage betrifft einen zusätzlichen Push zum Remote. Ein lokaler Name bekommt durch seine Erstellung allein noch keinen Upstream.',
        'The new branch already exists locally. The prompt concerns an additional push to the remote. Creating a local name alone does not give it an upstream.',
      ],
      '[role="dialog"]',
      { prepare: seed({ publication: true }) },
    ),
    s(
      'decline-publication',
      ['Behalte den Branch nur lokal', 'Keep the branch local'],
      [
        'Wähle Abbrechen im Veröffentlichungsdialog. Das verwirft die zusätzliche Veröffentlichung, nicht den gerade erstellten lokalen Branch.',
        'Choose Cancel in the publication dialog. This declines the additional publication, not the local branch you just created.',
      ],
      c('dialog-cancel'),
      {
        prepare: seed({ publication: true }),
        completion: { kind: 'all', conditions: [{ kind: 'absent', selector: '[role="dialog"]' }, element(row(name, true))] },
      },
    ),
    s(
      'new-head',
      ['HEAD steht jetzt am neuen Namen', 'HEAD now belongs to the new name'],
      [
        'feature/lernen trägt die HEAD-Markierung. main bleibt als eigener Name erhalten. Erst spätere Commits auf dem neuen Branch würden dessen gespeicherten Stand von main trennen.',
        'feature/lernen carries the HEAD badge. main remains a separate name. Later commits on the new branch would make its saved state diverge from main.',
      ],
      row(name, true),
      { prepare: seed({ created: true, current: name }) },
    ),
    s(
      'same-commit',
      ['Mehrere Namen können auf denselben Commit zeigen', 'Several names can point to the same commit'],
      [
        'Im Graphen stehen HEAD → feature/lernen und main am selben Commit. Ein neuer Branch erzeugt für sich allein keinen Commit und verdoppelt nicht den gespeicherten Verlauf.',
        'The graph shows HEAD → feature/lernen and main at the same commit. A new branch alone creates no commit and does not duplicate saved history.',
      ],
      `${graphRow(4)} .commit-refs`,
      { prepare: seed({ created: true, current: name }) },
    ),
    s(
      'switch-main',
      ['Wechsle zurück zu main', 'Switch back to main'],
      [
        'Klicke den lokalen Eintrag main. Er soll wieder HEAD tragen. Das Lernprojekt ist sauber; deshalb braucht dieser Wechsel keine Entscheidung über offene Änderungen.',
        'Click the local main entry. It should carry HEAD again. The learning project is clean, so this switch needs no decision about unfinished changes.',
      ],
      row('main'),
      { prepare: seed({ created: true, current: name }), completion: element(row('main', true)) },
    ),
    s(
      'kept',
      ['Der neue Branch bleibt erhalten', 'The new branch remains available'],
      [
        'feature/lernen ist weiterhin in der Liste, jetzt ohne HEAD-Markierung. Zwischen vorhandenen Branches zu wechseln löscht ihre Namen nicht. Eine eigene Lektion zeigt unterschiedliche Datei- und Commit-Stände beim Wechsel.',
        'feature/lernen is still listed, now without HEAD. Switching between branches does not delete their names. A separate lesson shows differing file and commit states during checkout.',
      ],
      row(name, false),
      { prepare: seed({ created: true }) },
    ),
    s(
      'merge',
      ['Weitere Branch-Aktionen haben eigene Folgen', 'Other branch actions have their own effects'],
      [
        'Das Kontextmenü eines Branches bietet Zusammenführen, Umbenennen und Löschen. Merge übernimmt Änderungen in den aktiven Branch. Diese Aktionen sind getrennt vom bloßen Wechsel und werden in eigenen Übungen behandelt.',
        'A branch’s context menu offers merge, rename and delete. Merge takes changes into the active branch. These actions are separate from checkout and are covered in their own exercises.',
      ],
      panel,
      { prepare: seed({ created: true }) },
    ),
    s(
      'tags',
      ['Branches und feste Versionen unterscheiden', 'Distinguish branches from fixed versions'],
      [
        'Branches bewegen sich mit neuen Commits. Tags benennen dagegen üblicherweise feste Versionen. Tags, Worktrees und Submodule besitzen eigene Bedienelemente und eigene Detaillektionen.',
        'Branches move with new commits. Tags usually name fixed versions. Tags, worktrees and submodules have their own controls and detailed lessons.',
      ],
      '.sidebar',
      { prepare: seed({ created: true }) },
    ),
    s(
      'finish',
      ['Du kannst Branches finden und lokal erstellen', 'You can find and create local branches'],
      [
        'Du hast die Gruppen gelesen, ein- und ausgeklappt, gefiltert, einen Namen korrigiert, lokal erstellt und die Veröffentlichung getrennt abgelehnt. Weiter schließt diese Lektion ab; anschließend kannst du die nächsten Branch-Übungen auswählen.',
        'You read the groups, collapsed and expanded them, filtered, corrected a name, created it locally and separately declined publication. Next completes this lesson; afterwards you can choose the next branch exercises.',
      ],
      panel,
      { prepare: seed({ created: true }) },
    ),
  ],
};
