import { withTextViewSteps } from './fileTextViewSteps';
import type { TutorialChapter } from './types';
import { squashDivergedRecipe as seed, squashDivergedMessage, squashDivergedDescription } from './mergeSquashDivergedHelpers';
import {
  mergeStep as s,
  mergeControl as c,
  mergeMore,
  mergeOpen,
  mergeSource,
  mergeHead,
  mergeDialog,
  mergeContext,
  mergeConfirm,
  mergeField as field,
  element,
  value,
} from './mergeLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileControl, fileRow } from './fileLessonHelpers';
import { stagingRow } from './stagingLessonHelpers';
const result = (options: Parameters<typeof seed>[0] = {}) => seed({ stage: 'result', ...options });
const committed = (options: Parameters<typeof seed>[0] = {}) => seed({ stage: 'committed', ...options });
export const TUTORIAL_MERGE_SQUASH_DIVERGED: TutorialChapter = {
  id: 'merge-squash-diverged',
  section: 'repo',
  title: ['Squash bei auseinanderentwickelten Branches', 'Squash with diverged branches'],
  description: [
    'Übernimm nur die unabhängige Quellenänderung in den Index, bewahre die eigene Begrüßung und erstelle einen eigenen Dokumentations-Commit.',
    'Stage only the independent source change, retain your own greeting and create your own documentation commit.',
  ],
  question: ['Was übernimmt Squash, wenn beide Branches eigene Änderungen haben?', 'What does squash include when both branches have their own changes?'],
  keywords: 'merge squash diverged auseinanderentwickelt index vorgemerkt eigene nachricht docs ein vorgänger lizenz basis',
  steps: [
    s(
      'overview',
      ['Squash kombiniert Änderungen über ihre gemeinsame Basis', 'Squash combines changes through their common base'],
      [
        'main enthält eine eigene README-Begrüßung. feature/begruessung hat unabhängig davon einen Hinweis in LICENSE ergänzt. Wir bündeln die Quellenänderung in einen eigenen Commit und prüfen, dass main seine Begrüßung behält.',
        'main contains its own README greeting. feature/begruessung independently added a note to LICENSE. We will combine the source change in a commit of our own and verify that main retains its greeting.',
      ],
      '[data-tutorial="graph"]',
      { continue: false, prepare: seed() },
    ),
    s(
      'target',
      ['Der bisherige main hat den vierten Commit', 'The previous main has the fourth commit'],
      [
        'Dieser gespeicherte Zielstand enthält die Begrüßung Hallo Welt. Squash soll sie nicht durch die ältere Quellen-README ersetzen.',
        'This saved target revision contains the Hello world greeting. Squash should not replace it with the older source README.',
      ],
      mergeHead(4),
      { prepare: seed() },
    ),
    s(
      'source-before',
      ['Die Quelle besitzt ihren eigenen fünften Commit', 'The source has its own fifth commit'],
      [
        'Der fünfte Commit ergänzt LICENSE. Sein Vorgänger ist die gemeinsame Basis, nicht der vierte main-Commit.',
        'The fifth commit adds to LICENSE. Its parent is the common base, not the fourth main commit.',
      ],
      graphRow(5),
      { prepare: seed() },
    ),
    s(
      'base',
      ['Beide Linien gehen vom dritten Commit aus', 'Both lines start at the third commit'],
      [
        'Die Basis zeigt, welche Änderung von welcher Seite stammt. Hier betreffen sie verschiedene Dateien und lassen sich ohne Textkonflikt verbinden.',
        'The base identifies which edit came from each side. Here they affect different files and can be combined without a text conflict.',
      ],
      graphRow(3),
      { prepare: seed() },
    ),
    s('more', ['Öffne die weiteren Aktionen', 'Open more actions'], ['Öffne das Dreipunktmenü oben.', 'Open the three-dot menu at the top.'], mergeMore, {
      prepare: seed(),
      completion: element(mergeOpen),
    }),
    s(
      'open',
      ['Öffne Zusammenführen', 'Open Merge'],
      ['Öffne das Formular für Richtung, Quelle und Verfahren.', 'Open the direction, source and behavior form.'],
      mergeOpen,
      { prepare: seed({ stage: 'more' }), completion: element(c('source')) },
    ),
    s(
      'source',
      ['Wähle feature/begruessung als Quelle', 'Choose feature/begruessung as source'],
      [
        'Lass In aktuellen Branch ausgewählt und wähle feature/begruessung. main bleibt aktiv.',
        'Keep Into current branch selected and choose feature/begruessung. main remains active.',
      ],
      c('source'),
      { prepare: seed({ stage: 'menu', mode: 'default' }), completion: value(c('source'), mergeSource) },
    ),
    s(
      'mode',
      ['Wähle Für einen Commit bündeln', 'Choose Combine for one commit'],
      [
        'Wähle Squash. Wir übernehmen kombinierte Inhalte, ohne eine zweite Vorgängerbeziehung zu speichern.',
        'Choose Squash. We combine contents without recording a second parent relationship.',
      ],
      c('mode'),
      { prepare: seed({ stage: 'menu', selected: true, mode: 'default' }), completion: value(c('mode'), 'squash') },
    ),
    s(
      'behavior',
      ['Squash ist kein pauschales Ersetzen durch Quelldateien', 'Squash does not simply replace files with the source tree'],
      [
        'Auch bei Squash bleiben unabhängige Zieländerungen erhalten. Die gemeinsame Basis wird für den kombinierten Dateistand genutzt; erst dein eigener Commit speichert ihn.',
        'Squash also preserves independent target edits. The common base determines the combined file state; only your own commit saves it.',
      ],
      c('behavior'),
      { prepare: seed({ stage: 'menu', selected: true }) },
    ),
    s(
      'review',
      ['Prüfe die Vorbereitung', 'Review the preparation'],
      ['Öffne die abschließende Prüfung vor der Schreibaktion.', 'Open the final review before writing.'],
      c('review'),
      { prepare: seed({ stage: 'menu', selected: true }), completion: element(mergeDialog) },
    ),
    s(
      'source-review',
      ['Die Quelle liefert den Projekthinweis', 'The source provides the project note'],
      ['feature/begruessung bleibt als Quellen-Branch erhalten.', 'feature/begruessung is retained as the source branch.'],
      mergeContext(1),
      { prepare: seed({ stage: 'review' }) },
    ),
    s(
      'target-review',
      ['main erhält das vorbereitete Ergebnis', 'main receives the prepared result'],
      [
        'Der aktive Zielbranch bleibt main. Sein Commit-Zeiger wird beim Vorbereiten noch nicht bewegt.',
        'The active target remains main. Its commit pointer does not move during preparation.',
      ],
      mergeContext(2),
      { prepare: seed({ stage: 'review' }) },
    ),
    s(
      'mode-review',
      ['Squash benötigt anschließend deinen eigenen Commit', 'Squash needs your own commit afterwards'],
      [
        'Prüfe Squash als Verfahren. Diese Bestätigung erstellt noch keinen neuen Commit.',
        'Check Squash as the behavior. This confirmation does not create a new commit yet.',
      ],
      mergeContext(3),
      { prepare: seed({ stage: 'review' }) },
    ),
    s(
      'confirm',
      ['Bereite die kombinierte Änderung vor', 'Prepare the combined change'],
      [
        'Bestätige Änderungen vorbereiten. Danach soll nur LICENSE neu vorgemerkt sein.',
        'Confirm Prepare changes. Afterwards only LICENSE should be newly staged.',
      ],
      mergeConfirm,
      {
        prepare: seed({ stage: 'review' }),
        completion: { kind: 'all', conditions: [element(mergeHead(4)), { kind: 'working-tree', staged: ['LICENSE'], unstaged: [], untracked: [] }] },
      },
    ),
    s(
      'head-unchanged',
      ['main steht weiterhin am vierten Commit', 'main still points to the fourth commit'],
      [
        'Das Vorbereiten hat keinen sechsten Commit erzeugt. Der fünfte Commit gehört weiterhin zur getrennten Quellenlinie.',
        'Preparation created no sixth commit. The fifth commit still belongs to the separate source line.',
      ],
      mergeHead(4),
      { prepare: result() },
    ),
    s(
      'staged',
      ['Nur die zusätzliche LICENSE-Änderung ist vorgemerkt', 'Only the additional LICENSE change is staged'],
      [
        'Die bereits in main gespeicherte README-Änderung ist keine neue Indexänderung. Dein Commit wird den zusätzlichen Projekthinweis speichern.',
        'The README edit already saved on main is not a new index change. Your commit will save the additional project note.',
      ],
      '[data-tutorial="staged-files"]',
      { prepare: result() },
    ),
    s(
      'open-staged',
      ['Öffne den vorgemerkten LICENSE-Diff', 'Open the staged LICENSE diff'],
      [
        'Öffne LICENSE im vorgemerkten Bereich und vergleiche sie mit dem bisherigen main.',
        'Open LICENSE in the staged section and compare it with the previous main.',
      ],
      stagingRow('staged', 'LICENSE'),
      { prepare: result(), completion: element(historyViewer('staged', 'LICENSE')) },
    ),
    s(
      'read-staged',
      ['Der grüne Projekthinweis ist die zusätzliche Änderung', 'The green project note is the additional change'],
      [
        'Der vorhandene Lizenztext bleibt erhalten. Neu ist nur der Quellenhinweis. Prüfe den Inhalt vor dem eigenen Commit.',
        'The existing license text is retained. Only the source note is new. Review the contents before your own commit.',
      ],
      historyViewer('staged', 'LICENSE'),
      { prepare: result({ file: 'staged' }) },
    ),
    s(
      'close-staged',
      ['Schließe den Diff', 'Close the diff'],
      ['Kehre zu den Commit-Feldern zurück. Die vorgemerkte Datei bleibt im Index.', 'Return to the commit fields. The staged file remains in the index.'],
      fileControl('close-file'),
      { prepare: result({ file: 'staged' }), completion: { kind: 'absent', selector: historyViewer('staged', 'LICENSE') } },
    ),
    s(
      'type',
      ['Wähle docs als Commit-Typ', 'Choose docs as the commit type'],
      [
        'Der Projekthinweis ist eine Dokumentationsänderung. Wähle docs; der Typ beeinflusst den Titel, nicht den Index.',
        'The project note is a documentation change. Choose docs; the type affects the title, not the index.',
      ],
      field('type'),
      { prepare: result(), completion: value(field('type'), 'docs') },
    ),
    s(
      'scope',
      ['Trage lernen als Bereich ein', 'Enter lernen as the scope'],
      [
        'Schreibe lernen in das Präfix-/Bereichsfeld. Die App setzt den Bereich bei gewähltem Typ in Klammern.',
        'Enter lernen in the prefix/scope field. With a type selected, the app encloses the scope in parentheses.',
      ],
      field('prefix'),
      { prepare: result({ form: 1 }), completion: value(field('prefix'), 'lernen') },
    ),
    s(
      'message',
      ['Fasse die zusätzliche Änderung zusammen', 'Summarize the additional change'],
      [
        'Schreibe „Projekthinweis übernehmen“. Der Titel beschreibt den Inhalt dieses eigenen Commits.',
        'Enter “combine the project note”. The title describes the contents of this commit of your own.',
      ],
      field('message'),
      { prepare: result({ form: 2 }), completion: { kind: 'value', selector: field('message'), value: squashDivergedMessage } },
    ),
    s(
      'description',
      ['Beschreibe auch die beibehaltene Zieländerung', 'Also describe the retained target change'],
      [
        'Schreibe „Unabhängigen Lizenzhinweis übernehmen und vorhandene Begrüßung erhalten.“ in die Beschreibung. Damit hältst du die bewusste Zusammenführung der Inhalte fest.',
        'Enter “Combine the independent license note and retain the existing greeting.” in Description. This records the deliberate combination of contents.',
      ],
      field('description'),
      { prepare: result({ form: 3 }), completion: { kind: 'value', selector: field('description'), value: squashDivergedDescription } },
    ),
    s(
      'preview',
      ['Prüfe den zusammengesetzten Titel', 'Check the assembled title'],
      [
        'Die Vorschau beginnt mit docs(lernen): und enthält deine Nachricht. Die Beschreibung ergänzt sie im gespeicherten Commit.',
        'The preview starts with docs(lernen): and includes your message. The description supplements it in the saved commit.',
      ],
      '.staging-commit-preview',
      { prepare: result({ form: 4 }) },
    ),
    s(
      'amend',
      ['Lass Amend ausgeschaltet', 'Leave Amend off'],
      [
        'Die zusätzliche Lizenzänderung erhält einen eigenen Commit. Wir ersetzen den bisherigen main-Commit nicht.',
        'The additional license change gets its own commit. We are not replacing the previous main commit.',
      ],
      field('amend'),
      { prepare: result({ form: 4 }) },
    ),
    s(
      'commit',
      ['Speichere den eigenen Dokumentations-Commit', 'Save your own documentation commit'],
      [
        'Klicke Commit. Erst jetzt soll main auf den neuen sechsten Commit weiterziehen.',
        'Click Commit. Only now should main advance to the new sixth commit.',
      ],
      '.staging-commit-btn',
      { prepare: result({ form: 4 }), completion: element(mergeHead(6)) },
    ),
    s(
      'single-parent',
      ['Der neue Commit hat nur den bisherigen main als Vorgänger', 'The new commit has only the previous main as its parent'],
      [
        'Squash speichert die zusätzliche Änderung mit deiner Nachricht, aber keine zweite Verbindung zum Quellen-Commit. Der einzige Vorgänger ist der vierte Commit.',
        'Squash saves the additional change with your message but records no second connection to the source commit. Its only parent is the fourth commit.',
      ],
      mergeHead(6),
      { prepare: committed() },
    ),
    s(
      'source-kept',
      ['Die Quellenlinie bleibt getrennt erhalten', 'The source line remains separately preserved'],
      [
        'feature/begruessung bleibt am fünften Commit. Gleiche übernommene Inhalte bedeuten bei Squash keine gespeicherte Zusammenführungsbeziehung; reguläres Branch-Löschen kann die Linie daher weiterhin als nicht zusammengeführt behandeln.',
        'feature/begruessung remains at the fifth commit. With squash, inherited contents do not record a merge relationship; ordinary branch deletion can therefore still treat this line as unmerged.',
      ],
      graphRow(5),
      { prepare: committed() },
    ),
    s(
      'select-commit',
      ['Wähle deinen neuen Commit', 'Select your new commit'],
      ['Öffne den Commit-Inspektor für Titel, Beschreibung und gespeicherte Dateien.', 'Open the commit inspector for the title, description and saved files.'],
      graphRow(6),
      { prepare: committed(), completion: element(commitPanel(6)) },
    ),
    s(
      'open-diff',
      ['Öffne den gespeicherten LICENSE-Diff', 'Open the saved LICENSE diff'],
      ['Prüfe den tatsächlich gespeicherten Unterschied zum bisherigen main.', 'Inspect the actual saved difference from the previous main.'],
      commitPanel(6) + ' ' + commitFile('LICENSE'),
      { prepare: committed({ commit: true }), completion: element(historyViewer(6, 'LICENSE')) },
    ),
    s(
      'read-diff',
      ['Der gespeicherte Diff enthält genau den Projekthinweis', 'The saved diff contains exactly the project note'],
      [
        'Der grüne Hinweis entspricht der zuvor vorgemerkten Änderung. Die README ist keine neu geänderte Datei dieses Commits.',
        'The green note matches the previously staged change. README is not a newly changed file in this commit.',
      ],
      historyViewer(6, 'LICENSE'),
      { prepare: committed({ file: 'commit' }) },
    ),
    s(
      'close-diff',
      ['Schließe die Commit-Dateiansicht', 'Close the commit file viewer'],
      [
        'Kehre zum Arbeitsbereich zurück und prüfe anschließend den vollständigen README-Inhalt.',
        'Return to the workspace, then check the complete README contents.',
      ],
      fileControl('close-file'),
      { prepare: committed({ file: 'commit' }), completion: { kind: 'absent', selector: historyViewer(6, 'LICENSE') } },
    ),
    s(
      'open-files',
      ['Öffne die aktuellen Arbeitsdateien', 'Open the current working files'],
      [
        'Öffne die Dateiansicht. main ist am neuen Commit aktiv und der Index ist sauber.',
        'Open the file tree. main is active at the new commit and the index is clean.',
      ],
      fileControl('open-files'),
      { prepare: committed(), completion: element(fileControl('open-files') + '[aria-pressed="true"]') },
    ),
    s(
      'open-readme',
      ['Öffne README.md', 'Open README.md'],
      ['Öffne die README, um die beibehaltene Zieländerung zu prüfen.', 'Open README to check the retained target edit.'],
      fileRow('README.md'),
      { prepare: committed({ file: 'tree', path: 'README.md' }), completion: element(historyViewer()) },
    ),
    s(
      'contents',
      ['Hallo Welt ist weiterhin der gespeicherte Zielinhalt', 'Hello world remains the saved target content'],
      [
        'Die vollständige README enthält weiterhin die Begrüßung von main. Squash hat sie nicht auf die ältere Quellenfassung zurückgesetzt. Der neue Commit ergänzt nur den unabhängigen Lizenzhinweis.',
        'The complete README still contains main’s greeting. Squash did not reset it to the older source version. The new commit adds only the independent license note.',
      ],
      historyViewer(),
      { prepare: committed({ file: 'work', path: 'README.md' }) },
    ),
    s(
      'close-file',
      ['Schließe die Inhaltsprüfung', 'Close the contents check'],
      ['Kehre zum fertigen eigenen Commit zurück.', 'Return to your completed commit.'],
      fileControl('close-file'),
      { prepare: committed({ file: 'work', path: 'README.md' }), completion: { kind: 'absent', selector: historyViewer() } },
    ),
    s(
      'finish',
      ['Nur die zusätzliche Änderung, mit deiner eigenen Nachricht', 'Only the additional change, with your own message'],
      [
        'Du hast den Index geprüft, alle Commit-Felder ausgefüllt, den einzelnen Vorgänger kontrolliert und beide Dateiinhalte bestätigt. Alles blieb lokal im Lernprojekt. Weiter beendet die Lektion.',
        'You checked the index, filled every commit field, inspected the single parent and confirmed both file contents. Everything stayed local to the learning project. Next finishes this lesson.',
      ],
      '[data-tutorial="graph"]',
      { prepare: committed() },
    ),
  ].flatMap(withTextViewSteps({ 'open-readme': 'README.md' })),
};
