import { withTextViewSteps } from './fileTextViewSteps';
import type { TutorialChapter } from './types';
import { fileStep as s, fileControl as c, fileRow as row, fileTab as tab, fileRecipe as seed, fileViewer, editor, element } from './fileLessonHelpers';
const code = { click: [row('src'), row('src/app.ts')] };

export const TUTORIAL_FILES_NAVIGATION: TutorialChapter = {
  id: 'files-navigation',
  section: 'repo',
  title: ['Projektdateien öffnen und Ansichten wechseln', 'Open project files and switch views'],
  description: [
    'Vom Staging zum Datei-Baum, Ordner öffnen, Quelltext lesen und Text/Diff unterscheiden.',
    'Move from Staging to the file tree, expand folders, read source and distinguish Text from Diff.',
  ],
  question: ['Wie öffne ich die Dateien meines Projekts?', 'How do I open my project files?'],
  keywords: 'dateien files working directory baum tree ordner folder editor text diff öffnen navigation',
  steps: [
    s(
      'overview',
      ['Die Dateiansicht zeigt auch unveränderte Dateien', 'The file view includes unchanged files'],
      [
        'Staging konzentriert sich auf Änderungen. Working Directory zeigt den Projektbaum mit allen Beispieldateien. Das frische Beispiel ist sauber; wir üben zuerst nur die Navigation.',
        'Staging focuses on changes. Working Directory shows the project tree with all sample files. This fresh example is clean; first we practice navigation only.',
      ],
      c('open-files'),
      { continue: false, openView: undefined },
    ),
    s(
      'open-tree',
      ['Wechsle zu Working Directory', 'Switch to Working Directory'],
      [
        'Klicke Working Directory im rechten Bereich. Damit wechselst du die Dateiliste; das Repository und seine Inhalte bleiben dieselben.',
        'Click Working Directory in the right pane. This changes the file list; the repository and its contents remain the same.',
      ],
      c('open-files'),
      { openView: undefined, completion: element(`${c('open-files')}[aria-pressed="true"]`) },
    ),
    s(
      'tree',
      ['Ordner und Dateien bilden die Projektstruktur', 'Folders and files form the project structure'],
      [
        'README.md beschreibt das Projekt, package.json seine Paketkonfiguration und src enthält Quelltext. Anders als im Staging sind diese Dateien auch ohne Änderungen sichtbar.',
        'README.md describes the project, package.json contains its package configuration and src holds source code. Unlike Staging, these files are visible even without edits.',
      ],
      row('src'),
    ),
    s(
      'expand',
      ['Öffne den Ordner src', 'Expand the src folder'],
      [
        'Klicke src. Darunter soll app.ts erscheinen. Der Ordnerklick öffnet seinen Inhalt und verändert keine Datei.',
        'Click src. app.ts should appear beneath it. Expanding a folder reveals its contents without changing a file.',
      ],
      row('src'),
      { completion: element(row('src/app.ts')) },
    ),
    s(
      'open-code',
      ['Öffne app.ts', 'Open app.ts'],
      [
        'Klicke app.ts unter src. Der Datei-Viewer öffnet den aktuellen Quelltext im mittleren Bereich.',
        'Click app.ts under src. The file viewer opens its current source text in the middle pane.',
      ],
      row('src/app.ts'),
      { prepare: { click: [row('src')] }, completion: element('.file-viewer[data-path="src/app.ts"][data-tab="text"]') },
    ),
    s(
      'source',
      ['Die Quellenangabe nennt die bearbeitete Version', 'The source label identifies the version'],
      [
        'Oben steht Arbeitsdatei. Du liest die aktuelle Datei aus dem Arbeitsordner, nicht automatisch einen Commit oder den Index. Diese Unterscheidung wird beim Speichern wichtig.',
        'The header says Working file. You are reading the current worktree file, rather than automatically reading a commit or the index. This distinction matters when saving.',
      ],
      c('file-source'),
      { prepare: code },
    ),
    s(
      'tabs',
      ['Ansichten beantworten verschiedene Fragen', 'Views answer different questions'],
      [
        'Text zeigt den Inhalt; Diff zeigt Änderungen gegenüber der passenden Git-Basis. History und Blame untersuchen frühere Änderungen und die Herkunft von Zeilen. Die späteren Lektionen behandeln diese Ansichten einzeln.',
        'Text shows contents; Diff shows changes against the appropriate Git base. History and Blame investigate earlier changes and line origins. Later lessons cover those views individually.',
      ],
      '.file-viewer-tabs',
      { prepare: code },
    ),
    s(
      'close-code',
      ['Schließe die Quelltextansicht', 'Close the source view'],
      [
        'Klicke das X des Datei-Viewers. Das schließt die Ansicht und löscht keine Datei.',
        'Click the file viewer’s X. This closes the view without deleting the file.',
      ],
      c('close-file'),
      { prepare: code, completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'collapse',
      ['Klappe src wieder zu', 'Collapse src again'],
      [
        'Klicke src erneut. app.ts wird im Baum ausgeblendet, bleibt aber im Repository vorhanden.',
        'Click src again. app.ts is hidden in the tree but remains in the repository.',
      ],
      row('src'),
      { prepare: { click: [row('src')] }, completion: element(`${row('src')}[aria-expanded="false"]`) },
    ),
    s(
      'open-readme',
      ['Öffne jetzt README.md', 'Open README.md now'],
      [
        'Klicke README.md im Projektbaum. Wir vergleichen gleich die Ansichten Text und Diff einer unveränderten Datei.',
        'Click README.md in the tree. Next we compare Text and Diff for an unchanged file.',
      ],
      row(),
      { completion: element(`${fileViewer}[data-tab="text"]`) },
    ),
    s(
      'text',
      ['Text zeigt Inhalt unabhängig vom Änderungsstatus', 'Text shows contents regardless of change status'],
      [
        'Die Statuszeile gehört zum normalen Dateiinhalt. Auch eine unveränderte Datei kann gelesen und bearbeitet werden. Ein leerer Diff bedeutet deshalb nicht, dass die Datei leer ist.',
        'The status line is ordinary file content. An unchanged file can still be read and edited. An empty diff therefore does not mean an empty file.',
      ],
      editor,
      { prepare: seed() },
    ),
    s(
      'open-diff',
      ['Öffne die Diffansicht', 'Open Diff'],
      [
        'Klicke Diff. Da Arbeitsdatei und Index übereinstimmen, sollen keine Unterschiede erscheinen.',
        'Click Diff. Since worktree and index match, no differences should appear.',
      ],
      tab('diff'),
      { prepare: seed(), completion: element(`${fileViewer}[data-tab="diff"] .diff-empty-state`) },
    ),
    s(
      'return-text',
      ['Kehre zu Text zurück', 'Return to Text'],
      [
        'Klicke Text. Der Dateiinhalt ist weiterhin vorhanden; das Wechseln der Ansicht hat ihn nicht verändert.',
        'Click Text. The file contents remain present; changing views did not modify them.',
      ],
      tab('text'),
      { prepare: seed('head', 'head', { click: [row(), tab('diff')] }), completion: element(`${fileViewer}[data-tab="text"] ${editor}`) },
    ),
    s(
      'close-readme',
      ['Schließe die README-Ansicht', 'Close the README view'],
      ['Schließe den Viewer. Im nächsten Schritt kehren wir zur Auswahl von Änderungen zurück.', 'Close the viewer. Next we return to selecting changes.'],
      c('close-file'),
      { prepare: seed(), completion: { kind: 'absent', selector: fileViewer } },
    ),
    s(
      'return-staging',
      ['Wechsle zurück zur Staging Area', 'Return to Staging Area'],
      [
        'Klicke Staging Area neben Working Directory. Der Beispielstand ist weiterhin sauber, weil du nur gelesen und navigiert hast.',
        'Click Staging Area beside Working Directory. The example is still clean because you only read and navigated.',
      ],
      c('open-staging'),
      { completion: element(`${c('open-staging')}[aria-pressed="true"]`) },
    ),
    s(
      'finish',
      ['Du kennst den Weg zu den Projektdateien', 'You know the route to project files'],
      [
        'Du hast Ordner aufgeklappt, Dateien geöffnet und Text von Diff unterschieden. Die nächste Lektion führt durch eine tatsächliche Bearbeitung, Speichern und den Tastaturkurzbefehl.',
        'You expanded folders, opened files and distinguished Text from Diff. The next lesson walks through an actual edit, saving and the keyboard shortcut.',
      ],
      c('staging'),
      { openView: undefined, inspector: 'staging' },
    ),
  ].flatMap(withTextViewSteps({ 'open-readme': 'README.md' })),
};
