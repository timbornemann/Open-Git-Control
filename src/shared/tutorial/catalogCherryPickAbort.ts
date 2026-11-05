import type { TutorialChapter, TutorialCompletion } from './types';
import { cherryPickStep as s, cherryPickRecipe as recipe, cherryControl } from './cherryPickConflictHelpers';
import { conflictControl as c } from './conflictLessonHelpers';
import { mergeHead, mergeDialog, mergeConfirm, mergeCancel, mergeContext, element } from './mergeLessonHelpers';
import { graphRow, historyViewer, fileRow, fileTab } from './historyLessonHelpers';
import { fileControl } from './fileLessonHelpers';
const closed = { kind: 'absent' as const, selector: mergeDialog };
const aborted: TutorialCompletion = {
  kind: 'all',
  conditions: [
    closed,
    { kind: 'absent', selector: c('section') },
    element(mergeHead(4)),
    {
      kind: 'working-tree',
      staged: [],
      unstaged: [],
      untracked: [],
      content: [{ path: 'README.md', source: 'worktree', value: { example: 'history-readme', version: 'latest' } }],
    },
  ],
};
export const TUTORIAL_CHERRY_PICK_ABORT: TutorialChapter = {
  id: 'cherry-pick-abort',
  section: 'repo',
  title: ['Einen laufenden Cherry-pick bewusst abbrechen', 'Deliberately abort a pending cherry-pick'],
  description: [
    'Gespeicherte Konfliktlösung prüfen, Bestätigung zunächst schließen, den Vorgang abbrechen und den ursprünglichen Dateiinhalt nachlesen.',
    'Review a saved conflict resolution, first cancel confirmation, abort the operation and read the original file contents.',
  ],
  question: ['Wie breche ich einen Cherry-pick samt Konfliktlösung ab?', 'How do I abort a cherry-pick and its conflict resolution?'],
  keywords: 'cherry-pick abbrechen abort konflikt entwürfe zurücksetzen bestätigen cancel vorgang auflösung',
  steps: [
    s(
      'scope',
      ['Ein angehaltener Cherry-pick mit gespeicherter Lösung', 'A stopped cherry-pick with a saved resolution'],
      [
        'Der Cherry-pick des Team-Commits ist bereits angehalten. Seine eingehende README wurde in die Arbeitsdatei gespeichert, aber noch nicht als gelöst vorgemerkt oder committet.',
        'The team commit’s cherry-pick is already stopped. Its incoming README was saved to the working file but has not been staged as resolved or committed.',
      ],
      c('editor'),
      { prepare: recipe('saved') },
    ),
    s(
      'saved',
      ['Die Team-Begrüßung ist bisher nur eine Arbeitsdatei', 'The team greeting is still only a working file'],
      [
        'Der Editor enthält Hallo Team und ist sauber gespeichert. Sauber im Editor bedeutet hier nicht, dass ein Commit oder ein abgeschlossener Cherry-pick vorliegt.',
        'The editor contains Hello team and is saved cleanly. A clean editor here does not mean there is a commit or a completed cherry-pick.',
      ],
      c('content'),
      { prepare: recipe('saved') },
    ),
    s(
      'operation',
      ['Abbrechen gilt dem ganzen Cherry-pick', 'Abort applies to the whole cherry-pick'],
      [
        'Die Cherry-pick-Gruppe enthält Fortsetzen und Abbrechen. Mit Abbrechen lässt sich der angefangene Vorgang samt betroffener Konfliktlösung verwerfen.',
        'The Cherry-pick group contains Continue and Abort. Abort discards the started operation and its affected conflict resolution.',
      ],
      cherryControl('actions'),
      { prepare: recipe('saved') },
    ),
    s(
      'close-purpose',
      ['Das Schließen der Ansicht beendet den Git-Vorgang nicht', 'Closing the view does not end the Git operation'],
      [
        'Zurück zum Graphen würde nur die Ansicht schließen. Der Cherry-pick bliebe aktiv. Für den vollständigen Abbruch verwenden wir die Aktionsgruppe.',
        'Back to graph would only close this view. The cherry-pick would remain active. To abort it completely we use the action group.',
      ],
      c('close'),
      { prepare: recipe('saved') },
    ),
    s(
      'open',
      ['Öffne die Abbruchbestätigung', 'Open abort confirmation'],
      [
        'Klicke Abbrechen in der Cherry-pick-Gruppe. Zunächst öffnet sich eine Bestätigung; der Vorgang bleibt noch erhalten.',
        'Click Abort in the Cherry-pick group. A confirmation opens first; the operation is still retained.',
      ],
      cherryControl('abort'),
      { prepare: recipe('saved'), completion: element(mergeDialog) },
    ),
    s(
      'message',
      ['Lies, welcher Vorgang verworfen wird', 'Read which operation will be discarded'],
      [
        'Der Dialog bezieht sich auf den aktiven Cherry-pick. Die ursprünglichen gespeicherten Commits werden dadurch nicht gelöscht.',
        'The dialog applies to the active cherry-pick. It does not delete the original saved commits.',
      ],
      mergeDialog + ' .dialog-message',
      { prepare: recipe('review') },
    ),
    s(
      'command',
      ['Prüfe den konkreten Git-Befehl', 'Check the specific Git command'],
      [
        'Die Aktion nennt git cherry-pick --abort. Diese Bestätigung betrifft den Git-Vorgang und nicht nur den sichtbaren Editor.',
        'The action names git cherry-pick --abort. This confirmation concerns the Git operation rather than just the visible editor.',
      ],
      mergeContext(1),
      { prepare: recipe('review') },
    ),
    s(
      'impact',
      ['Die bisherige Konfliktlösung würde verworfen', 'The existing conflict resolution would be discarded'],
      [
        'Die Team-Auflösung ist noch kein Commit. Beim bestätigten Abbruch wird der betroffene Pfad auf seinen Stand vor dem Cherry-pick zurückgesetzt. Ein späterer Entwurf auf einem bereits gelösten Pfad kann den Abbruch verhindern.',
        'The team resolution is not a commit yet. Confirming abort resets the affected path to its pre-cherry-pick revision. A later draft on an already resolved path can prevent abort.',
      ],
      mergeDialog + ' .dialog-impact',
      { prepare: recipe('review') },
    ),
    s(
      'cancel',
      ['Schließe zunächst nur die Bestätigung', 'First close only the confirmation'],
      [
        'Klicke Abbrechen im Dialog. Das verwirft die Bestätigung, behält aber den Cherry-pick und die gespeicherte Team-Auflösung bei.',
        'Click Cancel in the dialog. This dismisses confirmation but keeps the cherry-pick and saved team resolution.',
      ],
      mergeCancel,
      { prepare: recipe('review'), completion: closed },
    ),
    s(
      'kept',
      ['Die Lösung bleibt nach dem Dialogabbruch bestehen', 'The resolution remains after canceling the dialog'],
      [
        'Hallo Team steht weiterhin in der gespeicherten Arbeitsdatei. Der Cherry-pick ist noch aktiv; bisher wurde nur die Bestätigung geschlossen.',
        'Hello team remains in the saved working file. The cherry-pick is still active; only confirmation was closed.',
      ],
      c('content'),
      { prepare: recipe('cancelled') },
    ),
    s(
      'still-pending',
      ['Fortsetzen und Abbrechen bleiben erreichbar', 'Continue and Abort remain available'],
      [
        'Du könntest die Datei jetzt als gelöst markieren und fortsetzen. In dieser Lektion verwerfen wir den begonnenen Cherry-pick stattdessen bewusst.',
        'You could now mark the file resolved and continue. In this lesson we will deliberately discard the started cherry-pick.',
      ],
      cherryControl('actions'),
      { prepare: recipe('cancelled') },
    ),
    s(
      'open-again',
      ['Öffne die Bestätigung erneut', 'Open confirmation again'],
      ['Klicke erneut Abbrechen in der Cherry-pick-Gruppe.', 'Click Abort in the Cherry-pick group again.'],
      cherryControl('abort'),
      { prepare: recipe('cancelled'), completion: element(mergeDialog) },
    ),
    s(
      'review',
      ['Prüfe die Folgen vor dem endgültigen Abbruch', 'Review the consequences before aborting'],
      [
        'Der aktive Vorgang und seine nicht committete Auflösung sollen verworfen werden. Die Ursprungscommits und der Quellbranch bleiben erhalten.',
        'The active operation and its uncommitted resolution will be discarded. The original commits and source branch remain intact.',
      ],
      mergeDialog + ' .dialog-impact',
      { prepare: recipe('review') },
    ),
    s(
      'confirm',
      ['Bestätige Cherry-pick abbrechen', 'Confirm Abort cherry-pick'],
      [
        'Bestätige den Abbruch. Die Übung prüft den unveränderten Ausgangs-HEAD, den entfernten Vorgang und die wiederhergestellte Arbeitsdatei.',
        'Confirm abort. The exercise checks the unchanged starting HEAD, removed operation and restored working file.',
      ],
      mergeConfirm,
      { prepare: recipe('review'), completion: aborted },
    ),
    s(
      'head',
      ['main steht weiterhin auf seinem vierten Commit', 'main still points to its fourth commit'],
      [
        'Es wurde kein neuer Cherry-pick-Commit erzeugt. Der bisherige HEAD auf main ist weiterhin der aktuelle gespeicherte Stand.',
        'No new cherry-pick commit was created. main’s previous HEAD is still the current saved revision.',
      ],
      mergeHead(4),
      { prepare: recipe('aborted') },
    ),
    s(
      'source',
      ['Auch der ursprüngliche Team-Commit bleibt erhalten', 'The original team commit remains intact too'],
      [
        'feature/begruessung bleibt am fünften Commit. Du kannst seine Änderung später erneut übernehmen; der Abbruch hat sie nicht aus der Quelle entfernt.',
        'feature/begruessung remains at the fifth commit. You can copy its change again later; abort did not remove it from the source.',
      ],
      graphRow(5) + ' .commit-refs',
      { prepare: recipe('aborted') },
    ),
    s(
      'open-tree',
      ['Öffne das Working Directory', 'Open the working directory'],
      [
        'Wähle Working Directory, um die tatsächlich wiederhergestellte Datei zu lesen.',
        'Choose Working Directory to read the file that was actually restored.',
      ],
      fileControl('open-files'),
      { prepare: recipe('aborted'), completion: element(fileControl('open-files') + '[aria-pressed="true"]') },
    ),
    s(
      'open-file',
      ['Öffne die aktuelle README', 'Open the current README'],
      [
        'Öffne README.md im Dateibaum. Wir prüfen den Arbeitsordner nach dem Abbruch.',
        'Open README.md in the file tree to inspect the working directory after abort.',
      ],
      fileRow('README.md'),
      { prepare: recipe('aborted', 'tree'), completion: element(historyViewer()) },
    ),
    s(
      'text',
      ['Wähle die Textansicht', 'Choose the text view'],
      ['Wähle Text, um den aktuellen Inhalt direkt zu lesen.', 'Choose Text to read the current contents directly.'],
      fileTab('text'),
      { prepare: recipe('aborted', 'work'), completion: element(historyViewer() + '[data-tab="text"]') },
    ),
    s(
      'contents',
      ['Die Datei enthält wieder Hallo Welt', 'The file contains Hello world again'],
      [
        'Der Dateiinhalt entspricht wieder main vor dem Cherry-pick. Die nur im angefangenen Vorgang gespeicherte Team-Auflösung ist für diese Datei verworfen.',
        'The file contents match main before the cherry-pick again. The team resolution saved only in the started operation was discarded for this file.',
      ],
      historyViewer(),
      { prepare: recipe('aborted', 'work') },
    ),
    s(
      'close-file',
      ['Schließe die Dateiprüfung', 'Close the file check'],
      ['Schließe den Betrachter und kehre zum Graphen zurück.', 'Close the viewer and return to the graph.'],
      fileControl('close-file'),
      { prepare: recipe('aborted', 'work'), completion: { kind: 'absent', selector: historyViewer() } },
    ),
    s(
      'done',
      ['Dialogabbruch und Vorgangsabbruch unterscheiden', 'Distinguish canceling confirmation from aborting the operation'],
      [
        'Zuerst hast du nur den Dialog geschlossen und die Lösung behalten. Erst die bestätigte Git-Aktion hat den Cherry-pick beendet und die betroffene Datei zurückgesetzt. Weiter beendet diese Lektion.',
        'First you closed only the dialog and kept the resolution. Only the confirmed Git action ended cherry-pick and restored the affected file. Next finishes this lesson.',
      ],
      mergeHead(4),
      { prepare: recipe('aborted') },
    ),
  ],
};
