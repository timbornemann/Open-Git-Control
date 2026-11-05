import type { TutorialChapter } from './types';
import {
  conflictStep as s,
  conflictRecipe as seed,
  conflictControl as c,
  conflictOpen,
  conflictDraftFor,
  conflictResolvedFor,
  conflictStage,
} from './conflictLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileControl } from './fileLessonHelpers';
const open = () => seed({ stage: 'open' });
const ours = () => seed({ stage: 'chosen', choice: 'ours' });
const both = () => seed({ stage: 'chosen', choice: 'both' });
const restored = (choice: 'ours' | 'both' | 'all-ours' | 'all-theirs', action: 'reload' | 'discard-draft' = 'discard-draft') =>
  seed({ stage: 'chosen', choice, restored: action });
const resolved = () => seed({ stage: 'resolved', choice: 'both', saveResolved: true });
const result = (options: { commit?: boolean; diff?: boolean } = {}) => seed({ stage: 'continued', choice: 'both', saveResolved: true, ...options });
const original = element(conflictStage('false') + '[data-conflict-blocks="1"]');
export const TUTORIAL_CONFLICT_CHOICES: TutorialChapter = {
  id: 'conflicts-choices',
  section: 'repo',
  title: ['Konfliktentscheidungen: Aktuell, Eingehend und Beide ausprobieren', 'Conflict choices: try Current, Incoming and Both'],
  description: [
    'Vergleiche die Auswahl pro Block mit den Aktionen für die ganze Datei. Verwirf und lade Entwürfe neu, bevor du beide Fassungen gemeinsam speicherst.',
    'Compare per-block choices with actions for the whole file. Discard and reload drafts before saving both versions together.',
  ],
  question: ['Wie übernehme ich beide Konfliktseiten oder ändere meine Entscheidung?', 'How do I take both conflict sides or change my choice?'],
  keywords: 'konflikt conflict aktuell ours theirs beide both alle blöcke entwurf verwerfen neu laden reload',
  steps: [
    s(
      'overview',
      ['Mehrere Entscheidungen am gleichen Beispiel prüfen', 'Try different choices on the same example'],
      [
        'Der vorbereitete README-Konflikt beginnt wieder frisch. Wir probieren mehrere Entscheidungen aus und speichern erst am Ende. Eine Auswahl im Vergleich ist zunächst nur ein Editor-Entwurf.',
        'The prepared README conflict starts fresh again. We try several choices and save only at the end. A choice in the comparison is initially only an editor draft.',
      ],
      '[data-tutorial="graph"]',
      { continue: false, prepare: seed() },
    ),
    s(
      'open',
      ['Öffne die Konfliktdatei', 'Open the conflict file'],
      ['Öffne README.md über den Konfliktbereich im Staging.', 'Open README.md from the conflict section in Staging.'],
      conflictOpen,
      { prepare: seed(), completion: element(c('editor')) },
    ),
    s(
      'take-current',
      ['Übernimm die aktuelle Seite des Blocks', 'Take the current side of the block'],
      [
        'Klicke Übernehmen bei Aktuelle Version. Der Entwurf behält die Welt-Begrüßung von main und entfernt die eingehende Team-Begrüßung dieses Blocks.',
        'Click Apply under Current version. The draft keeps the world greeting from main and removes the incoming team greeting of this block.',
      ],
      c('take-ours'),
      { prepare: open(), completion: conflictDraftFor('ours') },
    ),
    s(
      'current-draft',
      ['Die aktuelle Fassung ist eine mögliche Auflösung', 'The current version is one possible resolution'],
      [
        'Die Datei würde damit inhaltlich beim bisherigen main bleiben. Trotzdem muss der Konflikt ausdrücklich aufgelöst und der Merge abgeschlossen werden. Hier probieren wir zunächst weiter.',
        'This would leave the file contents at the old main revision. The conflict would still need explicit resolution and the merge must finish. Here we keep experimenting first.',
      ],
      c('content'),
      { prepare: ours() },
    ),
    s(
      'discard-current',
      ['Verwirf nur den ungespeicherten Entwurf', 'Discard only the unsaved draft'],
      [
        'Klicke Änderungen verwerfen in den Editor-Aktionen. Das stellt die zuletzt geladene Datei mit ihren Konfliktmarkern wieder her. Es bricht den Merge nicht ab.',
        'Click Discard changes in the editor actions. This restores the last loaded file with its conflict markers. It does not abort the merge.',
      ],
      c('discard-draft'),
      { prepare: ours(), completion: original },
    ),
    s(
      'restored',
      ['Der ursprüngliche Konflikt ist wieder bearbeitbar', 'The original conflict is editable again'],
      [
        'Beide Seiten und ihre Übernehmen-Schaltflächen sind zurück. Verwerfen betrifft den Editor-Entwurf; gespeicherte Arbeitsdateien und der Merge-Vorgang sind eigene Zustände.',
        'Both sides and their Apply buttons are back. Discard affects the editor draft; saved working files and the merge operation are separate states.',
      ],
      c('comparison'),
      { prepare: restored('ours') },
    ),
    s(
      'take-both',
      ['Übernimm beide Fassungen des Blocks', 'Take both versions of the block'],
      [
        'Klicke Beide Versionen übernehmen. Die aktuelle Fassung wird zuerst eingefügt, danach die eingehende. Gemeinsame Zeilen außerhalb des Konfliktblocks erscheinen nur einmal.',
        'Click Take both versions. The current version is inserted first, followed by the incoming one. Common lines outside the block appear only once.',
      ],
      c('take-both'),
      { prepare: restored('ours'), completion: conflictDraftFor('both') },
    ),
    s(
      'both-draft',
      ['Prüfe Reihenfolge und Dopplungen', 'Check ordering and duplication'],
      [
        'Im Entwurf stehen jetzt Welt- und Team-Begrüßung nacheinander. Beide ist eine Textverkettung; du entscheidest, ob das fachlich sinnvoll ist. Titel und Statuszeile bleiben einfach erhalten.',
        'The draft now has the world greeting followed by the team greeting. Both concatenates text; you decide whether that makes sense. The title and status line remain single copies.',
      ],
      c('content'),
      { prepare: both() },
    ),
    s(
      'reload',
      ['Lade die gespeicherte Arbeitsdatei neu', 'Reload the saved working file'],
      [
        'Klicke Neu laden. Unsere Entscheidungen wurden noch nicht gespeichert; die Arbeitsdatei enthält deshalb weiterhin den ursprünglichen Konflikt. Der Entwurf wird durch diese Datei ersetzt.',
        'Click Reload. Our choices have not been saved, so the working file still contains the original conflict. The draft is replaced by that file.',
      ],
      c('reload'),
      { prepare: both(), completion: original },
    ),
    s(
      'reload-result',
      ['Neu laden zeigt den Stand der Arbeitsdatei', 'Reload shows the working-file revision'],
      [
        'Neu laden liest die Datei erneut ein. Änderungen verwerfen setzt dagegen den Entwurf auf den zuletzt geladenen Stand zurück. In dieser Übung ergeben beide Aktionen denselben ursprünglichen Konflikt.',
        'Reload reads the file again. Discard changes instead resets the draft to the last loaded revision. In this exercise both actions restore the same original conflict.',
      ],
      c('content'),
      { prepare: restored('both', 'reload') },
    ),
    s(
      'all-current',
      ['Übernimm Aktuell für alle Blöcke dieser Datei', 'Take Current for every block of this file'],
      [
        'Klicke Alle: Aktuelle Version oben im Editor. Das wendet die Entscheidung auf jeden Konfliktblock der ausgewählten Datei an. Hier gibt es einen Block; andere Konfliktdateien wären nicht betroffen.',
        'Click All: Current version at the top. This applies the choice to every conflict block in the selected file. There is one block here; other conflict files would be unaffected.',
      ],
      c('all-ours'),
      { prepare: restored('both', 'reload'), completion: conflictDraftFor('all-ours') },
    ),
    s(
      'discard-all-current',
      ['Setze den Entwurf für den Gegenversuch zurück', 'Reset the draft for the opposite choice'],
      [
        'Verwirf die noch ungespeicherte Auswahl, um auch die zweite Datei-Aktion auszuprobieren.',
        'Discard this unsaved choice so you can try the other whole-file action too.',
      ],
      c('discard-draft'),
      { prepare: seed({ stage: 'chosen', choice: 'all-ours' }), completion: original },
    ),
    s(
      'all-incoming',
      ['Übernimm Eingehend für alle Blöcke dieser Datei', 'Take Incoming for every block of this file'],
      [
        'Klicke Alle: Eingehende Version. Alle Blöcke dieser Datei würden die eingehende Fassung erhalten. Auch diese Aktion verändert zunächst nur den Entwurf.',
        'Click All: Incoming version. Every block in this file would receive its incoming version. This action also changes only the draft initially.',
      ],
      c('all-theirs'),
      { prepare: restored('all-ours'), completion: conflictDraftFor('all-theirs') },
    ),
    s(
      'discard-all-incoming',
      ['Bereite die endgültige Wahl vor', 'Prepare the final choice'],
      [
        'Verwirf die ungespeicherte Auswahl ein letztes Mal. Für das gespeicherte Ergebnis wählen wir bewusst Beide.',
        'Discard the unsaved choice once more. For the saved result we deliberately choose Both.',
      ],
      c('discard-draft'),
      { prepare: seed({ stage: 'chosen', choice: 'all-theirs' }), completion: original },
    ),
    s(
      'choose-both',
      ['Wähle beide Fassungen als endgültigen Inhalt', 'Choose both versions as the final contents'],
      ['Übernimm beide Fassungen dieses Blocks und prüfe sie vor dem Speichern.', 'Take both versions of this block and check them before saving.'],
      c('take-both'),
      { prepare: restored('all-theirs'), completion: conflictDraftFor('both') },
    ),
    s(
      'save-resolved',
      ['Speichere und markiere in einem bewussten Schritt', 'Save and mark resolved in one deliberate step'],
      [
        'Klicke Speichern + gelöst. Diese Aktion schreibt zuerst den sichtbaren Entwurf in die Datei und markiert danach genau diesen Inhalt als gelöst im Index.',
        'Click Save + resolved. This first writes the visible draft to the file, then marks exactly those contents as resolved in the index.',
      ],
      c('save-resolved'),
      { prepare: both(), completion: conflictResolvedFor('both') },
    ),
    s(
      'staged',
      ['Beide Begrüßungen sind vorgemerkt', 'Both greetings are staged'],
      [
        'Die Konfliktdatei ist verschwunden; README.md steht im Index. Der gesamte Merge wartet weiterhin auf Fortsetzen. Speichern + gelöst erstellt selbst keinen Commit.',
        'The conflict file is gone; README.md is in the index. The whole merge still waits for Continue. Save + resolved does not create a commit itself.',
      ],
      '[data-tutorial="staged-files"]',
      { prepare: resolved() },
    ),
    s(
      'continue',
      ['Setze den Merge mit der gewählten Kombination fort', 'Continue the merge with the chosen combination'],
      [
        'Schließe den Merge ab. Der neue Commit speichert beide Begrüßungen und beide Vorgänger.',
        'Finish the merge. The new commit saves both greetings and both parents.',
      ],
      c('continue'),
      { prepare: resolved(), completion: element(mergeHead(6)) },
    ),
    s(
      'select-commit',
      ['Prüfe den gespeicherten Merge-Commit', 'Inspect the saved merge commit'],
      ['Wähle den neuen Commit im Graphen.', 'Select the new commit in the graph.'],
      graphRow(6),
      { prepare: result(), completion: element(commitPanel(6)) },
    ),
    s(
      'open-diff',
      ['Öffne den endgültigen README-Diff', 'Open the final README diff'],
      ['Öffne README.md im Commit-Inspektor.', 'Open README.md in the commit inspector.'],
      commitPanel(6) + ' ' + commitFile(),
      { prepare: result({ commit: true }), completion: element(historyViewer(6)) },
    ),
    s(
      'read-diff',
      ['Die Team-Begrüßung ergänzt den bisherigen Text', 'The team greeting supplements the old text'],
      [
        'Gegenüber main ist die Team-Begrüßung hinzugekommen. Die Welt-Begrüßung bleibt erhalten. Damit kannst du Beide auch im tatsächlichen gespeicherten Diff nachvollziehen.',
        'Relative to main, the team greeting was added. The world greeting remains. You can therefore verify Both in the actual saved diff.',
      ],
      historyViewer(6),
      { prepare: result({ diff: true }) },
    ),
    s(
      'close-diff',
      ['Schließe den Vergleich', 'Close the comparison'],
      ['Kehre nach der Kontrolle zum Verlauf zurück.', 'Return to history after checking.'],
      fileControl('close-file'),
      { prepare: result({ diff: true }), completion: { kind: 'absent', selector: historyViewer(6) } },
    ),
    s(
      'finish',
      ['Entwurfsentscheidungen und gespeichertes Ergebnis unterscheiden', 'Distinguish draft choices from the saved result'],
      [
        'Du hast Aktuell, Eingehend, Beide und die Aktionen für alle Blöcke ausprobiert, Entwürfe verworfen und neu geladen und die bewusste Kombination gespeichert. Weiter beendet diese Lektion.',
        'You tried Current, Incoming, Both and the whole-file actions, discarded and reloaded drafts, and saved your deliberate combination. Next finishes this lesson.',
      ],
      '[data-tutorial="graph"]',
      { prepare: result() },
    ),
  ],
};
