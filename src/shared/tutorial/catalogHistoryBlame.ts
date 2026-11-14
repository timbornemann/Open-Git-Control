import { withTextViewSteps } from './fileTextViewSteps';
import type { TutorialChapter } from './types';
import {
  historyStep as s,
  historyRecipe as seed,
  historyTreeRecipe as tree,
  historyContent as content,
  historyEntry as entry,
  blameLine as line,
  commitPanel as panel,
  commitFile as file,
  historyViewer as viewer,
  fileTab as tab,
  fileRow as row,
  editor,
  c,
  element,
} from './historyLessonHelpers';
export const TUTORIAL_HISTORY_BLAME: TutorialChapter = {
  id: 'history-blame',
  section: 'repo',
  title: ['Die Herkunft einzelner Zeilen mit Blame verstehen', 'Understand line origins with Blame'],
  description: [
    'Zeilenursprung, Commit-Navigation und noch nicht committete Arbeitsänderungen praktisch untersuchen.',
    'Explore line origins, commit navigation and uncommitted working changes.',
  ],
  question: ['Wer hat eine Zeile zuletzt geändert und in welchem Commit?', 'Who last changed a line, and in which commit?'],
  keywords: 'blame zeile line author autor herkunft ursprung uncommitted nicht committet working arbeitsdatei',
  steps: [
    s(
      'overview',
      ['Blame ordnet die heute sichtbaren Zeilen zu', 'Blame attributes the lines visible today'],
      [
        'Der Dateiverlauf listet Änderungen an der ganzen Datei. Blame zeigt für jede aktuelle Zeile den Commit ihrer letzten Änderung. So können Zeilen derselben Datei aus verschiedenen Commits stammen.',
        'File history lists changes to the whole file. Blame shows the commit that last changed each current line. Lines in one file can therefore come from different commits.',
      ],
      c('open-files'),
      { continue: false, prepare: seed() },
    ),
    s(
      'open-tree',
      ['Öffne Working Directory', 'Open Working Directory'],
      ['Klicke Working Directory, um README.md zu öffnen.', 'Click Working Directory so you can open README.md.'],
      c('open-files'),
      { prepare: seed(), completion: element(`${c('open-files')}[aria-pressed="true"]`) },
    ),
    s(
      'open-file',
      ['Öffne die Arbeitsdatei', 'Open the working file'],
      [
        'Klicke README.md im Baum. Sie enthält Überschrift, Leerzeile, Begrüßung und Status.',
        'Click README.md in the tree. It contains a heading, blank line, greeting and status.',
      ],
      row(),
      { prepare: tree(), completion: element(viewer()) },
    ),
    s(
      'blame',
      ['Wechsle zu Blame', 'Switch to Blame'],
      [
        'Klicke Blame. Jede Dateizeile bekommt eine Zeilennummer, Commit-Kennung und ihren Inhalt.',
        'Click Blame. Each file line receives a line number, commit identifier and its content.',
      ],
      tab('blame'),
      { prepare: seed({ file: 'README.md', tab: 'text' }), completion: element(line(4, 4)) },
    ),
    s(
      'line-number',
      ['Die linke Nummer gehört zur geöffneten Datei', 'The left number belongs to the opened file'],
      [
        'Die Zahl 1 bezeichnet die erste Zeile dieser Dateiversion. Sie ist keine Commit-Nummer und kann sich verschieben, wenn später Zeilen eingefügt werden.',
        'The number 1 identifies the first line of this file version. It is not a commit number and can move when lines are inserted later.',
      ],
      `${line(1, 1)} .file-blame-line__number`,
      { prepare: seed({ file: 'README.md', tab: 'blame' }) },
    ),
    s(
      'origin-hash',
      ['Die Kennung zeigt die letzte Änderung dieser Zeile', 'The identifier shows this line’s last change'],
      [
        'Die Überschrift stammt noch aus dem ersten Commit. Obwohl die gesamte Datei später mehrfach geändert wurde, blieb diese Zeile unverändert.',
        'The heading still comes from the first commit. Although the whole file changed several times later, this line stayed unchanged.',
      ],
      `${line(1, 1)} .file-blame-line__commit`,
      { prepare: seed({ file: 'README.md', tab: 'blame' }) },
    ),
    s(
      'line-content',
      ['Der Text gehört zur aktuellen Quelle', 'The text belongs to the current source'],
      [
        'Rechts steht der Inhalt der geöffneten Arbeitsdatei. Blame zeigt keine Liste aller früheren Texte dieser Zeile; dafür öffnest du den zugehörigen Commit oder den Dateiverlauf.',
        'The right side shows content from the opened working file. Blame does not list every earlier text of that line; open the associated commit or file history for that.',
      ],
      `${line(3, 4)} .file-blame-line__content`,
      { prepare: seed({ file: 'README.md', tab: 'blame' }) },
    ),
    s(
      'blank-line',
      ['Auch Leerzeilen haben eine Geschichte', 'Blank lines have history too'],
      [
        'Die Leerzeile wurde im zweiten Commit eingefügt. Sie trägt daher dessen Kennung, während die Überschrift weiter dem ersten Commit zugeordnet ist.',
        'The blank line was inserted in the second commit. It carries that identifier while the heading remains attributed to the first commit.',
      ],
      line(2, 2),
      { prepare: seed({ file: 'README.md', tab: 'blame' }) },
    ),
    s(
      'new-lines',
      ['Begrüßung und Status stammen aus dem neuesten Commit', 'The greeting and status come from the newest commit'],
      [
        'Diese beiden Zeilen wurden zuletzt im vierten Commit geändert. Die Datei hat also mehrere Zeilenursprünge. Blame ist eine technische Änderungszuordnung und erklärt allein noch keine Absicht.',
        'These two lines were last changed in the fourth commit. The file therefore has several line origins. Blame attributes technical changes and alone does not explain intent.',
      ],
      line(4, 4),
      { prepare: seed({ file: 'README.md', tab: 'blame' }) },
    ),
    s(
      'open-origin',
      ['Öffne den Ursprung der Überschrift', 'Open the heading’s origin'],
      [
        'Klicke die Commit-Kennung neben Zeile 1. Der zugehörige erste Commit öffnet sich im Inspector.',
        'Click the commit identifier beside line 1. Its first commit opens in the inspector.',
      ],
      `${line(1, 1)} .file-blame-line__commit`,
      { prepare: seed({ file: 'README.md', tab: 'blame' }), completion: element(`${panel(1)} ${file()}`) },
    ),
    s(
      'open-origin-file',
      ['Öffne README im Ursprungscommit', 'Open README in its origin commit'],
      [
        'Klicke README.md in der Commit-Dateiliste. Der Diff zeigt die erste Anlage der Überschrift.',
        'Click README.md in the commit file list. Its diff shows the heading being created.',
      ],
      `${panel(1)} ${file()}`,
      { prepare: seed({ commit: 1 }), completion: element(`${viewer(1)} .file-viewer-diff .add .diff-code`) },
    ),
    s(
      'origin-text',
      ['Lies den tatsächlichen ursprünglichen Inhalt', 'Read the actual original content'],
      [
        'Wechsle zu Text. Die ursprüngliche README hat nur die Überschrift; Begrüßung und Status gehören erst zu späteren Commits.',
        'Switch to Text. The original README has only the heading; the greeting and status belong to later commits.',
      ],
      tab('text'),
      { prepare: seed({ commit: 1, file: 'README.md', tab: 'diff' }), completion: element(`${viewer(1)}[data-tab="text"] .cm-content`) },
    ),
    s(
      'close-origin',
      ['Kehre zum Projekt zurück', 'Return to the project'],
      [
        'Schließe den historischen Viewer. Nun ändern wir eine Arbeitszeile und prüfen ihre neue Zuordnung.',
        'Close the historical viewer. Next we will change a working line and inspect its new attribution.',
      ],
      c('close-file'),
      { prepare: seed({ commit: 1, file: 'README.md', tab: 'text' }), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'working-file',
      ['Öffne erneut die aktuelle Arbeitsdatei', 'Reopen the current working file'],
      [
        'Klicke README.md im Working Directory. Die Quelle lautet wieder Arbeitsdatei.',
        'Click README.md in Working Directory. The source is Working file again.',
      ],
      row(),
      { prepare: tree(), completion: element(viewer()) },
    ),
    s(
      'edit',
      ['Ändere nur die Begrüßung', 'Change only the greeting'],
      [
        'Ersetze Hallo Welt! durch Hallo Team! in der Begrüßung. Überschrift, Leerzeile und Status sollen gleich bleiben. Noch ist dies nur ein Editorentwurf.',
        'Replace Hello world! with Hello team! in the greeting. Keep the heading, blank line and status unchanged. This is still only an editor draft.',
      ],
      editor,
      { prepare: seed({ file: 'README.md', tab: 'text' }), completion: { kind: 'value', selector: editor, value: content('work') } },
    ),
    s(
      'save',
      ['Speichere die Arbeitsänderung', 'Save the working change'],
      [
        'Klicke Arbeitsdatei speichern. Blame liest die gespeicherte Datei; ein ungespeicherter Entwurf erzeugt noch keinen neuen gespeicherten Zeilenstand.',
        'Click Save working file. Blame reads the saved file; an unsaved draft does not yet create a new saved line state.',
      ],
      c('save-file'),
      {
        prepare: seed({ file: 'README.md', tab: 'text', draft: 'work' }),
        completion: {
          kind: 'all',
          conditions: [
            element(`${viewer()}[data-dirty="false"]`),
            {
              kind: 'working-tree',
              staged: [],
              unstaged: ['README.md'],
              untracked: [],
              content: [
                { path: 'README.md', source: 'worktree', value: content('work') },
                { path: 'README.md', source: 'head', value: content('latest') },
              ],
            },
          ],
        },
      },
    ),
    s(
      'working-blame',
      ['Prüfe Blame nach dem Speichern', 'Inspect Blame after saving'],
      [
        'Klicke Blame. Die geänderte dritte Zeile soll jetzt als noch nicht committet erscheinen.',
        'Click Blame. The changed third line should now appear as not committed yet.',
      ],
      tab('blame'),
      { prepare: seed({ file: 'README.md', tab: 'text', work: 'work' }), completion: element(line(3, 0)) },
    ),
    s(
      'uncommitted',
      ['Die Arbeitsänderung hat noch keinen Commit', 'The working change has no commit yet'],
      [
        'Die dritte Zeile trägt keine anklickbare Commit-Kennung. Noch nicht committet bedeutet: Dieser gespeicherte Arbeitsinhalt ist noch keinem Commit zugeordnet. Speichern und Committen sind verschiedene Aktionen.',
        'The third line has no clickable commit identifier. Not committed yet means this saved working content has not been assigned to a commit. Saving and committing are different actions.',
      ],
      `${line(3, 0)} .file-blame-line__commit`,
      { prepare: seed({ file: 'README.md', tab: 'blame', work: 'work' }) },
    ),
    s(
      'preserved-origin',
      ['Unveränderte Zeilen behalten ihren Ursprung', 'Unchanged lines retain their origin'],
      [
        'Der Status in Zeile 4 bleibt dem vierten Commit zugeordnet; die Überschrift weiterhin dem ersten. Eine einzelne Arbeitsänderung macht nicht die ganze Datei zu neuem Inhalt.',
        'The status on line 4 stays attributed to the fourth commit and the heading to the first. One working edit does not make the entire file new content.',
      ],
      line(4, 4),
      { prepare: seed({ file: 'README.md', tab: 'blame', work: 'work' }) },
    ),
    s(
      'history-after-save',
      ['Vergleiche den gespeicherten Commit-Verlauf', 'Compare the saved commit history'],
      [
        'Klicke History. Es bleiben vier Commits: Die gespeicherte Arbeitsänderung hat keinen fünften Commit erzeugt.',
        'Click History. There are still four commits: saving the working change did not create a fifth commit.',
      ],
      tab('history'),
      { prepare: seed({ file: 'README.md', tab: 'blame', work: 'work' }), completion: element(entry(4)) },
    ),
    s(
      'close-file',
      ['Schließe den Viewer', 'Close the viewer'],
      [
        'Schließe die Datei. Die Übungsänderung liegt nur in der simulierten Arbeitskopie.',
        'Close the file. The practice change exists only in the simulated working copy.',
      ],
      c('close-file'),
      { prepare: seed({ file: 'README.md', tab: 'history', work: 'work' }), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'finish',
      ['Blame verbindet Zeile, Quelle und Commit', 'Blame connects a line, its source and its commit'],
      [
        'Du hast mehrere Zeilenursprünge verglichen, den ursprünglichen Commit geöffnet und eine noch nicht committete Zeile erzeugt. Prüfe bei jeder Blame-Ansicht zuerst die Quelle: Arbeitsdatei, Index oder historischer Commit.',
        'You compared several line origins, opened the original commit and created an uncommitted line. In every Blame view, first check the source: working file, index or historical commit.',
      ],
      '[data-tutorial="graph"]',
      { prepare: seed() },
    ),
  ].flatMap(withTextViewSteps({ 'working-file': 'README.md' })),
};
