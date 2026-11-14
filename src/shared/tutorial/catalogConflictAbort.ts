import { withTextViewSteps } from './fileTextViewSteps';
import type { TutorialChapter, TutorialCompletion } from './types';
import { conflictStep as s, conflictControl as c } from './conflictLessonHelpers';
import { conflictAbortRecipe as seed } from './conflictAbortHelpers';
import { mergeHead, mergeDialog, mergeConfirm, mergeCancel, mergeContext, element } from './mergeLessonHelpers';
import { historyViewer } from './historyLessonHelpers';
import { fileControl, fileRow } from './fileLessonHelpers';
const aborted: TutorialCompletion = {
  kind: 'all',
  conditions: [
    { kind: 'absent', selector: mergeConfirm },
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
export const TUTORIAL_CONFLICT_ABORT: TutorialChapter = {
  id: 'conflicts-abort',
  section: 'repo',
  title: ['Merge abbrechen: Folgen prüfen und Ausgangsstand wiederherstellen', 'Abort a merge: review the effects and restore the starting revision'],
  description: [
    'Speichere eine Auflösung zunächst ohne Abschluss. Prüfe den Abbruchdialog, behalte den Vorgang einmal bei und stelle ihn anschließend bewusst zurück.',
    'Save a resolution without finishing first. Inspect the abort dialog, keep the operation once and then deliberately restore the starting revision.',
  ],
  question: ['Wie breche ich einen Merge ab und was passiert mit meiner Auflösung?', 'How do I abort a merge and what happens to my resolution?'],
  keywords: 'merge konflikt conflict abbrechen abort abbruch zurücksetzen dialog sicherheit entwurf arbeitsdatei',
  steps: [
    s(
      'overview',
      ['Eine gespeicherte Auflösung ist noch kein abgeschlossener Merge', 'A saved resolution is not yet a completed merge'],
      [
        'Der Konflikt ist vorbereitet und die Team-Begrüßung wurde bereits nur als Arbeitsdatei gespeichert. Der Index meldet die Datei noch als Konflikt. Wir untersuchen, was ein vollständiger Merge-Abbruch verwirft.',
        'The conflict is prepared and the team greeting has already been saved only as a working file. The index still marks the file as conflicted. We inspect what aborting the whole merge discards.',
      ],
      c('editor'),
      { continue: false, prepare: seed() },
    ),
    s(
      'saved-content',
      ['Die Arbeitsdatei enthält die bisherige Auflösung', 'The working file contains the resolution so far'],
      [
        'Der Editor zeigt die bereits gespeicherte Team-Begrüßung ohne Marker. Sie gehört noch zu keinem neuen Commit. Die vorherigen gespeicherten Branch-Stände sind weiterhin unverändert.',
        'The editor shows the saved team greeting without markers. It does not yet belong to a new commit. The previous saved branch revisions are still unchanged.',
      ],
      c('content'),
      { prepare: seed() },
    ),
    s(
      'open',
      ['Öffne den Abbruch für den ganzen Merge', 'Open Abort for the whole merge'],
      [
        'Klicke beim Merge auf Abbrechen. Das öffnet zuerst eine Bestätigung und verändert den Vorgang noch nicht.',
        'Click Abort for the merge. This first opens a confirmation and does not yet change the operation.',
      ],
      c('abort'),
      { prepare: seed(), completion: element(mergeDialog) },
    ),
    s(
      'consequences',
      ['Der Abbruch verwirft die Auflösung dieses Merge', 'Aborting discards this merge resolution'],
      [
        'Der Dialog warnt vor dem Verlust der bisherigen Konfliktauflösungen. Auch unsere gespeicherte Arbeitsdatei ist noch kein Commit und wird für den betroffenen Merge-Pfad zurückgesetzt.',
        'The dialog warns that the conflict resolutions so far will be lost. Our saved working file is not a commit either and is reset for the affected merge path.',
      ],
      mergeDialog + ' .dialog-message',
      { prepare: seed('review') },
    ),
    s(
      'action',
      ['Prüfe die konkrete Aktion', 'Check the concrete action'],
      [
        'Die Bestätigung nennt git merge --abort. Es geht um den aktiven Merge-Vorgang. Das Schließen des Konflikteditors allein würde diesen Vorgang dagegen bestehen lassen.',
        'The confirmation names git merge --abort. This acts on the active merge operation. Closing the conflict editor alone would leave that operation in place.',
      ],
      mergeContext(1),
      { prepare: seed('review') },
    ),
    s(
      'cancel',
      ['Behalte den Merge zunächst bei', 'Keep the merge for now'],
      [
        'Wähle Abbrechen im Bestätigungsdialog. Das schließt nur diese Bestätigung. Der aktive Merge und die gespeicherte Team-Begrüßung bleiben erhalten.',
        'Choose Cancel in the confirmation dialog. This closes only the confirmation. The active merge and saved team greeting remain.',
      ],
      mergeCancel,
      { prepare: seed('review'), completion: { kind: 'absent', selector: mergeConfirm } },
    ),
    s(
      'kept',
      ['Die bisherige Auflösung ist weiterhin vorhanden', 'The existing resolution is still present'],
      [
        'Die Team-Begrüßung steht unverändert im Editor. Fortsetzen und Abbrechen sind weiterhin verfügbar, weil der Merge nicht beendet wurde.',
        'The team greeting is unchanged in the editor. Continue and Abort remain available because the merge has not ended.',
      ],
      c('content'),
      { prepare: seed('cancelled') },
    ),
    s(
      'open-again',
      ['Öffne die Abbruchbestätigung erneut', 'Open the abort confirmation again'],
      ['Wir führen den Abbruch jetzt bewusst aus. Öffne dafür die Bestätigung erneut.', 'We will now deliberately abort. Open the confirmation again.'],
      c('abort'),
      { prepare: seed('cancelled'), completion: element(mergeDialog) },
    ),
    s(
      'confirm',
      ['Bestätige den vollständigen Merge-Abbruch', 'Confirm aborting the whole merge'],
      [
        'Bestätige Merge abbrechen. Der Vorgang wird entfernt und die betroffenen Dateien auf den Zustand vor dem Merge zurückgesetzt. Die gespeicherten Ausgangs-Commits bleiben bestehen.',
        'Confirm Abort merge. The operation is removed and affected files return to their pre-merge revision. The saved starting commits remain.',
      ],
      mergeConfirm,
      { prepare: seed('review'), completion: aborted },
    ),
    s(
      'restored',
      ['main bleibt am alten Commit, der Konfliktbereich verschwindet', 'main stays on its old commit and the conflict section disappears'],
      [
        'Es wurde kein Merge-Commit erzeugt. main und HEAD bleiben am bisherigen Zielstand. feature/begruessung bleibt ebenfalls erhalten. Der Arbeitsbaum ist wieder sauber.',
        'No merge commit was created. main and HEAD remain at the old target revision. feature/begruessung is retained too. The working tree is clean again.',
      ],
      mergeHead(4),
      { prepare: seed('aborted') },
    ),
    s(
      'open-tree',
      ['Öffne die tatsächlichen Arbeitsdateien', 'Open the actual working files'],
      [
        'Wechsle im Inspektor zu Working Directory, um den zurückgesetzten Inhalt zu prüfen.',
        'Switch the inspector to Working Directory to check the restored contents.',
      ],
      fileControl('open-files'),
      { prepare: seed('aborted'), completion: element(fileControl('open-files') + '[aria-pressed="true"]') },
    ),
    s(
      'open-readme',
      ['Öffne die zurückgesetzte README', 'Open the restored README'],
      ['Öffne README.md aus dem Dateibaum.', 'Open README.md from the file tree.'],
      fileRow('README.md'),
      { prepare: seed('aborted', 'tree'), completion: element(historyViewer()) },
    ),
    s(
      'contents',
      ['Die Arbeitsdatei begrüßt wieder die Welt', 'The working file greets the world again'],
      [
        'Hier steht wieder Hallo Welt, entsprechend dem alten main. Die zuvor nur im offenen Merge gespeicherte Team-Auflösung wurde für diese Datei verworfen.',
        'It says Hello world again, matching the old main. The team resolution saved only in the unfinished merge was discarded for this file.',
      ],
      historyViewer(),
      { prepare: seed('aborted', 'work') },
    ),
    s(
      'close-file',
      ['Schließe die Inhaltsprüfung', 'Close the content check'],
      ['Kehre zum Graphen zurück.', 'Return to the graph.'],
      fileControl('close-file'),
      { prepare: seed('aborted', 'work'), completion: { kind: 'absent', selector: historyViewer() } },
    ),
    s(
      'finish',
      ['Editor schließen, Dialog abbrechen und Merge abbrechen unterscheiden', 'Distinguish closing the editor, canceling a dialog and aborting a merge'],
      [
        'Du hast die Bestätigung zunächst geschlossen und den Merge behalten. Erst der bestätigte Merge-Abbruch setzte den betroffenen Dateiinhalt zurück. Weiter beendet diese Lektion.',
        'You first closed the confirmation and kept the merge. Only the confirmed merge abort restored the affected file contents. Next finishes this lesson.',
      ],
      '[data-tutorial="graph"]',
      { prepare: seed('aborted') },
    ),
  ].flatMap(withTextViewSteps({ 'open-readme': 'README.md' })),
};
