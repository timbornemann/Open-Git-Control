import type { TutorialChapter, TutorialStep } from './types';
import {
  historyStep as s,
  historyRecipe as recipe,
  historySeed as versions,
  historyTreeRecipe as tree,
  blameLine as line,
  commitPanel as panel,
  commitFile as file,
  graphRow as row,
  historyViewer as viewer,
  fileTab as tab,
  fileRow,
  c,
  element,
} from './historyLessonHelpers';
const seed = (options: Parameters<typeof recipe>[0] = {}) => recipe({ ...options, work: 'work', index: 'index' });
const data = () => versions('work', 'index');
const side = panel(4);
const origin = `${line(1, 1, side)} .file-blame-line__commit`;
const back = (): TutorialStep['prepare'] => {
  const base = seed({ commit: 4, file: 'README.md', tab: 'blame', sideTab: 'blame' });
  return { ...base, actions: [...base.actions!, { click: origin }, { waitFor: viewer(1) }], ready: `${viewer(1)}[data-tab="diff"]` };
};
const stagedFile = `${c('staged-files')} .staging-file-row[aria-label="README.md"]`;
export const TUTORIAL_HISTORY_SOURCES: TutorialChapter = {
  id: 'history-sources',
  section: 'repo',
  title: ['Arbeitsdatei, Index und Commit im Verlauf unterscheiden', 'Distinguish working file, index and commit in history'],
  description: [
    'Drei getrennte Datei-Versionen, Blame im Staging, detaillierte Autorenangaben und Inspector-Zurück praktisch vergleichen.',
    'Compare three separate file versions, staged Blame, detailed authorship and inspector Back navigation.',
  ],
  question: ['Warum zeigen Arbeitsdatei, Staging und Commit verschiedene Zeilen?', 'Why do the working file, staging and commit show different lines?'],
  keywords: 'history sources quelle source arbeitsdatei index staged staging commit blame author autor date datum zurück back',
  steps: [
    s(
      'overview',
      ['Eine Datei hat drei getrennte Zustände', 'One file has three separate states'],
      [
        'README ist vorbereitet: Der letzte Commit begrüßt die Welt, der Index das Staging und die Arbeitsdatei das Team. Deshalb steht dieselbe Datei in Staged und Unstaged. Wir lesen jede Quelle getrennt.',
        'README is prepared: the last commit greets the world, the index greets staging and the working file greets the team. The same file therefore appears in Staged and Unstaged. We will read each source separately.',
      ],
      c('staging'),
      { continue: false, prepare: data() },
    ),
    s(
      'open-tree',
      ['Öffne den Baum für die Arbeitsdatei', 'Open the tree for the working file'],
      ['Klicke Working Directory. Der Baum öffnet die gespeicherte Arbeitsdatei.', 'Click Working Directory. The tree opens the saved working file.'],
      c('open-files'),
      { prepare: data(), completion: element(`${c('open-files')}[aria-pressed="true"]`) },
    ),
    s(
      'open-working',
      ['Öffne die Team-Begrüßung', 'Open the team greeting'],
      ['Klicke README.md. Im Text soll Hallo Team! stehen.', 'Click README.md. The text should contain Hello team!.'],
      fileRow(),
      { prepare: { ...tree(), ...data() }, completion: element(viewer()) },
    ),
    s(
      'working-source',
      ['Die Quellenangabe lautet Arbeitsdatei', 'The source label says Working file'],
      [
        'Dies ist der gespeicherte Inhalt des Arbeitsverzeichnisses. Er kann vom bereits vorgemerkten Inhalt abweichen. Der Viewer zeigt nicht automatisch den nächsten Commit-Inhalt.',
        'This is the saved working-directory content. It can differ from what is already staged. The viewer does not automatically show the next commit’s contents.',
      ],
      c('file-source'),
      { prepare: seed({ file: 'README.md', tab: 'text' }) },
    ),
    s(
      'working-blame',
      ['Prüfe die Arbeitsänderung in Blame', 'Inspect the working change in Blame'],
      ['Klicke Blame. Die Team-Begrüßung wurde noch nicht committet.', 'Click Blame. The team greeting has not been committed yet.'],
      tab('blame'),
      { prepare: seed({ file: 'README.md', tab: 'text' }), completion: element(line(3, 0)) },
    ),
    s(
      'working-content',
      ['Blame liest hier die Team-Zeile', 'Blame reads the team line here'],
      [
        'Die Zeile mit Hallo Team! gehört nur zur Arbeitsdatei. Der Status darunter bleibt dem gespeicherten vierten Commit zugeordnet.',
        'The Hello team! line belongs only to the working file. The status underneath remains attributed to the saved fourth commit.',
      ],
      `${line(3, 0)} .file-blame-line__content`,
      { prepare: seed({ file: 'README.md', tab: 'blame' }) },
    ),
    s(
      'close-working',
      ['Schließe die Arbeitsdatei', 'Close the working file'],
      ['Schließe den Viewer. Danach lesen wir den Index derselben Datei.', 'Close the viewer. Next we will read the same file from the index.'],
      c('close-file'),
      { prepare: seed({ file: 'README.md', tab: 'blame' }), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'open-staging',
      ['Kehre zum Staging zurück', 'Return to Staging'],
      [
        'Klicke Staging Area. README erscheint in beiden Änderungsbereichen, weil Index und Arbeitsdatei voneinander abweichen.',
        'Click Staging Area. README appears in both change sections because its index and working versions differ.',
      ],
      c('open-staging'),
      { prepare: { ...tree(), ...data() }, completion: element(`${c('open-staging')}[aria-pressed="true"]`) },
    ),
    s(
      'open-index',
      ['Wähle README ausdrücklich unter Staged', 'Select README specifically under Staged'],
      [
        'Klicke README.md im Bereich Staged. Damit öffnest du den vorgemerkten Inhalt, nicht die gleichnamige Unstaged-Zeile.',
        'Click README.md under Staged. This opens the indexed content, not the identically named Unstaged row.',
      ],
      stagedFile,
      { prepare: data(), completion: element(viewer('staged')) },
    ),
    s(
      'index-source',
      ['Der Index ist der vorgemerkte Dateiinhalt', 'The index is the staged file content'],
      [
        'Die Quellenangabe lautet Git-Index · Staging. Ein neuer Commit würde diesen vorgemerkten Inhalt übernehmen. Die spätere Team-Arbeitsänderung ist darin noch nicht enthalten.',
        'The source label says Git index · Staging. A new commit would include this staged content. The later team working change is not included yet.',
      ],
      c('file-source'),
      { prepare: seed({ file: 'README.md', source: 'staged', tab: 'diff' }) },
    ),
    s(
      'index-text',
      ['Lies die vorgemerkte Staging-Begrüßung', 'Read the indexed staging greeting'],
      [
        'Wechsle zu Text. Hier soll Hallo Staging! stehen; die Arbeitsdatei enthält weiterhin Hallo Team!.',
        'Switch to Text. This version should say Hello staging!; the working file still contains Hello team!.',
      ],
      tab('text'),
      { prepare: seed({ file: 'README.md', source: 'staged', tab: 'diff' }), completion: element(`${viewer('staged')}[data-tab="text"] .cm-content`) },
    ),
    s(
      'index-blame',
      ['Öffne Blame für den Index', 'Open Blame for the index'],
      [
        'Klicke Blame. Auch die vorgemerkte dritte Zeile ist noch keinem Commit zugeordnet. Stagen ist noch kein Commit.',
        'Click Blame. The staged third line is also not assigned to a commit yet. Staging is not committing.',
      ],
      tab('blame'),
      { prepare: seed({ file: 'README.md', source: 'staged', tab: 'text' }), completion: element(line(3, 0, viewer('staged'))) },
    ),
    s(
      'index-content',
      ['Dieselbe Zeilennummer kann andere Inhalte haben', 'The same line number can contain different text'],
      [
        'Hier ist die noch nicht committete Zeile Hallo Staging!. Vorher war es in der Arbeitsdatei Hallo Team!. Prüfe deshalb immer Quelle und Inhalt gemeinsam.',
        'Here the uncommitted line is Hello staging!. In the working file it was Hello team!. Always check both source and content.',
      ],
      `${line(3, 0)} .file-blame-line__content`,
      { prepare: seed({ file: 'README.md', source: 'staged', tab: 'blame' }) },
    ),
    s(
      'close-index',
      ['Schließe den Index-Viewer', 'Close the index viewer'],
      [
        'Schließe den Viewer. Jetzt öffnen wir den letzten tatsächlich gespeicherten Commit.',
        'Close the viewer. Next we will open the last actual saved commit.',
      ],
      c('close-file'),
      { prepare: seed({ file: 'README.md', source: 'staged', tab: 'blame' }), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'select-commit',
      ['Wähle den neuesten gespeicherten Commit', 'Select the newest saved commit'],
      ['Klicke den Betreff des neuesten Commits im Graphen.', 'Click the newest commit’s subject in the graph.'],
      `${row(4)} .commit-subject`,
      { prepare: data(), completion: element(`${panel(4)} ${file()}`) },
    ),
    s(
      'open-commit-file',
      ['Öffne dessen README', 'Open its README'],
      [
        'Klicke README.md in der Commit-Dateiliste. Diese Version begrüßt noch die Welt.',
        'Click README.md in the commit file list. This version still greets the world.',
      ],
      `${panel(4)} ${file()}`,
      { prepare: seed({ commit: 4 }), completion: element(viewer(4)) },
    ),
    s(
      'commit-blame',
      ['Prüfe die gespeicherten Zeilenursprünge', 'Inspect the saved line origins'],
      [
        'Klicke Blame im Viewer. Die dritte Zeile gehört im Commit zum vierten Commit und trägt eine echte Kennung. Arbeits- und Indexänderungen verändern diesen gespeicherten Stand nicht.',
        'Click Blame in the viewer. In the commit, the third line belongs to the fourth commit and has a real identifier. Working and index changes do not alter this saved state.',
      ],
      tab('blame'),
      { prepare: seed({ commit: 4, file: 'README.md', tab: 'diff' }), completion: element(line(3, 4)) },
    ),
    s(
      'detailed',
      ['Öffne die ausführliche Blame-Ansicht rechts', 'Open detailed Blame on the right'],
      [
        'Klicke rechts in den Dateidetails auf Blame. Dort werden zusätzlich Autor und Datum zu den einzelnen Zeilen angezeigt.',
        'Click Blame in the file details on the right. It also shows the author and date for each line.',
      ],
      `${side} [data-detail-tab="blame"]`,
      {
        prepare: seed({ commit: 4, file: 'README.md', tab: 'blame', sideTab: 'history' }),
        completion: element(`${line(1, 1, side)} .file-blame-line__author`),
      },
    ),
    s(
      'author',
      ['Die Autorenangabe gehört zur letzten Zeilenänderung', 'The author belongs to the last line change'],
      [
        'Die unveränderte Überschrift stammt von Sam Beispiel. Die Begrüßung stammt von Alex Beispiel. Eine spätere Dateiänderung ersetzt nicht die Autorenzuordnung aller übrigen Zeilen.',
        'The unchanged heading comes from Sam Beispiel. The greeting comes from Alex Beispiel. A later file change does not replace authorship for every other line.',
      ],
      `${line(1, 1, side)} .file-blame-line__author`,
      { prepare: seed({ commit: 4, file: 'README.md', tab: 'blame', sideTab: 'blame' }) },
    ),
    s(
      'date',
      ['Das Datum gehört zum Ursprungscommit der Zeile', 'The date belongs to the line’s origin commit'],
      [
        'Dieses Datum stammt vom ersten Commit, obwohl du den vierten Dateistand geöffnet hast. Die Herkunftsmetadaten beschreiben die letzte Änderung der jeweiligen Zeile.',
        'This date comes from the first commit even though you opened the fourth file state. Origin metadata describes the last change to each individual line.',
      ],
      `${line(1, 1, side)} .file-blame-line__date`,
      { prepare: seed({ commit: 4, file: 'README.md', tab: 'blame', sideTab: 'blame' }) },
    ),
    s(
      'origin',
      ['Springe rechts zum Ursprung der Überschrift', 'Jump to the heading’s origin on the right'],
      [
        'Klicke rechts die Commit-Kennung neben Zeile 1. Der Inspector öffnet dieselbe Datei im ersten Commit und merkt sich den vorherigen Vergleich.',
        'In the right pane, click the commit identifier beside line 1. The inspector opens the same file in the first commit and remembers the previous comparison.',
      ],
      origin,
      { prepare: seed({ commit: 4, file: 'README.md', tab: 'blame', sideTab: 'blame' }), completion: element(`${viewer(1)}[data-tab="diff"]`) },
    ),
    s(
      'back-purpose',
      ['Der Inspector hat einen eigenen Rückweg', 'The inspector has its own Back action'],
      [
        'Diese Zurück-Schaltfläche gehört zur Commit-Navigation. Sie führt zum vorher untersuchten Commit und seinem Datei-Vergleich. Die Tutorial-Pfeiltasten wechseln dagegen Erklärungsschritte.',
        'This Back button belongs to commit navigation. It returns to the previously inspected commit and file comparison. The tutorial arrow keys instead change explanation steps.',
      ],
      c('back-inspector'),
      { prepare: back() },
    ),
    s(
      'back',
      ['Stelle den vorherigen Commit-Vergleich wieder her', 'Restore the previous commit comparison'],
      [
        'Klicke Zurück im Inspector. Die README des vierten Commits soll wieder als Diff erscheinen.',
        'Click Back in the inspector. The fourth commit’s README should appear as a diff again.',
      ],
      c('back-inspector'),
      { prepare: back(), completion: element(`${viewer(4)}[data-tab="diff"]`) },
    ),
    s(
      'close-file',
      ['Schließe den historischen Vergleich', 'Close the historical comparison'],
      [
        'Schließe den Viewer. Die vorbereiteten Arbeits- und Indexversionen bleiben getrennt erhalten.',
        'Close the viewer. The prepared working and index versions remain separate.',
      ],
      c('close-file'),
      { prepare: seed({ commit: 4, file: 'README.md', tab: 'diff' }), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'finish',
      ['Quelle prüfen, Zeile zuordnen, gezielt zurückkehren', 'Check the source, attribute the line, return precisely'],
      [
        'Du hast drei unterschiedliche Inhalte derselben Datei gelesen, ihre Blame-Zuordnung verglichen und den Inspector-Rückweg ausprobiert. Keine dieser Leseaktionen hat Arbeitsdatei, Index oder gespeicherte Commits verändert.',
        'You read three different contents of the same file, compared their Blame attribution and tried inspector Back. None of these read actions changed the working file, index or saved commits.',
      ],
      c('staging'),
      { prepare: data() },
    ),
  ],
};
