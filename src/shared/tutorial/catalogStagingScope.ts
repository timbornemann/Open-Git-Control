import type { TutorialChapter, TutorialCompletion, TutorialStep, TutorialText } from './types';
import { step } from './catalogSteps';
const control = (name: string) => `[data-tutorial="${name}"]`;
const search = control('staging-search');
const all = ['README.md', 'package.json', 'src/app.ts', 'notes.txt', 'docs/ideas.md'];
const newFiles = ['notes.txt', 'docs/ideas.md'];
const readme = ['README.md'];
const modified = ['README.md', 'package.json'];
const seed = (staged: readonly string[] = [], filter = ''): TutorialStep['prepare'] => ({ staged, fill: [{ selector: search, value: [filter, filter] }] });
const files = (staged: readonly string[], unstaged: readonly string[], untracked: readonly string[]): TutorialCompletion => ({
  kind: 'working-tree',
  repoPath: '/tutorial/OGC-Lernprojekt',
  staged,
  unstaged,
  untracked,
});
const value = (text: string): TutorialCompletion => ({ kind: 'value', selector: search, value: [text, text] });
const s = (id: string, title: TutorialText, text: TutorialText, target = control('staging'), extra: Partial<TutorialStep> = {}) =>
  step(id, title, text, 'repo', target, { scenario: 'scope', inspector: 'staging', continue: true, ...extra });
export const TUTORIAL_STAGING_SCOPE: TutorialChapter = {
  id: 'staging-scope',
  section: 'repo',
  title: ['Staging-Umfang: Suche, Bereiche und ganzes Repository', 'Staging scope: search, sections and the whole repository'],
  description: [
    'Mit fünf Beispieländerungen gefilterte Bereiche, neue Dateien und das gesamte Repository gezielt vormerken und wieder aus dem Index nehmen.',
    'Use five sample changes to stage filtered sections, untracked files and the whole repository, then remove selections from the index.',
  ],
  question: [
    'Was ist der Unterschied zwischen Datei, Alle Treffer und Gesamtes Repository hinzufügen?',
    'What is the difference between a file, All matches and Stage whole repository?',
  ],
  keywords: 'stage staging index scope umfang suche filter bereich section alle treffer matches repository unstage hinzufügen',
  steps: [
    s(
      'overview',
      ['Der Umfang einer Aktion ist entscheidend', 'An action’s scope matters'],
      [
        'Hier gibt es fünf Änderungen: README.md und package.json sind geändert, src/app.ts ist bereits vorgemerkt, notes.txt und docs/ideas.md sind neu. Wir üben den Unterschied zwischen einer Datei, einem Bereich und dem gesamten Repository. Dabei erstellen wir keinen Commit.',
        'There are five changes: README.md and package.json are modified, src/app.ts is staged, and notes.txt and docs/ideas.md are new. We will distinguish actions for a file, a section and the whole repository. This lesson creates no commit.',
      ],
      undefined,
      { continue: false },
    ),
    s(
      'search-explained',
      ['Die Suche blendet Dateien nur aus', 'Search only hides files'],
      [
        'Das Suchfeld begrenzt die angezeigten Dateipfade in allen Staging-Bereichen. Es verändert weder Dateien noch den Index. Deshalb kann ein vorgemerkter Stand auch Dateien enthalten, die du mit dem aktuellen Suchbegriff nicht siehst.',
        'Search filters displayed file paths across all staging sections. It changes neither files nor the index. A staged snapshot can therefore include files hidden by your current search.',
      ],
      search,
    ),
    s(
      'filter-readme',
      ['Suche nach README', 'Search for README'],
      [
        'Trage README in die Dateisuche ein. Die Liste zeigt danach nur die passende README.md. Die übrigen vier Änderungen bleiben im Übungsrepository erhalten.',
        'Enter README in the file search. Only README.md remains visible. The other four changes remain in the practice repository.',
      ],
      search,
      { completion: value('README') },
    ),
    s(
      'filtered-result',
      ['„Alle Treffer“ meint die sichtbare Auswahl', '“All matches” means the visible selection'],
      [
        'Im Bereich Änderungen gibt es jetzt einen Treffer. Seine Plus-Aktion heißt mit aktivem Filter Alle Treffer. Sie betrifft die angezeigten geänderten Dateien dieses Bereichs; neue Dateien und ausgeblendete Änderungen gehören nicht dazu.',
        'Changes now contains one match. With a filter, its plus action says All matches. It applies to displayed modified files in this section; untracked files and hidden changes are outside its scope.',
      ],
      control('stage-modified-section'),
      { prepare: seed([], 'README') },
    ),
    s(
      'stage-filtered',
      ['Füge nur den gefilterten Bereich hinzu', 'Stage the filtered section only'],
      [
        'Klicke im Bereich Änderungen auf Plus Alle Treffer. Damit kommt nur README.md in den Index. package.json und die beiden neuen Dateien sollen unverändert außerhalb des Index bleiben.',
        'Click plus All matches in Changes. Only README.md should enter the index. package.json and both untracked files must stay outside it.',
      ],
      control('stage-modified-section'),
      { prepare: seed([], 'README'), completion: files(['src/app.ts', ...readme], ['package.json'], newFiles) },
    ),
    s(
      'hidden',
      ['Prüfe auch ausgeblendete Änderungen', 'Remember hidden changes'],
      [
        'Die README steht nun unter Vorgemerkte Änderungen. Der Filter ist weiterhin aktiv: Er versteckt auch die bereits vorgemerkte src/app.ts. Ein kurzer Blick auf eine gefilterte Liste reicht deshalb nicht aus, um den gesamten Commit-Inhalt zu prüfen.',
        'README now appears under Staged changes. The filter is still active and also hides the already staged src/app.ts. A filtered list alone is therefore insufficient to review the whole commit contents.',
      ],
      control('staged-files'),
      { prepare: seed(readme, 'README') },
    ),
    s(
      'clear-filter',
      ['Zeige wieder alle Änderungen', 'Show all changes again'],
      [
        'Leere die Dateisuche. Jetzt siehst du wieder beide vorgemerkten Dateien, die verbliebene geänderte package.json und die zwei neuen Dateien.',
        'Clear the file search. Both staged files, the remaining modified package.json and the two untracked files reappear.',
      ],
      search,
      { prepare: seed(readme, 'README'), completion: value('') },
    ),
    s(
      'modified-section',
      ['Ein Bereich ist keine Repository-Auswahl', 'A section is not the whole repository'],
      [
        'Plus Alle im Bereich Änderungen betrifft jetzt die verbliebene package.json. Es fügt nicht automatisch die Dateien aus Unversioniert hinzu. Diese Trennung hilft, bestehende Änderungen und neu angelegte Dateien bewusst auszuwählen.',
        'Plus All in Changes now applies to the remaining package.json. It does not automatically include Untracked files. This separation helps you select modifications and new files deliberately.',
      ],
      control('stage-modified-section'),
      { prepare: seed(readme) },
    ),
    s(
      'stage-modified',
      ['Füge die übrigen geänderten Dateien hinzu', 'Stage the remaining modified files'],
      [
        'Klicke Plus Alle im Bereich Änderungen. Danach sollen README.md, src/app.ts und package.json vorgemerkt sein. Die zwei neuen Dateien bleiben in ihrem eigenen Bereich.',
        'Click plus All in Changes. README.md, src/app.ts and package.json should then be staged. The two new files remain in their own section.',
      ],
      control('stage-modified-section'),
      { prepare: seed(readme), completion: files(['src/app.ts', 'README.md', 'package.json'], [], newFiles) },
    ),
    s(
      'untracked',
      ['Neue Dateien haben einen eigenen Bereich', 'New files have their own section'],
      [
        'Unversioniert enthält Dateien, die Git bisher nicht verfolgt. Mit Plus nimmst du sie erstmals in den Index auf. Auch hier berücksichtigt die Bereichsaktion nur die angezeigten Treffer.',
        'Untracked contains files Git does not yet track. Plus adds them to the index for the first time. This section’s bulk action also uses only displayed matches.',
      ],
      control('untracked-files'),
      { prepare: seed(modified) },
    ),
    s(
      'filter-notes',
      ['Grenze die neuen Dateien ein', 'Filter the new files'],
      [
        'Trage notes in die Suche ein. Von den neuen Dateien soll nur notes.txt sichtbar bleiben. docs/ideas.md wird ausgeblendet und soll beim folgenden Bereichsschritt noch nicht vorgemerkt werden.',
        'Enter notes in Search. Of the new files, only notes.txt should remain visible. docs/ideas.md is hidden and must stay untracked in the next section action.',
      ],
      search,
      { prepare: seed(modified), completion: value('notes') },
    ),
    s(
      'stage-new',
      ['Füge den neuen Treffer hinzu', 'Stage the new match'],
      [
        'Klicke Plus Alle Treffer im Bereich Unversioniert. notes.txt wechselt in den Index; docs/ideas.md bleibt neu und unversioniert.',
        'Click plus All matches in Untracked. notes.txt enters the index; docs/ideas.md remains untracked.',
      ],
      control('stage-untracked-section'),
      { prepare: seed(modified, 'notes'), completion: files(['src/app.ts', ...modified, 'notes.txt'], [], ['docs/ideas.md']) },
    ),
    s(
      'clear-again',
      ['Kontrolliere die gesamte Auswahl', 'Review the whole selection'],
      [
        'Leere die Suche wieder. Vier Dateien sind jetzt vorgemerkt. docs/ideas.md ist die einzige neue Datei, die noch außerhalb des Index liegt.',
        'Clear Search again. Four files are now staged. docs/ideas.md is the only untracked file still outside the index.',
      ],
      search,
      { prepare: seed([...modified, 'notes.txt'], 'notes'), completion: value('') },
    ),
    s(
      'unstage-explained',
      ['Aus dem Index nehmen löscht keine Änderungen', 'Unstaging does not delete changes'],
      [
        'Minus Alle im Bereich Vorgemerkte Änderungen nimmt die angezeigten Dateien aus der Commit-Auswahl. Ihre Inhalte bleiben im Arbeitsordner. Bei neuen Dateien wird der Zustand wieder unversioniert; bei bekannten Dateien wieder geändert.',
        'Minus All in Staged changes removes displayed files from the commit selection. Their contents stay in the working directory. New files become untracked again; known files become modified again.',
      ],
      control('unstage-section'),
      { prepare: seed([...modified, 'notes.txt']) },
    ),
    s(
      'filter-unstage',
      ['Wähle README für die Rücknahme aus', 'Select README for unstaging'],
      [
        'Suche erneut nach README. Die Minus-Bereichsaktion soll gleich nur diese sichtbare Datei betreffen, während die anderen drei vorgemerkten Dateien im Index bleiben.',
        'Search for README again. The minus section action should affect only this visible file, keeping the other three staged files in the index.',
      ],
      search,
      { prepare: seed([...modified, 'notes.txt']), completion: value('README') },
    ),
    s(
      'unstage-selected',
      ['Nimm nur den Treffer aus dem Index', 'Unstage the match only'],
      [
        'Klicke Minus Alle Treffer unter Vorgemerkte Änderungen. README.md erscheint wieder als geändert. src/app.ts, package.json und notes.txt sollen weiterhin vorgemerkt bleiben.',
        'Click minus All matches under Staged changes. README.md becomes modified again. src/app.ts, package.json and notes.txt must remain staged.',
      ],
      control('unstage-section'),
      { prepare: seed([...modified, 'notes.txt'], 'README'), completion: files(['src/app.ts', 'package.json', 'notes.txt'], readme, ['docs/ideas.md']) },
    ),
    s(
      'whole-explained',
      ['Der Repository-Button ignoriert den Suchfilter', 'The repository button ignores the search filter'],
      [
        'Gesamtes Repository hinzufügen ist bewusst umfassender als Alle Treffer. Es nimmt auch ausgeblendete geänderte, gelöschte und neue Dateien auf. Im Beispiel betrifft das neben der sichtbaren README auch die ausgeblendete docs/ideas.md.',
        'Stage whole repository deliberately goes beyond All matches. It includes hidden modified, deleted and untracked files. Here it includes hidden docs/ideas.md alongside the visible README.',
      ],
      control('stage-repository'),
      { prepare: seed(['package.json', 'notes.txt'], 'README') },
    ),
    s(
      'stage-whole',
      ['Füge jetzt das ganze Repository hinzu', 'Stage the whole repository now'],
      [
        'Klicke Gesamtes Repository hinzufügen. Danach sollen alle fünf Beispieländerungen im Index liegen, auch die nicht sichtbare docs/ideas.md. Den Inhalt aller Dateien prüfst du anschließend bei leerer Suche.',
        'Click Stage whole repository. All five sample changes should enter the index, including hidden docs/ideas.md. Next review every file with an empty search.',
      ],
      control('stage-repository'),
      { prepare: seed(['package.json', 'notes.txt'], 'README'), completion: files(all, [], []) },
    ),
    s(
      'clear-final',
      ['Zeige die vollständige Commit-Auswahl', 'Show the complete commit selection'],
      [
        'Leere die Suche ein letztes Mal. Jetzt wird sichtbar, dass der Repository-Button Dateien aus beiden früheren Bereichen übernommen hat.',
        'Clear Search once more. You can now see that the repository action included files from both former sections.',
      ],
      search,
      { prepare: seed(all, 'README'), completion: value('') },
    ),
    s(
      'review',
      ['Vor dem Commit alle Dateien prüfen', 'Review all files before committing'],
      [
        'Vorgemerkte Änderungen enthält fünf Dateien. Vor einem echten Commit kannst du jede Datei anklicken und ihren Diff prüfen. Ein erfolgreicher Stage-Vorgang speichert noch keinen Commit und überträgt nichts an ein Hosting.',
        'Staged changes contains five files. Before a real commit, open each file and review its diff. Successful staging creates no commit and sends nothing to hosting.',
      ],
      control('staged-files'),
      { prepare: seed(all) },
    ),
    s(
      'unstage-all',
      ['Nimm die gesamte Auswahl zurück', 'Unstage the whole selection'],
      [
        'Klicke bei leerer Suche Minus Alle im vorgemerkten Bereich. Die drei bekannten Dateien sollen wieder geändert, die beiden neuen wieder unversioniert sein. Die Inhalte bleiben erhalten.',
        'With an empty search, click minus All in Staged changes. The three known files should become modified and the two new files untracked again. Their contents are preserved.',
      ],
      control('unstage-section'),
      { prepare: seed(all), completion: files([], ['README.md', 'package.json', 'src/app.ts'], newFiles) },
    ),
    s(
      'finish',
      ['Den Umfang bewusst wählen', 'Choose the scope deliberately'],
      [
        'Datei-Plus betrifft eine Datei, Bereichsaktionen betreffen sichtbare Treffer und der Repository-Button umfasst sämtliche Änderungen. Suche vor der endgültigen Commit-Prüfung leeren. Die nächste Lektion unterscheidet das Zurücknehmen der Auswahl vom tatsächlichen Verwerfen von Änderungen.',
        'A file’s plus affects one file, section actions affect visible matches, and the repository button covers all changes. Clear Search before the final commit review. The next lesson distinguishes unstaging from actually discarding edits.',
      ],
      undefined,
      { prepare: { ...seed(), unstaged: ['src/app.ts'] } },
    ),
  ],
};
