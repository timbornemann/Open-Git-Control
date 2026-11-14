import { withTextViewSteps } from './fileTextViewSteps';
import type { TutorialChapter } from './types';
import {
  fileStep as s,
  fileControl as c,
  fileRow as row,
  fileTab as tab,
  fileRecipe as seed,
  draftRecipe as draft,
  fileViewer,
  editor,
  dialog,
  cancelDialog,
  confirmDialog,
  element,
  editorValue,
  fileState,
} from './fileLessonHelpers';
const closeDraft = draft('draft');
const closeDialog = { ...closeDraft, submit: `${fileViewer}[data-dirty="true"] ${c('close-file')}`, ready: dialog };
const diffDialog = { ...closeDraft, submit: `${fileViewer}[data-dirty="true"] [data-file-tab="diff"]`, ready: dialog };
const gone = { kind: 'absent' as const, selector: fileViewer };

export const TUTORIAL_FILES_DRAFTS: TutorialChapter = {
  id: 'files-drafts',
  section: 'repo',
  title: ['Ungespeicherte Entwürfe sicher verlassen', 'Leave unsaved drafts safely'],
  description: [
    'Schließen und Diffwechsel mit Entwurf üben: Abbrechen, nur den Editorentwurf verwerfen oder speichern und weitergehen.',
    'Practice closing and opening Diff with a draft: cancel, discard only the editor draft, or save and continue.',
  ],
  question: ['Was passiert beim Schließen mit ungespeicherten Änderungen?', 'What happens when I close a file with unsaved changes?'],
  keywords: 'entwurf draft unsaved ungespeichert schließen close abbrechen cancel verwerfen discard speichern save dialog',
  steps: [
    s(
      'overview',
      ['Eine ungespeicherte Bearbeitung braucht eine Entscheidung', 'An unsaved edit requires a decision'],
      [
        'Wir beginnen mit einer sauberen README. Du erstellst einen Editorentwurf und übst die Entscheidungen beim Schließen und beim Wechsel zum Diff. Die gespeicherte Datei ist vom Entwurf getrennt.',
        'We start with a clean README. You will make an editor draft and practice the decisions when closing and switching to Diff. The saved file is separate from the draft.',
      ],
      row(),
      { continue: false },
    ),
    s(
      'open-editor',
      ['Öffne die Beispieldatei', 'Open the sample file'],
      [
        'Öffne README.md über Working Directory. Wir ändern gleich ihre Statuszeile.',
        'Open README.md from Working Directory. Next we will edit its status line.',
      ],
      row(),
      { completion: element(`${fileViewer}[data-tab="text"] ${editor}`) },
    ),
    s(
      'edit-draft',
      ['Erstelle einen ungespeicherten Entwurf', 'Create an unsaved draft'],
      [
        'Ersetze Entwurf durch Weitere Bearbeitung in der Statuszeile. Speichere diese Änderung noch nicht.',
        'Replace Draft with Further edit in the status line. Do not save this change yet.',
      ],
      editor,
      { prepare: seed(), completion: editorValue('draft') },
    ),
    s(
      'unsaved',
      ['Der Stern und die Schaltfläche zeigen den Entwurf', 'The asterisk and button identify the draft'],
      [
        'Die Datei hat einen Stern und Speichern ist verfügbar. Der Editor enthält die neue Statuszeile; die gespeicherte Datei und der Index haben weiterhin den ursprünglichen Inhalt.',
        'The file has an asterisk and Save is available. The editor contains the new status line; the saved file and index still contain the original text.',
      ],
      '.file-viewer-title',
      { prepare: closeDraft },
    ),
    s(
      'request-close',
      ['Fordere das Schließen an', 'Request closing'],
      [
        'Klicke das X am Viewer. Die App fragt nach einer Entscheidung, weil der Entwurf noch nicht gespeichert ist.',
        'Click the viewer’s X. The app asks for a decision because the draft is not saved.',
      ],
      c('close-file'),
      { prepare: closeDraft, completion: element(dialog) },
    ),
    s(
      'choices',
      ['Drei Möglichkeiten betreffen unterschiedliche Zustände', 'Three options affect different states'],
      [
        'Abbrechen bleibt im Editor. Entwurf verwerfen verliert nur die ungespeicherte Bearbeitung. Speichern und weiter schreibt den Entwurf zuerst in die gewählte Dateiquelle und verlässt sie danach. Die Datei- und Quellenangaben helfen bei der Prüfung.',
        'Cancel stays in the editor. Discard draft loses only the unsaved edit. Save and continue first writes the draft to the selected file source, then leaves it. File and source labels help you review the action.',
      ],
      dialog,
      { prepare: closeDialog },
    ),
    s(
      'cancel',
      ['Bleibe im Editor', 'Stay in the editor'],
      ['Klicke Abbrechen. Die neue Statuszeile soll im Editor erhalten bleiben.', 'Click Cancel. The new status line should remain in the editor.'],
      cancelDialog,
      { prepare: closeDialog, completion: { kind: 'absent', selector: dialog } },
    ),
    s(
      'preserved',
      ['Abbrechen erhält den vollständigen Entwurf', 'Cancel preserves the complete draft'],
      [
        'Der Dialog ist zu, der Stern bleibt und Weitere Bearbeitung steht weiterhin im Editor. Abbrechen hat weder gespeichert noch Text verworfen.',
        'The dialog is closed, the asterisk remains and Further edit is still in the editor. Cancel neither saved nor discarded text.',
      ],
      `${fileViewer}[data-dirty="true"]`,
      { prepare: closeDraft },
    ),
    s(
      'request-diff',
      ['Versuche mit dem Entwurf zu Diff zu wechseln', 'Try switching to Diff with the draft'],
      [
        'Klicke Diff. Auch dieser Wechsel verlangt eine Entscheidung, weil der Diff mit gespeicherten Dateiständen arbeitet.',
        'Click Diff. This switch also requires a decision because the diff works with saved file versions.',
      ],
      tab('diff'),
      { prepare: closeDraft, completion: element(dialog) },
    ),
    s(
      'diff-choices',
      ['Die Beschriftung nennt das Ziel Diff', 'The labels name Diff as the destination'],
      [
        'Hier lauten die Optionen unter anderem Speichern und zum Diff sowie Entwurf verwerfen und zum Diff. So kannst du vor dem Vergleich bewusst entscheiden, welchen gespeicherten Stand du sehen möchtest.',
        'Here the options include Save and open Diff and Discard draft and open Diff. They let you decide which saved version to compare.',
      ],
      dialog,
      { prepare: diffDialog },
    ),
    s(
      'cancel-diff',
      ['Brich auch den Diffwechsel ab', 'Cancel switching to Diff too'],
      [
        'Wähle Abbrechen. Wir behalten den Textentwurf und üben danach das bewusste Verwerfen beim Schließen.',
        'Choose Cancel. We keep the text draft and next practice deliberately discarding it on close.',
      ],
      cancelDialog,
      { prepare: diffDialog, completion: { kind: 'absent', selector: dialog } },
    ),
    s(
      'close-again',
      ['Öffne die Schließentscheidung erneut', 'Reopen the close decision'],
      [
        'Klicke noch einmal das X des Viewers. Im nächsten Schritt verwerfen wir nur den ungespeicherten Editorentwurf.',
        'Click the viewer’s X again. In the next step we discard only the unsaved editor draft.',
      ],
      c('close-file'),
      { prepare: closeDraft, completion: element(dialog) },
    ),
    s(
      'discard-draft',
      ['Verwirf den Editorentwurf', 'Discard the editor draft'],
      [
        'Klicke Entwurf verwerfen. Der Viewer soll schließen. Die zuvor gespeicherte README und der Index bleiben beim ursprünglichen Inhalt.',
        'Click Discard draft. The viewer should close. The previously saved README and index must retain their original contents.',
      ],
      confirmDialog,
      { prepare: closeDialog, completion: { kind: 'all', conditions: [fileState('head'), gone] } },
    ),
    s(
      'discard-result',
      ['Editorentwurf verwerfen ist keine Git-Rücknahme', 'Discarding an editor draft is not a Git restore'],
      [
        'Die Datei blieb unverändert und sauber. Diese Entscheidung hat nur den noch ungespeicherten Text verloren. Das Verwerfen gespeicherter Git-Arbeitsänderungen ist eine eigene Aktion in Staging oder am Hunk.',
        'The file stayed unchanged and clean. This decision lost only the unsaved buffer. Discarding saved Git worktree changes is a separate action in Staging or on a hunk.',
      ],
      row(),
    ),
    s(
      'reopen',
      ['Öffne die ursprüngliche Datei erneut', 'Reopen the original file'],
      [
        'Klicke README.md. Sie enthält wieder die ursprüngliche Statuszeile, weil der vorige Entwurf nie gespeichert wurde.',
        'Click README.md. It contains the original status line because the previous draft was never saved.',
      ],
      row(),
      { completion: element(`${fileViewer}[data-tab="text"] ${editor}`) },
    ),
    s(
      'edit-for-save',
      ['Erstelle diesmal eine zu speichernde Änderung', 'Make an edit to save this time'],
      [
        'Ersetze Entwurf durch Bearbeitet. Diesmal verwenden wir die Speicheroption direkt aus der Schließentscheidung.',
        'Replace Draft with Edited. This time we will save directly from the close decision.',
      ],
      editor,
      { prepare: seed(), completion: editorValue('edited') },
    ),
    s(
      'request-save-close',
      ['Fordere das Schließen mit dem neuen Entwurf an', 'Request closing with the new draft'],
      ['Klicke X. Prüfe im Dialog erneut Datei und Quelle.', 'Click X. Review the file and source in the dialog again.'],
      c('close-file'),
      { prepare: draft('edited'), completion: element(dialog) },
    ),
    s(
      'save-continue',
      ['Speichere und verlasse den Viewer', 'Save and leave the viewer'],
      [
        'Klicke Speichern und weiter. Der neue Inhalt soll in die Arbeitsdatei geschrieben werden; erst nach erfolgreichem Speichern soll der Viewer schließen.',
        'Click Save and continue. The new contents should be written to the working file; the viewer should close only after a successful save.',
      ],
      '[data-dialog-action="secondary"]',
      {
        prepare: { ...draft('edited'), submit: `${fileViewer}[data-dirty="true"] ${c('close-file')}`, ready: dialog },
        completion: { kind: 'all', conditions: [fileState('edited'), gone] },
      },
    ),
    s(
      'saved-result',
      ['Der Entwurf ist jetzt eine gespeicherte Arbeitsänderung', 'The draft is now a saved worktree change'],
      [
        'Der Viewer ist zu. README.md enthält die Bearbeitung, ist aber noch nicht vorgemerkt. Ein Speicherfehler würde dich mit erhaltenem Entwurf im Editor lassen.',
        'The viewer is closed. README.md contains the edit but is not staged yet. A save failure would keep you in the editor with the draft preserved.',
      ],
      row(),
      { prepare: seed('edited', 'head', { click: [] }) },
    ),
    s(
      'finish',
      ['Du kannst beim Verlassen bewusst entscheiden', 'You can decide deliberately when leaving'],
      [
        'Abbrechen behält den Entwurf, Entwurf verwerfen verliert nur ungespeicherten Text, und Speichern und weiter übernimmt ihn vor dem Verlassen. Die nächste Lektion zeigt dasselbe Speichern für den Git-Index.',
        'Cancel keeps the draft, Discard draft loses only unsaved text, and Save and continue writes it before leaving. The next lesson explains saving to the Git index.',
      ],
      c('open-files'),
      { prepare: seed('edited', 'head', { click: [] }) },
    ),
  ].flatMap(withTextViewSteps({ 'open-editor': 'README.md', reopen: 'README.md' })),
};
