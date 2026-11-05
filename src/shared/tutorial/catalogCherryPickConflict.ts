import type { TutorialChapter } from './types';
import { cherryPickStep as s, cherryPickRecipe as recipe, cherryControl, cherryResolved } from './cherryPickConflictHelpers';
import { conflictControl as c, conflictStage, conflictContent, conflictDraft } from './conflictLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { replayMenu } from './replayLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
import { fileControl } from './fileLessonHelpers';
export const TUTORIAL_CHERRY_PICK_CONFLICT: TutorialChapter = {
  id: 'cherry-pick-conflict',
  section: 'repo',
  title: ['Einen Cherry-pick-Konflikt lösen und fortsetzen', 'Resolve and continue a conflicted cherry-pick'],
  description: [
    'Cherry-pick tatsächlich starten, aktuelle und eingehende Seite prüfen, Entwurf speichern, Datei auflösen und den einzelnen Commit abschließen.',
    'Actually start a cherry-pick, inspect current and incoming sides, save the draft, resolve the file and finish the single commit.',
  ],
  question: ['Wie setze ich einen Cherry-pick nach einem Konflikt fort?', 'How do I continue a cherry-pick after a conflict?'],
  keywords: 'cherry-pick konflikt conflict continue fortsetzen auflösen aktuell eingehend ours theirs author parent sequencer',
  steps: [
    s(
      'scope',
      ['Zwei unterschiedliche Änderungen am gleichen Text', 'Two different changes to the same text'],
      [
        'main und feature/begruessung haben den Begrüßungstext unterschiedlich geändert. Wir starten den Cherry-pick bewusst selbst und lösen danach den entstehenden Konflikt.',
        'main and feature/begruessung changed the greeting differently. We will start the cherry-pick ourselves, then resolve the resulting conflict.',
      ],
      '[data-tutorial="graph"]',
      { prepare: recipe() },
    ),
    s(
      'destination',
      ['main am vierten Commit bleibt das Ziel', 'main at the fourth commit remains the destination'],
      [
        'Der aktive HEAD enthält Hallo Welt. Der neue Commit soll nach erfolgreicher Konfliktlösung auf diesem Stand aufbauen.',
        'The active HEAD contains Hello world. After successful conflict resolution the new commit should build on this revision.',
      ],
      mergeHead(4),
      { prepare: recipe() },
    ),
    s(
      'source',
      ['Der Quellcommit enthält die Team-Begrüßung', 'The source commit contains the team greeting'],
      [
        'feature/begruessung zeigt auf einen eigenen fünften Commit. Wir übernehmen dessen einzelnen Patch und nicht den gesamten Branch.',
        'feature/begruessung points to its own fifth commit. We will copy its single patch rather than the entire branch.',
      ],
      graphRow(5),
      { prepare: recipe() },
    ),
    s(
      'base',
      ['Der Patch stammt aus dem Vergleich mit dem Quellvorgänger', 'The patch is relative to the source parent'],
      [
        'Der dritte Commit ist der Vorgänger des Quellcommits. Dessen Änderung zur Team-Begrüßung trifft auf die inzwischen anders geänderte README auf main.',
        'The third commit is the source commit’s parent. Its change to the team greeting meets the README that main has since changed differently.',
      ],
      graphRow(3),
      { prepare: recipe() },
    ),
    s(
      'select',
      ['Wähle den fünften Commit', 'Select the fifth commit'],
      [
        'Klicke den Team-Begrüßungscommit auf feature/begruessung und prüfe seine Details.',
        'Click the team greeting commit on feature/begruessung and inspect its details.',
      ],
      graphRow(5),
      { prepare: recipe(), completion: element(commitPanel(5)) },
    ),
    s(
      'message',
      ['Die Quelle hat eine eigene Beschreibung und Urheberschaft', 'The source has its own description and authorship'],
      [
        'Diese Nachricht gehört zu Sams Änderung. Der spätere Cherry-pick soll sie erhalten, während die Konfliktlösung auf main gespeichert wird.',
        'This message belongs to Sam’s change. The later cherry-pick should retain it while saving the conflict resolution on main.',
      ],
      '.commit-details-description',
      { prepare: recipe('source') },
    ),
    s(
      'menu',
      ['Öffne das Kontextmenü der Quelle', 'Open the source context menu'],
      ['Öffne das Menü am fünften Commit mit der rechten Maustaste oder Umschalt+F10.', 'Open the fifth commit’s menu with a right-click or Shift+F10.'],
      graphRow(5),
      { prepare: recipe('source'), gesture: 'contextmenu', completion: element(replayMenu('cherry-pick')) },
    ),
    s(
      'choice',
      ['Prüfe die Cherry-pick-Aktion', 'Review the cherry-pick action'],
      [
        'Der Eintrag nennt den ausgewählten Quellcommit. Er wird auf den aktiven main angewendet. In diesem Beispiel stoppt die automatische Anwendung am Begrüßungstext.',
        'The entry names the selected source commit. It applies to the active main branch. In this example automatic application will stop at the greeting text.',
      ],
      replayMenu('cherry-pick'),
      { prepare: recipe('menu') },
    ),
    s(
      'apply',
      ['Starte den Cherry-pick und öffne den Konfliktlöser', 'Start the cherry-pick and open the conflict resolver'],
      [
        'Klicke Cherry-pick. Die App erkennt die Konfliktdatei und öffnet ihren Konfliktlöser. Es entsteht zunächst kein neuer Commit.',
        'Click Cherry-pick. The app detects the conflicted file and opens its conflict resolver. No new commit is created yet.',
      ],
      replayMenu('cherry-pick'),
      { prepare: recipe('menu'), action: 'cherry-pick-conflict', completion: element(c('editor')) },
    ),
    s(
      'stopped',
      ['Der Vorgang wartet auf deine Entscheidung', 'The operation is waiting for your decision'],
      [
        'Die widersprüchlichen Inhalte verhindern eine automatische Übernahme. HEAD und main bleiben am vierten Commit, bis der Cherry-pick erfolgreich abgeschlossen wird.',
        'Conflicting contents prevent automatic application. HEAD and main remain at the fourth commit until the cherry-pick completes successfully.',
      ],
      c('editor'),
      { prepare: recipe('conflicted') },
    ),
    s(
      'operation',
      ['Die Aktionsgruppe gehört zum Cherry-pick', 'The action group belongs to cherry-pick'],
      [
        'Hier stehen Fortsetzen und Abbrechen für den laufenden Cherry-pick. Eine gelöste Datei allein beendet diesen Git-Vorgang noch nicht.',
        'Continue and Abort here belong to the pending cherry-pick. Resolving a file alone does not finish this Git operation.',
      ],
      cherryControl('actions'),
      { prepare: recipe('conflicted') },
    ),
    s(
      'ours',
      ['Aktuell ist die Fassung von main', 'Current is main’s version'],
      [
        'Die aktuelle Seite enthält Hallo Welt aus dem vierten Commit. Sie beschreibt den Stand, auf den der Patch angewendet werden soll.',
        'The current side contains Hello world from the fourth commit. It is the revision to which the patch is being applied.',
      ],
      c('ours'),
      { prepare: recipe('conflicted') },
    ),
    s(
      'theirs',
      ['Eingehend ist die Fassung des ausgewählten Commits', 'Incoming is the selected commit’s version'],
      [
        'Die eingehende Seite enthält Hallo Team aus Sams Quellcommit. Diese Fassung wollen wir in dieser Übung für den Konfliktblock verwenden.',
        'The incoming side contains Hello team from Sam’s source commit. This exercise will use that version for the conflict block.',
      ],
      c('theirs'),
      { prepare: recipe('conflicted') },
    ),
    s(
      'markers',
      ['Die Marker gehören zum ungelösten Arbeitsentwurf', 'Markers belong to the unresolved working draft'],
      [
        'Der manuelle Editor zeigt beide Seiten mit Konfliktmarkern. Diese Marker sind keine fertige Lösung und dürfen nicht versehentlich als gewünschter Dateiinhalt vorgemerkt werden.',
        'The manual editor shows both sides with conflict markers. Those markers are not a finished resolution and should not accidentally be staged as intended file contents.',
      ],
      c('content'),
      { prepare: recipe('conflicted') },
    ),
    s(
      'choose',
      ['Übernimm die eingehende Seite in den Entwurf', 'Take the incoming side into the draft'],
      [
        'Klicke Übernehmen auf der eingehenden Seite. Das ändert zunächst nur den Entwurf im Editor.',
        'Click Apply on the incoming side. This first changes only the editor draft.',
      ],
      c('take-theirs'),
      { prepare: recipe('conflicted'), completion: conflictDraft },
    ),
    s(
      'draft',
      ['Der Entwurf ist geändert, aber noch nicht gespeichert', 'The draft has changed but is not saved yet'],
      [
        'Der Editor enthält jetzt Hallo Team ohne Konfliktmarker. Die Kennzeichnung für ungespeicherte Änderungen zeigt, dass dieser Entwurf noch geschrieben werden muss.',
        'The editor now contains Hello team without conflict markers. Its unsaved-change indicator shows that the draft still needs writing.',
      ],
      c('editor'),
      { prepare: recipe('chosen') },
    ),
    s(
      'save-purpose',
      ['Speichern und Auflösen sind getrennte Handlungen', 'Saving and resolving are separate actions'],
      [
        'Speichern schreibt den Entwurf in die Arbeitsdatei. Es meldet die Datei dabei noch nicht als gelöst und erzeugt keinen Commit.',
        'Save writes the draft to the working file. It does not yet mark the file resolved or create a commit.',
      ],
      c('save'),
      { prepare: recipe('chosen') },
    ),
    s(
      'save',
      ['Speichere zunächst nur die Arbeitsdatei', 'First save only the working file'],
      ['Klicke Speichern. Der Entwurf wird sauber, der Konflikt bleibt noch offen.', 'Click Save. The draft becomes clean while the conflict remains open.'],
      c('save'),
      {
        prepare: recipe('chosen'),
        completion: {
          kind: 'all',
          conditions: [
            element(conflictStage('false')),
            element(c('section') + '[data-conflict-files="1"]'),
            { kind: 'working-tree', staged: [], unstaged: ['README.md'], content: [{ path: 'README.md', source: 'worktree', value: conflictContent }] },
          ],
        },
      },
    ),
    s(
      'saved',
      ['Die Datei ist gespeichert, der Index wartet noch', 'The file is saved but the index is still waiting'],
      [
        'Die Marker sind aus der Arbeitsdatei entfernt. Der Konfliktstatus bleibt erhalten, bis du den gewünschten Inhalt ausdrücklich als gelöst vormerkst.',
        'The working file no longer contains markers. The conflict status remains until you explicitly stage the intended contents as resolved.',
      ],
      c('editor'),
      { prepare: recipe('saved') },
    ),
    s(
      'mark-purpose',
      ['Als gelöst markieren übernimmt den Inhalt in den Index', 'Mark resolved stages the contents in the index'],
      [
        'Prüfe den gespeicherten Inhalt und markiere die Datei anschließend als gelöst. Damit ist ihre Lösung für den späteren Commit ausgewählt.',
        'Review the saved contents, then mark the file resolved. This selects its resolution for the later commit.',
      ],
      c('mark'),
      { prepare: recipe('saved') },
    ),
    s(
      'mark',
      ['Markiere README.md als gelöst', 'Mark README.md resolved'],
      [
        'Klicke Als gelöst markieren. Die Übung prüft die vorgemerkte README und den weiterhin laufenden Cherry-pick.',
        'Click Mark resolved. The exercise checks the staged README and the still-pending cherry-pick.',
      ],
      c('mark'),
      { prepare: recipe('saved'), completion: cherryResolved },
    ),
    s(
      'resolved',
      ['Keine offenen Konfliktdateien, aber noch ein laufender Vorgang', 'No unresolved files, but still a pending operation'],
      [
        'Die Lösung liegt im Index. Cherry-pick Fortsetzen bleibt erreichbar, bis die ausgewählte Änderung als neuer Commit gespeichert wurde.',
        'The resolution is in the index. Cherry-pick Continue remains available until the selected change is saved as a new commit.',
      ],
      cherryControl('actions'),
      { prepare: recipe('resolved') },
    ),
    s(
      'continue',
      ['Schließe den Cherry-pick mit Fortsetzen ab', 'Finish the cherry-pick with Continue'],
      [
        'Klicke Fortsetzen in der Cherry-pick-Gruppe. Die App speichert die vorgemerkte Lösung mit der Nachricht und Urheberschaft der Quelle.',
        'Click Continue in the Cherry-pick group. The app saves the staged resolution with the source message and authorship.',
      ],
      cherryControl('continue'),
      { prepare: recipe('resolved'), completion: element(mergeHead(6)) },
    ),
    s(
      'parent',
      ['Der neue Commit hat einen Vorgänger auf main', 'The new commit has one parent on main'],
      [
        'Der neue HEAD folgt dem bisherigen vierten Commit. Auch nach einem Konflikt ist dieser Cherry-pick ein einzelner Commit und kein Merge mit zwei Vorgängern.',
        'The new HEAD follows the former fourth commit. Even after a conflict this cherry-pick is a single commit rather than a merge with two parents.',
      ],
      mergeHead(6),
      { prepare: recipe('continued') },
    ),
    s(
      'source-remains',
      ['Der Quellbranch bleibt am ursprünglichen Commit', 'The source branch stays at its original commit'],
      [
        'feature/begruessung zeigt weiterhin auf den fünften Commit. Die Lösung auf main hat diese Quelle nicht verändert.',
        'feature/begruessung still points to the fifth commit. The resolution on main did not change that source.',
      ],
      graphRow(5) + ' .commit-refs',
      { prepare: recipe('continued') },
    ),
    s(
      'select-result',
      ['Wähle den abgeschlossenen Cherry-pick', 'Select the completed cherry-pick'],
      ['Klicke den neuen HEAD, um Nachricht und gespeicherte Lösung zu prüfen.', 'Click the new HEAD to inspect the message and saved resolution.'],
      graphRow(6),
      { prepare: recipe('continued'), completion: element(commitPanel(6)) },
    ),
    s(
      'message-result',
      ['Nachricht und Autor bleiben von der Quelle erhalten', 'The source message and author remain'],
      [
        'Die Beschreibung stammt weiter aus Sams Änderung. Deine Entscheidung zum Dateiinhalt wird als Ergebnis dieses neuen Commits gespeichert.',
        'The description still comes from Sam’s change. Your file-content decision is saved as this new commit’s result.',
      ],
      '.commit-details-description',
      { prepare: recipe('commit') },
    ),
    s(
      'open-diff',
      ['Öffne die gespeicherte README-Lösung', 'Open the saved README resolution'],
      [
        'Öffne README.md im neuen Commit. Der Vergleich gilt seiner Lösung gegen den vorherigen main-Stand.',
        'Open README.md in the new commit. The comparison shows its resolution against main’s previous revision.',
      ],
      commitPanel(6) + ' ' + commitFile(),
      { prepare: recipe('commit'), completion: element(historyViewer(6)) },
    ),
    s(
      'read-diff',
      ['Die Gegenüberstellung zeigt deine tatsächliche Entscheidung', 'The comparison shows your actual decision'],
      [
        'Hallo Welt wird durch Hallo Team ersetzt. Andere bestehende main-Änderungen bleiben erhalten; der Cherry-pick kopiert nur den ausgewählten Patch samt Lösung.',
        'Hello world is replaced by Hello team. Other existing main changes remain; cherry-pick copies only the selected patch and its resolution.',
      ],
      '.file-viewer-diff',
      { prepare: recipe('diff') },
    ),
    s(
      'close-diff',
      ['Schließe den Vergleich', 'Close the comparison'],
      ['Schließe den Dateibetrachter und kehre zum Graphen zurück.', 'Close the file viewer and return to the graph.'],
      fileControl('close-file'),
      { prepare: recipe('diff'), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'done',
      ['Konflikt gelöst und Cherry-pick abgeschlossen', 'Resolved the conflict and completed cherry-pick'],
      [
        'Die Lösung ist lokal committet, der laufende Vorgang beendet und die Quelle erhalten. Abbrechen eines Cherry-picks wird in einer eigenen Lektion geübt.',
        'The resolution is committed locally, the pending operation has ended and the source remains intact. Aborting a cherry-pick has its own lesson.',
      ],
      mergeHead(6),
      { prepare: recipe('continued') },
    ),
  ],
};
