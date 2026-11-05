import type { TutorialChapter } from './types';
import {
  fileStep as s,
  fileControl as c,
  fileTab as tab,
  fileRecipe as seed,
  indexRecipe,
  fileViewer,
  editor,
  element,
  editorValue,
  fileState,
} from './fileLessonHelpers';
const staged = '[data-tutorial="staged-files"] [aria-label="README.md"]';
const working = '[data-tutorial="unstaged-files"] [aria-label="README.md"]';
const versions = seed('work', 'index', { click: [] });
const indexed = seed('work', 'index-edited', { click: [] });
const workText = seed('work', 'index-edited', { diff: { source: 'unstaged', path: 'README.md' }, click: [tab('text')] });

export const TUTORIAL_FILES_INDEX: TutorialChapter = {
  id: 'files-index',
  section: 'repo',
  title: ['Den Git-Index als eigene Dateiversion bearbeiten', 'Edit the Git index as a separate file version'],
  description: [
    'Index und Arbeitsdatei unterscheiden, Staging speichern und prüfen, dass die Arbeitsdatei erhalten bleibt.',
    'Distinguish index from worktree, save staging and verify that the working file is preserved.',
  ],
  question: ['Wie bearbeite ich eine vorgemerkte Dateiversion?', 'How do I edit a staged file version?'],
  keywords: 'index staging speichern save staged source quelle arbeitsdatei getrennt bearbeiten',
  steps: [
    s(
      'overview',
      ['Das Beispiel enthält drei verschiedene Fassungen', 'The example contains three different versions'],
      [
        'Der letzte Commit hat Status: Entwurf. Im Index steht Nur im Index, im Arbeitsordner Lokale Bearbeitung. Die README erscheint deshalb unter Vorgemerkt und Änderungen. Wir bearbeiten nur den Index.',
        'The last commit has Status: Draft. The index says Index only, and the worktree says Local edit. README therefore appears under both Staged and Changes. We will edit only the index.',
      ],
      staged,
      { continue: false, openView: undefined, inspector: 'staging', prepare: versions },
    ),
    s(
      'open-index',
      ['Öffne README.md unter Vorgemerkt', 'Open README.md under Staged'],
      [
        'Klicke die Datei im Bereich Vorgemerkt. Der Viewer startet mit dem Index-Diff gegen den letzten Commit.',
        'Click the file in Staged. The viewer starts with the index diff against the last commit.',
      ],
      staged,
      { openView: undefined, inspector: 'staging', prepare: versions, completion: element(`${fileViewer}[data-source="staged"][data-tab="diff"]`) },
    ),
    s(
      'source',
      ['Die Quellenangabe nennt Git-Index · Staging', 'The source label says Git index · Staging'],
      [
        'Alle Dateiaktionen im Viewer beziehen sich auf diese Quelle. Die daneben existierende Arbeitsdatei hat ihren eigenen Inhalt. Dateien aus einem Commit wären dagegen schreibgeschützt.',
        'Viewer file actions apply to this source. The separate working file has its own contents. Files read from a commit would instead be read-only.',
      ],
      c('file-source'),
      { openView: 'diff', inspector: 'staging', prepare: { ...versions, diff: { source: 'staged', path: 'README.md' } } },
    ),
    s(
      'open-text',
      ['Wechsle vom Index-Diff zu Text', 'Switch from the index diff to Text'],
      [
        'Klicke Text. Jetzt siehst du den vollständigen Inhalt der vorgemerkten Version und kannst ihn bearbeiten.',
        'Click Text. You can now see and edit the full contents of the staged version.',
      ],
      tab('text'),
      {
        openView: 'diff',
        inspector: 'staging',
        prepare: { ...versions, diff: { source: 'staged', path: 'README.md' } },
        completion: element(`${fileViewer}[data-source="staged"][data-tab="text"] ${editor}`),
      },
    ),
    s(
      'index-text',
      ['Die Arbeitsbearbeitung ist hier nicht der Editorinhalt', 'The worktree edit is not this editor’s contents'],
      [
        'Die Statuszeile lautet Nur im Index. Lokale Bearbeitung aus dem Arbeitsordner ist eine andere Version. Eine neue Eingabe hier wird zunächst ein Editorentwurf für den Index.',
        'The status line says Index only. Local edit from the worktree is another version. New input here first becomes an editor draft for the index.',
      ],
      editor,
      { openView: 'diff', inspector: 'staging', prepare: indexRecipe() },
    ),
    s(
      'edit-index',
      ['Bearbeite nur den Indexentwurf', 'Edit only the index draft'],
      [
        'Ersetze Nur im Index durch Geprüfte Vormerkung in der Statuszeile. Noch nicht speichern.',
        'Replace Index only with Reviewed index in the status line. Do not save yet.',
      ],
      editor,
      { openView: 'diff', inspector: 'staging', prepare: indexRecipe(), completion: editorValue('index-edited') },
    ),
    s(
      'save-target',
      ['Die Schaltfläche heißt Staging speichern', 'The button says Save staging'],
      [
        'Der Button benennt bewusst den Index als Ziel. Diese Aktion schreibt den Entwurf in die vorgemerkte Version, ohne die Arbeitsdatei zu überschreiben.',
        'The button explicitly names staging as its target. It writes the draft to the index without overwriting the working file.',
      ],
      c('save-file'),
      { openView: 'diff', inspector: 'staging', prepare: indexRecipe('index-edited') },
    ),
    s(
      'save-index',
      ['Speichere den Indexentwurf', 'Save the index draft'],
      [
        'Klicke Staging speichern. Im Index soll Geprüfte Vormerkung stehen; die Arbeitsdatei soll weiterhin Lokale Bearbeitung enthalten.',
        'Click Save staging. The index should say Reviewed index; the working file must still contain Local edit.',
      ],
      c('save-file'),
      { openView: 'diff', inspector: 'staging', prepare: indexRecipe('index-edited'), completion: fileState('work', 'index-edited') },
    ),
    s(
      'index-saved',
      ['Nur die vorgemerkte Fassung wurde geändert', 'Only the staged version changed'],
      [
        'Der Stern ist verschwunden. Ein Commit würde die geprüfte Indexfassung übernehmen. Die abweichende Arbeitsdatei bleibt als zusätzliche Änderung erhalten.',
        'The asterisk is gone. A commit would take the reviewed index version. The different working file remains an additional worktree change.',
      ],
      `${fileViewer}[data-dirty="false"]`,
      { openView: 'diff', inspector: 'staging', prepare: { ...indexed, diff: { source: 'staged', path: 'README.md' }, click: [tab('text')] } },
    ),
    s(
      'close-index',
      ['Schließe die Indexfassung', 'Close the index version'],
      ['Schließe den Viewer, damit wir die Arbeitsdatei separat kontrollieren können.', 'Close the viewer so that we can inspect the working file separately.'],
      c('close-file'),
      {
        openView: 'diff',
        inspector: 'staging',
        prepare: { ...indexed, diff: { source: 'staged', path: 'README.md' }, click: [tab('text')] },
        completion: { kind: 'absent', selector: fileViewer },
      },
    ),
    s(
      'open-working',
      ['Öffne die README unter Änderungen', 'Open README under Changes'],
      [
        'Klicke jetzt README.md unter Änderungen. Dieser Diff vergleicht die Arbeitsdatei mit der eben gespeicherten Indexfassung.',
        'Now click README.md under Changes. This diff compares the working file with the index version you just saved.',
      ],
      working,
      { openView: undefined, inspector: 'staging', prepare: indexed, completion: element(`${fileViewer}[data-source="unstaged"][data-tab="diff"]`) },
    ),
    s(
      'working-text',
      ['Öffne den vollständigen Arbeitsinhalt', 'Open the full working contents'],
      [
        'Klicke Text, um zu kontrollieren, dass die separate Arbeitsfassung unverändert geblieben ist.',
        'Click Text to check that the separate worktree version remained unchanged.',
      ],
      tab('text'),
      {
        openView: 'diff',
        inspector: 'staging',
        prepare: { ...indexed, diff: { source: 'unstaged', path: 'README.md' } },
        completion: element(`${fileViewer}[data-source="unstaged"][data-tab="text"] ${editor}`),
      },
    ),
    s(
      'working-preserved',
      ['Die Arbeitsdatei enthält weiterhin Lokale Bearbeitung', 'The working file still contains Local edit'],
      [
        'Die Quellenangabe lautet Arbeitsdatei und der Text hat den ursprünglichen lokalen Status. Staging speichern hat ihn nicht durch Geprüfte Vormerkung ersetzt.',
        'The source label says Working file and the text retains its original local status. Save staging did not replace it with Reviewed index.',
      ],
      editor,
      { openView: 'diff', inspector: 'staging', prepare: workText },
    ),
    s(
      'close-working',
      ['Schließe die Kontrollansicht', 'Close the inspection view'],
      ['Schließe den Viewer. Beide Dateiversionen bleiben erhalten.', 'Close the viewer. Both file versions remain intact.'],
      c('close-file'),
      { openView: 'diff', inspector: 'staging', prepare: workText, completion: { kind: 'absent', selector: fileViewer } },
    ),
    s(
      'finish',
      ['Prüfe beim Bearbeiten immer die Quelle', 'Always check the source when editing'],
      [
        'Du hast den Index verändert und gespeichert, ohne den Arbeitsordner anzutasten. Speichern, Stagen und Commit sind unterschiedliche Schritte. Commit-Dateien bleiben schreibgeschützt; für ihre Änderung bearbeitest du eine Arbeits- oder Indexfassung.',
        'You edited and saved the index while preserving the worktree. Saving, staging and committing are separate steps. Commit files remain read-only; edit a worktree or index version to change their contents.',
      ],
      c('staging'),
      { openView: undefined, inspector: 'staging', prepare: indexed },
    ),
  ],
};
