import type { TutorialChapter, TutorialCompletion } from './types';
import {
  conflictStep as s,
  conflictRecipe as seed,
  conflictControl as c,
  conflictOpen,
  conflictDraftFor,
  conflictResolvedFor,
  conflictStage,
} from './conflictLessonHelpers';
import { conflictManualContent } from './mergeExamples';
import { mergeHead, element } from './mergeLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileControl } from './fileLessonHelpers';
const open = () => seed({ stage: 'open' });
const unfinished = () => seed({ stage: 'chosen', choice: 'incomplete' });
const original = () => seed({ stage: 'chosen', choice: 'incomplete', restored: 'discard-draft' });
const chosen = () => seed({ stage: 'chosen', choice: 'manual' });
const saved = () => seed({ stage: 'saved', choice: 'manual' });
const resolved = () => seed({ stage: 'resolved', choice: 'manual' });
const result = (options: { commit?: boolean; diff?: boolean } = {}) => seed({ stage: 'continued', choice: 'manual', ...options });
const savedOnly: TutorialCompletion = {
  kind: 'all',
  conditions: [
    element(conflictStage('false')),
    element(c('section') + '[data-conflict-files="1"]'),
    { kind: 'working-tree', staged: [], unstaged: ['README.md'], content: [{ path: 'README.md', source: 'worktree', value: conflictManualContent }] },
  ],
};
export const TUTORIAL_CONFLICT_MANUAL: TutorialChapter = {
  id: 'conflicts-manual',
  section: 'repo',
  title: ['Konflikteditor: eigenen Inhalt schreiben und Marker prüfen', 'Conflict editor: write your own content and check markers'],
  description: [
    'Bearbeite die gesamte Konfliktdatei selbst. Beobachte die Sperre bei unvollständigen Markern, setze den Entwurf zurück und speichere eine eigene Auflösung.',
    'Edit the whole conflict file yourself. Observe the guard for incomplete markers, reset the draft and save your own resolution.',
  ],
  question: ['Wie bearbeite ich einen Konflikt manuell und entferne seine Marker?', 'How do I edit a conflict manually and remove its markers?'],
  keywords: 'konflikt conflict manuell editor marker unvollständig sperre entwurf speichern eigene auflösung',
  steps: [
    s(
      'overview',
      ['Eine eigene Auflösung statt einer fertigen Seite', 'Your own resolution instead of a preset side'],
      [
        'Der gleiche Merge-Konflikt ist wieder frisch vorbereitet. Diesmal schreiben wir selbst den endgültigen Inhalt. Der manuelle Editor enthält die ganze Datei, einschließlich gemeinsamer Zeilen außerhalb des Konfliktblocks.',
        'The same merge conflict is prepared fresh again. This time we write the final contents ourselves. The manual editor contains the whole file, including common lines outside the conflict block.',
      ],
      '[data-tutorial="graph"]',
      { continue: false, prepare: seed() },
    ),
    s(
      'open',
      ['Öffne die Konfliktdatei', 'Open the conflict file'],
      ['Öffne README.md aus dem Konfliktbereich im Staging.', 'Open README.md from the conflict section in Staging.'],
      conflictOpen,
      { prepare: seed(), completion: element(c('editor')) },
    ),
    s(
      'editor',
      ['Zeilennummern und farbige Bereiche helfen beim Bearbeiten', 'Line numbers and colored regions help you edit'],
      [
        'Der Editor zeigt die gesamte Datei mit Marker- und Seitenkennzeichnung. Du kannst Text ergänzen, entfernen oder beide Fassungen fachlich neu formulieren. Änderungen werden zunächst nur als Entwurf gehalten.',
        'The editor shows the whole file with marker and side highlighting. You can add or remove text or rewrite both versions appropriately. Changes are initially kept only as a draft.',
      ],
      c('content'),
      { prepare: open() },
    ),
    s(
      'incomplete',
      ['Probiere einen unvollständigen Marker-Entwurf', 'Try a draft with an incomplete marker'],
      [
        'Ersetze den Editorinhalt durch einen kurzen Entwurf mit Titel, leerer Zeile, <<<<<<< HEAD und darunter „Begrüßung: Unfertiger Entwurf“. Das folgende Beispiel ist absichtlich noch nicht auflösbar.',
        'Replace the editor contents with a short draft containing the title, a blank line, <<<<<<< HEAD and then “Greeting: Unfinished draft”. This example is deliberately not ready to resolve.',
      ],
      c('manual'),
      { prepare: open(), completion: conflictDraftFor('incomplete') },
    ),
    s(
      'warning',
      ['Unvollständige Marker sperren den strukturierten Vergleich', 'Incomplete markers lock the structured comparison'],
      [
        'Der Hinweis meldet unausgeglichene Marker. Die App kann daraus keinen vollständigen Konfliktblock bilden und blendet die Seitenwahl vorübergehend aus. Der manuelle Entwurf bleibt erhalten.',
        'The notice reports unbalanced markers. The app cannot form a complete conflict block and temporarily hides the side choices. Your manual draft remains intact.',
      ],
      '.conflict-editor-notice',
      { prepare: unfinished() },
    ),
    s(
      'guard',
      ['Gelöst markieren ist weiterhin gesperrt', 'Marking resolved is still disabled'],
      [
        'Solange Markerreste im Entwurf stehen, sind Als gelöst markieren und Speichern + gelöst deaktiviert. Wir setzen diesen ungespeicherten Versuch jetzt zurück.',
        'While marker fragments remain in the draft, Mark as resolved and Save + resolved are disabled. We will now reset this unsaved experiment.',
      ],
      c('mark'),
      { prepare: unfinished() },
    ),
    s(
      'discard',
      ['Verwirf den unvollständigen Entwurf', 'Discard the incomplete draft'],
      ['Stelle mit Änderungen verwerfen die zuletzt geladene Konfliktdatei wieder her.', 'Use Discard changes to restore the last loaded conflict file.'],
      c('discard-draft'),
      { prepare: unfinished(), completion: element(conflictStage('false') + '[data-conflict-blocks="1"]') },
    ),
    s(
      'write',
      ['Schreibe eine neue gemeinsame Begrüßung', 'Write a new shared greeting'],
      [
        'Ersetze den gesamten Inhalt durch den Titel # OGC-Lernprojekt, eine leere Zeile, „Begrüßung: Gemeinsam lernen!“ und „Status: Bereit“, jeweils mit Zeilenumbruch. Lass keine Konfliktmarker stehen.',
        'Replace the whole contents with the title # OGC-Lernprojekt, a blank line, “Greeting: Learn together!” and “Status: Ready”, each ending in a newline. Leave no conflict markers.',
      ],
      c('manual'),
      { prepare: original(), completion: conflictDraftFor('manual') },
    ),
    s(
      'check',
      ['Prüfe deine eigene Formulierung vor dem Speichern', 'Check your own wording before saving'],
      [
        'Die neue Begrüßung stammt weder vollständig von main noch vom Quellbranch. Titel und Status sind erhalten; der Konfliktblock wurde durch deinen eigenen Text ersetzt. Der Entwurf ist noch ungespeichert.',
        'The new greeting comes from neither main nor the source branch in full. The title and status remain; you replaced the conflict block with your own text. The draft is still unsaved.',
      ],
      c('content'),
      { prepare: chosen() },
    ),
    s(
      'save',
      ['Speichere deine eigene Fassung zunächst als Arbeitsdatei', 'First save your version as a working file'],
      [
        'Klicke Speichern. Die neue Begrüßung wird geschrieben, die Datei bleibt im Index zunächst als Konflikt offen.',
        'Click Save. The new greeting is written while the file initially remains conflicted in the index.',
      ],
      c('save'),
      { prepare: chosen(), completion: savedOnly },
    ),
    s(
      'saved',
      ['Dein Inhalt ist gespeichert, der Konflikt noch offen', 'Your contents are saved, the conflict is still open'],
      [
        'Der Entwurf entspricht nun der Arbeitsdatei. Es gibt keine offenen Marker mehr. Die ausdrücklich getrennte Auflösung übernimmt im nächsten Schritt genau diesen Inhalt in den Index.',
        'The draft now matches the working file. No open markers remain. The separate resolution step next copies exactly these contents into the index.',
      ],
      c('editor'),
      { prepare: saved() },
    ),
    s(
      'mark',
      ['Markiere deine gespeicherte Fassung als gelöst', 'Mark your saved version as resolved'],
      ['Übernimm den geprüften Inhalt mit Als gelöst markieren in den Index.', 'Use Mark as resolved to take the checked contents into the index.'],
      c('mark'),
      { prepare: saved(), completion: conflictResolvedFor('manual') },
    ),
    s(
      'continue',
      ['Speichere den Merge mit deiner eigenen Auflösung', 'Save the merge with your own resolution'],
      [
        'Setze den Merge fort. Der neue Commit erhält beide Vorgänger und deinen endgültigen Dateiinhalt.',
        'Continue the merge. The new commit gets both parents and your final file contents.',
      ],
      c('continue'),
      { prepare: resolved(), completion: element(mergeHead(6)) },
    ),
    s(
      'select-commit',
      ['Wähle den neuen Merge-Commit', 'Select the new merge commit'],
      ['Öffne seinen Commit-Inspektor.', 'Open its commit inspector.'],
      graphRow(6),
      { prepare: result(), completion: element(commitPanel(6)) },
    ),
    s(
      'open-diff',
      ['Öffne den gespeicherten README-Vergleich', 'Open the saved README comparison'],
      ['Wähle README.md in der Commit-Dateiliste.', 'Select README.md in the commit file list.'],
      commitPanel(6) + ' ' + commitFile(),
      { prepare: result({ commit: true }), completion: element(historyViewer(6)) },
    ),
    s(
      'read-diff',
      ['Der Diff zeigt deine neue gemeinsame Begrüßung', 'The diff shows your new shared greeting'],
      [
        'Gegenüber dem bisherigen main wurde die Welt-Begrüßung durch Gemeinsam lernen ersetzt. Damit ist überprüfbar, dass dein eigener Inhalt und keine pauschal vorgegebene Konfliktseite gespeichert wurde.',
        'Relative to the old main, the world greeting was replaced by Learn together. This verifies that your own contents were saved rather than a preset conflict side.',
      ],
      historyViewer(6),
      { prepare: result({ diff: true }) },
    ),
    s(
      'close-diff',
      ['Schließe den Viewer', 'Close the viewer'],
      ['Kehre nach der Inhaltsprüfung zum Verlauf zurück.', 'Return to history after checking the contents.'],
      fileControl('close-file'),
      { prepare: result({ diff: true }), completion: { kind: 'absent', selector: historyViewer(6) } },
    ),
    s(
      'finish',
      ['Die eigene Konfliktauflösung ist gespeichert', 'Your custom conflict resolution is saved'],
      [
        'Du hast unvollständige Marker erkannt, den Versuch zurückgesetzt, einen eigenen Entwurf geschrieben und Datei, Index und Merge getrennt abgeschlossen. Weiter beendet diese Lektion.',
        'You recognized incomplete markers, reset the experiment, wrote your own draft and finished the file, index and merge separately. Next finishes this lesson.',
      ],
      '[data-tutorial="graph"]',
      { prepare: result() },
    ),
  ],
};
