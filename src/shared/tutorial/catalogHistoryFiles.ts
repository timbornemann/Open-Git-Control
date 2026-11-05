import type { TutorialChapter } from './types';
import {
  historyStep as s,
  historyRecipe as seed,
  historyTreeRecipe as tree,
  historyEntry as entry,
  historyList as list,
  commitPanel as panel,
  commitFile as file,
  historyViewer as viewer,
  fileTab as tab,
  fileRow as row,
  c,
  element,
} from './historyLessonHelpers';
export const TUTORIAL_HISTORY_FILES: TutorialChapter = {
  id: 'history-files',
  section: 'repo',
  title: ['Den Verlauf einer einzelnen Datei verfolgen', 'Follow a single file’s history'],
  description: [
    'Dateiverlauf lesen, historische Stände öffnen und zwischen vergangenem Verlauf und vollständiger Dateihistorie unterscheiden.',
    'Read file history, open historical states and distinguish past history from the complete file timeline.',
  ],
  question: ['Welche Commits haben eine bestimmte Datei verändert?', 'Which commits changed a particular file?'],
  keywords: 'file history dateiverlauf historie vergangenheit future zukunft timeline autor hash read-only schreibgeschützt',
  steps: [
    s(
      'overview',
      ['Der Dateiverlauf filtert nach tatsächlichen Änderungen', 'File history filters for actual changes'],
      [
        'Der Graph enthält alle Commits. Der Verlauf einer Datei enthält nur Commits, die diese Datei verändern. Wir vergleichen README, Quelltext und Lizenz, deren Geschichte unterschiedlich lang ist.',
        'The graph contains all commits. A file’s history contains only commits that change that file. We will compare README, source and license files with different histories.',
      ],
      c('open-files'),
      { continue: false, prepare: seed() },
    ),
    s(
      'open-tree',
      ['Öffne Working Directory', 'Open Working Directory'],
      ['Klicke Working Directory, um auch unveränderte Projektdateien zu sehen.', 'Click Working Directory to see unchanged project files too.'],
      c('open-files'),
      { prepare: seed(), completion: element(`${c('open-files')}[aria-pressed="true"]`) },
    ),
    s(
      'open-readme',
      ['Öffne die aktuelle README', 'Open the current README'],
      ['Klicke README.md im Baum. Die Quellenangabe soll Arbeitsdatei lauten.', 'Click README.md in the tree. The source label should say Working file.'],
      row(),
      { prepare: tree(), completion: element(viewer()) },
    ),
    s(
      'history',
      ['Wechsle zum Dateiverlauf', 'Switch to file history'],
      [
        'Klicke History im Datei-Viewer. Dort erscheinen die gespeicherten Änderungen an README.md.',
        'Click History in the file viewer. It lists the saved changes to README.md.',
      ],
      tab('history'),
      { prepare: seed({ file: 'README.md', tab: 'text' }), completion: element(entry(1)) },
    ),
    s(
      'entries',
      ['README wurde in allen vier Commits verändert', 'README changed in all four commits'],
      [
        'Die Liste beginnt mit der jüngsten Änderung und endet bei der ersten Anlage. Jeder Eintrag ist eine Änderung dieser Datei; unveränderte Zwischenstände würden übersprungen.',
        'The list starts with the newest change and ends at the file’s creation. Each entry changed this file; unchanged intermediate commits would be omitted.',
      ],
      `${viewer()} .file-history-panel`,
      { prepare: seed({ file: 'README.md', tab: 'history' }) },
    ),
    s(
      'entry-hash',
      ['Der Hash verbindet Datei- und Projektverlauf', 'The hash connects file and project history'],
      [
        'Diese Kennung ist dieselbe wie im Commit-Graphen. Ein Commit kann mehrere Dateien betreffen, obwohl du ihn hier wegen README.md siehst.',
        'This identifier is the same one used in the commit graph. A commit can affect several files even though it appears here because of README.md.',
      ],
      `${entry(4)} .file-history-entry__hash`,
      { prepare: seed({ file: 'README.md', tab: 'history' }) },
    ),
    s(
      'entry-subject',
      ['Die Nachricht beschreibt den gesamten Commit', 'The message describes the whole commit'],
      [
        'Die Betreffzeile gehört zum Commit und muss nicht jede einzelne Datei aufzählen. Öffne den Eintrag, um die zugehörigen Dateiänderungen zu untersuchen.',
        'The subject belongs to the commit and need not mention every individual file. Open the entry to inspect its associated file changes.',
      ],
      `${entry(4)} .file-history-entry__subject`,
      { prepare: seed({ file: 'README.md', tab: 'history' }) },
    ),
    s(
      'entry-author',
      ['Der Verlauf zeigt den jeweiligen Commit-Autor', 'History shows each commit’s author'],
      [
        'Die ersten beiden Commits stammen von Sam Beispiel, die neueren von Alex Beispiel. Das ist die Autorenschaft der Änderung; Blame ordnet später einzelne heutige Zeilen zu.',
        'Sam Beispiel authored the first two commits and Alex Beispiel the newer ones. This identifies the change’s author; Blame later attributes individual current lines.',
      ],
      `${entry(2)} .file-history-entry__author`,
      { prepare: seed({ file: 'README.md', tab: 'history' }) },
    ),
    s(
      'entry-date',
      ['Zeitangaben ergänzen die Reihenfolge', 'Dates add context to the order'],
      [
        'Die Zeitangabe hilft, Änderungen zeitlich einzuordnen. Der Hash bleibt die eindeutige Kennung des gespeicherten Commits.',
        'The date helps place changes in time. The hash remains the saved commit’s unique identifier.',
      ],
      `${entry(1)} .file-history-entry__date`,
      { prepare: seed({ file: 'README.md', tab: 'history' }) },
    ),
    s(
      'oldest',
      ['Springe zur ersten Anlage der README', 'Jump to the README’s creation'],
      [
        'Klicke den ältesten Verlaufseintrag. Der Datei-Viewer schließt sich und der zugehörige Commit wird im Inspector ausgewählt.',
        'Click the oldest history entry. The file viewer closes and its commit is selected in the inspector.',
      ],
      entry(1),
      { prepare: seed({ file: 'README.md', tab: 'history' }), completion: element(`${panel(1)} ${file()}`) },
    ),
    s(
      'open-old',
      ['Öffne die Datei im ausgewählten Commit', 'Open the file in the selected commit'],
      [
        'Klicke README.md in der Commit-Dateiliste. Der Viewer zeigt nun die beim ersten Commit gespeicherte Version.',
        'Click README.md in the commit file list. The viewer now shows the version saved in the first commit.',
      ],
      `${panel(1)} ${file()}`,
      { prepare: seed({ commit: 1 }), completion: element(viewer(1)) },
    ),
    s(
      'old-text',
      ['Lies den damaligen vollständigen Inhalt', 'Read the full content from that time'],
      [
        'Wechsle zu Text. Im ersten Stand besteht README nur aus der Projektüberschrift.',
        'Switch to Text. In the first state, README contains only the project heading.',
      ],
      tab('text'),
      {
        prepare: seed({ commit: 1, file: 'README.md', tab: 'diff' }),
        completion: element(`${viewer(1)}[data-tab="text"] .cm-content[contenteditable="false"]`),
      },
    ),
    s(
      'old-source',
      ['Ein historischer Stand verändert die Arbeitsdatei nicht', 'A historical view does not change the working file'],
      [
        'Die Quelle nennt den ersten Commit und schreibgeschützt. Die aktuelle Arbeitsdatei enthält weiterhin Begrüßung und Status. Zum Betrachten war kein Checkout nötig.',
        'The source names the first commit and says read-only. The current working file still contains the greeting and status. Viewing it required no checkout.',
      ],
      c('file-source'),
      { prepare: seed({ commit: 1, file: 'README.md', tab: 'text' }) },
    ),
    s(
      'past-history',
      ['Öffne den Verlauf dieses historischen Standes', 'Open this historical state’s history'],
      [
        'Klicke History im Viewer. Von diesem ersten Commit aus gibt es nur seinen eigenen, ältesten Eintrag: Die späteren Änderungen liegen nach dem gewählten Stand.',
        'Click History in the viewer. From this first commit there is only its own oldest entry: later changes are after the selected state.',
      ],
      tab('history'),
      {
        prepare: seed({ commit: 1, file: 'README.md', tab: 'text' }),
        completion: element(list(1)),
      },
    ),
    s(
      'history-scope',
      ['Der Viewer blickt vom gewählten Stand zurück', 'The viewer looks back from the selected state'],
      [
        'Die Verlaufsliste in der Mitte beginnt beim geöffneten Commit. Sie erklärt dessen Vorgeschichte. Die rechte Dateihistorie bietet zusätzlich die späteren Änderungen dieser Datei an.',
        'The center history list starts at the opened commit. It explains that state’s past. The file history on the right also offers this file’s later changes.',
      ],
      `${viewer(1)} .file-history-panel`,
      { prepare: seed({ commit: 1, file: 'README.md', tab: 'history' }) },
    ),
    s(
      'future-history',
      ['Rechts siehst du die vollständige Dateihistorie', 'The right pane shows the complete file history'],
      [
        'Rechts stehen auch die drei späteren README-Änderungen. Der ausgewählte erste Commit ist markiert. Du kannst von hier gezielt zu einem anderen Änderungsstand derselben Datei wechseln.',
        'The right pane also includes the three later README changes. The selected first commit is marked. From here you can switch to another change of the same file.',
      ],
      `${panel(1)} .file-history-panel`,
      { prepare: seed({ commit: 1, file: 'README.md', tab: 'history', sideTab: 'history' }) },
    ),
    s(
      'next-version',
      ['Öffne die zweite README-Version', 'Open the second README version'],
      [
        'Klicke rechts den zweiten Commit von unten, die App-Anlage. Der Inspector und der Datei-Diff sollen gemeinsam auf diesen Stand wechseln.',
        'In the right pane, click the second commit from the bottom, which adds the app. The inspector and file diff should both switch to that state.',
      ],
      entry(2, panel(1)),
      { prepare: seed({ commit: 1, file: 'README.md', tab: 'history', sideTab: 'history' }), completion: element(`${viewer(2)}[data-tab="diff"]`) },
    ),
    s(
      'second-text',
      ['Lies die ergänzte Projektbeschreibung', 'Read the added project description'],
      [
        'Wechsle zu Text. Nach der Überschrift steht jetzt eine kurze Beschreibung des Beispielprojekts. Die späteren Begrüßungszeilen fehlen in diesem historischen Stand noch.',
        'Switch to Text. A short description of the example project now follows the heading. The later greeting lines are not part of this historical state yet.',
      ],
      tab('text'),
      { prepare: seed({ commit: 2, file: 'README.md', tab: 'diff' }), completion: element(`${viewer(2)}[data-tab="text"] .cm-content`) },
    ),
    s(
      'close-old',
      ['Kehre zur aktuellen Projektansicht zurück', 'Return to the current project view'],
      [
        'Schließe den Viewer. Danach öffnen wir eine Datei, die nicht in jedem Commit geändert wurde.',
        'Close the viewer. Next we will open a file that did not change in every commit.',
      ],
      c('close-file'),
      { prepare: seed({ commit: 2, file: 'README.md', tab: 'text' }), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'code-folder',
      ['Öffne den Quelltextordner', 'Expand the source folder'],
      ['Öffne src im Working Directory. Darunter erscheint app.ts.', 'Expand src in Working Directory. app.ts appears underneath.'],
      row('src'),
      { prepare: tree(), completion: element(row('src/app.ts')) },
    ),
    s(
      'code-file',
      ['Öffne app.ts', 'Open app.ts'],
      [
        'Klicke app.ts. Wir prüfen jetzt den Verlauf des Quelltexts statt der README.',
        'Click app.ts. We will now inspect source history instead of README history.',
      ],
      row('src/app.ts'),
      { prepare: tree('src'), completion: element(viewer('unstaged', 'src/app.ts')) },
    ),
    s(
      'code-history',
      ['Zeige nur die Quelltextänderungen', 'Show only source changes'],
      [
        'Klicke History. Es sollen zwei Commits erscheinen: die Anlage der App und die spätere Begrüßungsänderung.',
        'Click History. Two commits should appear: adding the app and later changing its greeting.',
      ],
      tab('history'),
      {
        prepare: seed({ file: 'src/app.ts', tab: 'text' }),
        completion: element(list(4, 2)),
      },
    ),
    s(
      'omitted',
      ['Unveränderte Dateien erzeugen keinen Verlaufseintrag', 'Unchanged files do not produce history entries'],
      [
        'Der Dokumentations-Commit fehlt hier, weil er app.ts nicht verändert. Der Dateiverlauf ist deshalb kürzer als der gesamte Graph, obwohl beide zum selben Repository gehören.',
        'The documentation commit is absent because it does not change app.ts. File history is therefore shorter than the full graph even though both belong to the same repository.',
      ],
      `${viewer('unstaged', 'src/app.ts')} .file-history-panel`,
      { prepare: seed({ file: 'src/app.ts', tab: 'history' }) },
    ),
    s(
      'close-code',
      ['Schließe den Quelltext', 'Close the source file'],
      ['Schließe den Viewer, um die Lizenz auszuwählen.', 'Close the viewer to select the license.'],
      c('close-file'),
      { prepare: seed({ file: 'src/app.ts', tab: 'history' }), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'license',
      ['Öffne die unveränderte Lizenz', 'Open the unchanged license'],
      ['Klicke LICENSE im Working Directory.', 'Click LICENSE in Working Directory.'],
      row('LICENSE'),
      { prepare: tree(), completion: element(viewer('unstaged', 'LICENSE')) },
    ),
    s(
      'license-history',
      ['Prüfe die einzige Lizenzänderung', 'Inspect the only license change'],
      [
        'Klicke History. Die Lizenz wurde nur im ersten Commit angelegt und danach nicht mehr verändert.',
        'Click History. The license was created in the first commit and never changed afterward.',
      ],
      tab('history'),
      { prepare: seed({ file: 'LICENSE', tab: 'text' }), completion: element(list(1)) },
    ),
    s(
      'close-license',
      ['Schließe den Dateiverlauf', 'Close file history'],
      ['Schließe den Viewer. Alle betrachteten Arbeitsdateien bleiben unverändert.', 'Close the viewer. All working files you inspected remain unchanged.'],
      c('close-file'),
      { prepare: seed({ file: 'LICENSE', tab: 'history' }), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'finish',
      ['Eine Datei kann mehrere Autoren und wenige Änderungen haben', 'A file can have several authors and few changes'],
      [
        'Du hast vier README-, zwei Quelltext- und eine Lizenzänderung verglichen. Du kannst historische Inhalte lesen und vom Dateiverlauf zum richtigen Commit wechseln. Blame erklärt als Nächstes die Herkunft einzelner Zeilen.',
        'You compared four README changes, two source changes and one license change. You can read historical contents and navigate from file history to the right commit. Blame next explains the origin of individual lines.',
      ],
      '[data-tutorial="graph"]',
      { prepare: seed() },
    ),
  ],
};
