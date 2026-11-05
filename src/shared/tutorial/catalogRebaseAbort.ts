import type { TutorialChapter } from './types';
import { rebaseStep as s } from './rebaseLessonHelpers';
import { rebasePauseRecipe as recipe, rebaseControl } from './rebasePauseLessonHelpers';
import { rebasePauseStartingSteps } from './rebasePauseStartingSteps';
import { REBASE_ABORT_DRAFT } from './rebasePauseExamples';
import { conflictControl as c, conflictStage } from './conflictLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
import { graphRow, historyViewer } from './historyLessonHelpers';
import { fileControl, fileRow, fileTab } from './fileLessonHelpers';
import { tree } from './stagingLessonHelpers';
const confirm = '.dialog-modal [data-dialog-action="confirm"]',
  cancel = '.dialog-modal [data-dialog-action="cancel"]';
function restored(file = false) {
  const base = recipe('abort', 'aborted'),
    actions = [
      ...base.actions!,
      { click: fileControl('open-files') },
      { waitFor: fileControl('open-files') + '[aria-pressed="true"]' },
      { waitFor: fileRow('README.md') },
    ];
  if (file) actions.push({ click: fileRow('README.md') }, { waitFor: historyViewer() }, { click: fileTab('text') });
  return { ...base, actions, ready: file ? historyViewer() + '[data-tab="text"]' : fileRow('README.md') };
}
export const TUTORIAL_REBASE_ABORT: TutorialChapter = {
  id: 'rebase-abort',
  section: 'repo',
  title: ['Einen Rebase mit bestätigtem Abbruch zurücknehmen', 'Abort a rebase through its confirmation'],
  description: [
    'Konflikt bewusst erzeugen, eine Arbeitslösung speichern, Abbruchdialog prüfen und abbrechen; danach bestätigt zum ursprünglichen Branch zurückkehren.',
    'Deliberately create a conflict, save a working resolution, inspect and cancel the abort dialog, then confirm a return to the original branch.',
  ],
  question: ['Wie breche ich einen angehaltenen Rebase ab und was geht dabei verloren?', 'How do I abort a paused rebase and what is discarded?'],
  keywords: 'rebase abort abbrechen abbruch konflikt lösung entwurf speichern verwerfen bestätigung original branch head',
  steps: [
    s(
      'scope',
      ['Abbruch stellt den ursprünglichen Branch-Stand her', 'Abort restores the original branch revision'],
      [
        'Wir starten einen vorbereiteten Konflikt, speichern eine eigene Arbeitslösung und verwerfen den Rebase anschließend bewusst. Der Abbruch einer Git-Operation ist hier die Übung, kein Abbruch der Einführung.',
        'We will start a prepared conflict, save our own working resolution and then deliberately discard the rebase. Aborting a Git operation is the exercise here, rather than ending the introduction.',
      ],
      '[data-tutorial="graph"]',
      { prepare: recipe('abort') },
    ),
    ...rebasePauseStartingSteps('abort'),
    s(
      'abort-open-file',
      ['Öffne zuerst den Konflikt', 'First open the conflict'],
      [
        'Klicke README.md in der Konfliktliste. Die Datei gehört zum bereits angehaltenen Rebase.',
        'Click README.md in the conflict list. The file belongs to the already paused rebase.',
      ],
      c('open') + '[data-conflict-path="README.md"]',
      { prepare: recipe('abort', 'staging'), completion: element(c('editor')) },
    ),
    s(
      'abort-draft',
      ['Erstelle einen erkennbaren Auflösungsentwurf', 'Create a recognizable resolution draft'],
      [
        'Ersetze den manuellen Text durch die Überschrift „# OGC-Lernprojekt“, eine Leerzeile und „Abbruch-Entwurf: Diese Lösung wird bewusst verworfen.“. Entferne damit auch die Konfliktmarker.',
        'Replace the manual text with the heading “# OGC-Lernprojekt”, a blank line and “Abort draft: This resolution will deliberately be discarded.” This also removes the conflict markers.',
      ],
      c('manual'),
      { prepare: recipe('abort', 'conflicts'), completion: { kind: 'value', selector: c('content'), value: REBASE_ABORT_DRAFT } },
    ),
    s(
      'abort-save',
      ['Speichere diesen Entwurf in die Arbeitsdatei', 'Save this draft into the working file'],
      [
        'Klicke Speichern. Dadurch ist die Lösung eine gespeicherte Arbeitsdatei, aber noch kein unabhängig gesicherter Commit.',
        'Click Save. The resolution becomes a saved working file, but not an independently preserved commit.',
      ],
      c('save'),
      { prepare: recipe('abort', 'chosen'), completion: element(conflictStage('false')) },
    ),
    s(
      'abort-saved',
      ['Auch eine gespeicherte Arbeitslösung wird zurückgesetzt', 'A saved working resolution is reset too'],
      [
        'Der Stern ist verschwunden, der Rebase wartet noch. Ein bestätigter Abbruch verwirft diese erfasste Arbeitslösung und stellt die ursprünglichen Dateien wieder her.',
        'The asterisk is gone and rebase is still waiting. A confirmed abort discards this tracked working resolution and restores the original files.',
      ],
      c('editor'),
      { prepare: recipe('abort', 'resolution-saved') },
    ),
    s(
      'abort-open',
      ['Öffne die Rebase-Abbruchbestätigung', 'Open the rebase abort confirmation'],
      [
        'Klicke Abbrechen in der Rebase-Aktionsgruppe. Damit öffnest du zunächst nur die Schutzabfrage.',
        'Click Abort in the Rebase action group. This first opens only the confirmation.',
      ],
      rebaseControl('abort'),
      { prepare: recipe('abort', 'resolution-saved'), completion: element(confirm) },
    ),
    s(
      'abort-command',
      ['Prüfe den vollständigen Befehl', 'Check the complete command'],
      [
        'Der Dialog nennt git rebase --abort. Er beendet den gesamten laufenden Rebase und stellt den ursprünglichen Branch wieder her.',
        'The dialog names git rebase --abort. It ends the entire pending rebase and restores the original branch.',
      ],
      '.dialog-modal .dialog-context-list dd',
      { prepare: recipe('abort', 'abort-review') },
    ),
    s(
      'abort-impact',
      ['Die Warnung betrifft deine Rebase-Arbeit', 'The warning concerns your rebase work'],
      [
        'Die Verlustwarnung umfasst auch eine schon in die Arbeitsdatei gespeicherte Auflösung. Speichern im Editor sichert sie nicht vor dem Zurücksetzen durch Rebase-Abbruch.',
        'The loss warning also includes a resolution already saved into the working file. Saving in the editor does not protect it from the reset performed by rebase abort.',
      ],
      '.dialog-modal .dialog-impact',
      { prepare: recipe('abort', 'abort-review') },
    ),
    s(
      'abort-cancel',
      ['Schließe die Schutzabfrage zuerst ohne Ausführung', 'First close the confirmation without executing'],
      [
        'Klicke Abbrechen im Dialog. Das bricht nur die Bestätigung ab; der Rebase und deine gespeicherte Arbeitslösung bleiben erhalten.',
        'Click Cancel in the dialog. This cancels only the confirmation; the rebase and your saved working resolution remain.',
      ],
      cancel,
      { prepare: recipe('abort', 'abort-review'), completion: { kind: 'absent', selector: '.dialog-modal' } },
    ),
    s(
      'abort-cancelled',
      ['Die gespeicherte Lösung ist weiterhin vorhanden', 'The saved resolution is still present'],
      [
        'Der manuelle Text enthält noch deinen Abbruch-Entwurf. HEAD steht weiterhin auf Basis 2 und main auf dem ursprünglichen vierten Commit.',
        'The manual text still contains your abort draft. HEAD still points to base 2 and main to the original fourth commit.',
      ],
      c('content'),
      { prepare: recipe('abort', 'cancelled') },
    ),
    s(
      'abort-reopen',
      ['Öffne die Schutzabfrage erneut', 'Reopen the confirmation'],
      [
        'Klicke erneut Abbrechen in der Rebase-Gruppe. Diesmal führen wir den bewussten Rückweg aus.',
        'Click Abort in the Rebase group again. This time we will deliberately return to the original state.',
      ],
      rebaseControl('abort'),
      { prepare: recipe('abort', 'cancelled'), completion: element(confirm) },
    ),
    s(
      'abort-confirm',
      ['Bestätige den Rebase-Abbruch', 'Confirm rebase abort'],
      [
        'Bestätige Rebase abbrechen. Die Übung prüft die Rückkehr zu main am ursprünglichen vierten Commit und die verworfene Arbeitslösung.',
        'Confirm Abort rebase. The exercise checks the return to main at the original fourth commit and the discarded working resolution.',
      ],
      confirm,
      {
        prepare: recipe('abort', 'abort-review'),
        action: 'aborted',
        completion: {
          kind: 'all',
          conditions: [
            element(mergeHead(4)),
            tree([], [], [], { content: [{ path: 'README.md', source: 'worktree', value: { example: 'history-readme', version: 'latest' } }] }),
          ],
        },
      },
    ),
    s(
      'abort-restored',
      ['HEAD und main sind wieder zusammen', 'HEAD and main are together again'],
      [
        'Die ursprünglichen Commits 3 und 4 stehen wieder auf dem aktiven Branch. Die vorherige Todo-Auslassung und der angefangene Replay wurden zurückgenommen.',
        'Original commits 3 and 4 are again on the active branch. The earlier todo omission and started replay were undone.',
      ],
      mergeHead(4),
      { prepare: recipe('abort', 'aborted') },
    ),
    s(
      'abort-other-refs',
      ['Andere Branches und Tags bleiben erhalten', 'Other branches and tags are retained'],
      [
        'origin/main und v1.0.0 bleiben auf Commit 2. Der Abbruch hat keine entfernten Referenzen verändert oder veröffentlicht.',
        'origin/main and v1.0.0 remain on commit 2. Abort changed or published no remote references.',
      ],
      graphRow(2) + ' .commit-refs',
      { prepare: recipe('abort', 'aborted') },
    ),
    s(
      'abort-tree',
      ['Öffne das wiederhergestellte Working Directory', 'Open the restored working directory'],
      [
        'Wechsle zu Working Directory, um die tatsächliche aktuelle README nach dem Abbruch zu lesen.',
        'Switch to Working Directory to read the actual current README after abort.',
      ],
      fileControl('open-files'),
      { prepare: recipe('abort', 'aborted'), completion: element(fileControl('open-files') + '[aria-pressed="true"]') },
    ),
    s(
      'abort-read',
      ['Öffne die wiederhergestellte README', 'Open the restored README'],
      [
        'Klicke README.md. Der ursprüngliche vierte Stand muss jetzt wieder vorhanden sein.',
        'Click README.md. The original fourth revision must now be present again.',
      ],
      fileRow('README.md'),
      { prepare: restored(), completion: element(historyViewer()) },
    ),
    s(
      'abort-text',
      ['Lies die aktuelle vollständige Datei', 'Read the complete current file'],
      [
        'Wähle Text. Begrüßung und Status des ursprünglichen vierten Commits sind wieder da; dein gespeicherter Abbruch-Entwurf gehört nicht mehr zur Arbeitsdatei.',
        'Choose Text. The original fourth commit’s greeting and status are back; your saved abort draft is no longer part of the working file.',
      ],
      fileTab('text'),
      { prepare: restored(true), completion: element(historyViewer() + '[data-tab="text"]') },
    ),
    s(
      'abort-work',
      ['Die bestätigte Wiederherstellung ist überprüfbar', 'The confirmed restoration can be inspected'],
      [
        'Die Datei zeigt wieder Hallo Welt und Bereit. Ein erneuter Einstieg in diese Lektion startet trotzdem frisch vor dem Rebase.',
        'The file again shows Hello world and Ready. Reentering this lesson still starts fresh before the rebase.',
      ],
      historyViewer(),
      { prepare: restored(true) },
    ),
    s(
      'abort-close',
      ['Schließe die geprüfte Datei', 'Close the inspected file'],
      [
        'Schließe den Dateibetrachter. Die Übung zum bestätigten Rebase-Abbruch ist abgeschlossen.',
        'Close the file viewer. The confirmed rebase abort exercise is complete.',
      ],
      fileControl('close-file'),
      { prepare: restored(true), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
  ],
};
