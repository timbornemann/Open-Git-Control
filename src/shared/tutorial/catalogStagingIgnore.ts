import type { TutorialChapter, TutorialText } from './types';
import { scopeStep as s, scopeRecipe as seed, stagingControl as c, stagingRow as row, modifiedScopeFiles, tree, element } from './stagingLessonHelpers';

const menu = '.staging-context-menu';
const notes = row('untracked', 'notes.txt');
const readme = row('unstaged', 'README.md');
const ignore = (pattern: string) => [{ path: '.gitignore', source: 'worktree' as const, value: [pattern + '\n', pattern + '\n'] as TutorialText }];
const result = (pattern: string, untracked: string[]) => tree(['src/app.ts'], modifiedScopeFiles, ['.gitignore', ...untracked], { content: ignore(pattern) });

export const TUTORIAL_STAGING_IGNORE: TutorialChapter = {
  id: 'staging-ignore',
  section: 'repo',
  title: ['Ignore-Regeln für Datei und Dateityp', 'Ignore rules for files and file types'],
  description: [
    'Datei- und Typregeln über das Kontextmenü anwenden und den Unterschied zwischen neuen, vorgemerkten und bereits versionierten Dateien üben.',
    'Apply file and type rules from the context menu and practice the differences between untracked, staged and already tracked files.',
  ],
  question: ['Wie ignoriere ich eine Datei oder einen Dateityp?', 'How do I ignore a file or a file type?'],
  keywords: 'ignore gitignore ignorieren dateityp extension tracked untracked vorgemerkt neue datei kontextmenü',
  steps: [
    s(
      'overview',
      ['Ignorieren ist eine Auswahlregel', 'Ignoring is a selection rule'],
      [
        'Eine Ignore-Regel blendet passende unversionierte Dateien aus der Git-Auswahl aus. Die Dateien bleiben im Arbeitsordner. Wir üben zuerst notes.txt und untersuchen danach Dateitypen, neue Dateien im Index und bereits versionierte Dateien.',
        'An ignore rule hides matching untracked files from Git’s selection. The files remain in the working directory. First we practice with notes.txt, then examine file types, new staged files and already tracked files.',
      ],
      notes,
      { continue: false },
    ),
    s(
      'open-file-menu',
      ['Öffne das Dateikontextmenü', 'Open the file context menu'],
      [
        'Klicke mit der rechten Maustaste auf notes.txt unter Unversioniert. Mit der Tastatur kannst du die Zeile fokussieren und Umschalt+F10 drücken.',
        'Right-click notes.txt under Untracked. With the keyboard, focus its row and press Shift+F10.',
      ],
      notes,
      { completion: element(menu) },
    ),
    s(
      'file-rule',
      ['Die Dateiregel nennt den relativen Pfad', 'The file rule uses the relative path'],
      [
        '„Datei zu .gitignore hinzufügen“ schreibt hier notes.txt in .gitignore. Die anderen Menüeinträge haben einen größeren Umfang. Wähle noch keinen Dateityp: Zuerst ignorieren wir genau diesen Dateinamen.',
        '“Add file to .gitignore” writes notes.txt to .gitignore here. Other menu items cover a wider scope. Do not choose a file type yet: first we ignore this filename.',
      ],
      c('ignore-file'),
      { prepare: seed({ contextMenu: notes }) },
    ),
    s(
      'ignore-file',
      ['Ignoriere notes.txt', 'Ignore notes.txt'],
      [
        'Wähle „Datei zu .gitignore hinzufügen“. notes.txt soll aus Unversioniert verschwinden. docs/ideas.md bleibt sichtbar; .gitignore erscheint als neue Datei.',
        'Choose “Add file to .gitignore”. notes.txt should disappear from Untracked. docs/ideas.md remains visible, and .gitignore appears as a new file.',
      ],
      c('ignore-file'),
      { prepare: seed({ contextMenu: notes }), completion: result('notes.txt', ['docs/ideas.md']) },
    ),
    s(
      'file-result',
      ['Die Regel selbst ist noch nicht versioniert', 'The rule itself is not yet tracked'],
      [
        'notes.txt wurde nicht gelöscht. Die neue .gitignore enthält die Regel und kann wie andere Dateien vorgemerkt und committet werden. Erst dadurch teilst du sie über das Repository mit anderen.',
        'notes.txt was not deleted. The new .gitignore contains the rule and can be staged and committed like other files. That is how you share it through the repository.',
      ],
      row('untracked', '.gitignore'),
      { prepare: seed({ ignore: ['notes.txt'] }) },
    ),
    s(
      'type-case',
      ['Frisches Beispiel: Dateityp statt Einzeldatei', 'Fresh example: file type instead of one file'],
      [
        'Das Beispiel wird jetzt zurückgesetzt. docs/ideas.md ist wieder sichtbar. Eine Typregel wie *.md gilt auch für andere passende unversionierte Dateien in Unterordnern. Bereits versionierte Markdown-Dateien bleiben versioniert.',
        'The example now resets. docs/ideas.md is visible again. A type rule such as *.md also matches other untracked files in subfolders. Already tracked Markdown files remain tracked.',
      ],
      row('untracked', 'docs/ideas.md'),
      { continue: false },
    ),
    s(
      'open-type-menu',
      ['Öffne das Menü von docs/ideas.md', 'Open the menu for docs/ideas.md'],
      [
        'Öffne das Kontextmenü dieser neuen Markdown-Datei. Wir verwenden den Menüeintrag für den Dateityp *.md.',
        'Open the context menu of this new Markdown file. We will use its file-type entry for *.md.',
      ],
      row('untracked', 'docs/ideas.md'),
      { completion: element(menu) },
    ),
    s(
      'ignore-type',
      ['Ignoriere den Dateityp *.md', 'Ignore the *.md file type'],
      [
        'Wähle „Dateityp ignorieren (*.md)“. docs/ideas.md soll verschwinden. notes.txt bleibt neu, und die schon versionierte README.md bleibt unter Geändert sichtbar.',
        'Choose “Ignore file type (*.md)”. docs/ideas.md should disappear. notes.txt remains untracked, and the already tracked README.md remains under Modified.',
      ],
      c('ignore-type'),
      { prepare: seed({ contextMenu: row('untracked', 'docs/ideas.md') }), completion: result('*.md', ['notes.txt']) },
    ),
    s(
      'type-result',
      ['Ignore-Regeln beenden keine Versionierung', 'Ignore rules do not stop tracking'],
      [
        'README.md passt zwar zu *.md, ist aber schon in Git gespeichert. Ihre Änderung wird deshalb weiterhin angezeigt. Eine Ignore-Regel allein entfernt keine Datei aus dem Index oder der Historie.',
        'README.md matches *.md but is already stored in Git. Its edit therefore remains visible. An ignore rule alone does not remove a file from the index or history.',
      ],
      readme,
      { prepare: seed({ ignore: ['*.md'] }) },
    ),
    s(
      'staged-case',
      ['Frisches Beispiel: neue Datei bereits vorgemerkt', 'Fresh example: a new file already staged'],
      [
        'Das Beispiel wird erneut zurückgesetzt und notes.txt ist jetzt im Bereich Vorgemerkt. Sie ist neu und wurde noch nie committet. Die App kann sie beim Hinzufügen einer Ignore-Regel aus dieser Vormerkung zurücknehmen.',
        'The example resets again, and notes.txt is now in Staged. It is new and has never been committed. The app can unstage it when adding an ignore rule.',
      ],
      row('staged', 'notes.txt'),
      { continue: false, prepare: seed({ staged: ['notes.txt'] }) },
    ),
    s(
      'open-staged-menu',
      ['Öffne das Menü der vorgemerkten neuen Datei', 'Open the staged new file’s menu'],
      [
        'Öffne das Kontextmenü von notes.txt im Bereich Vorgemerkt. Achte auf den Bereich: Dieselbe Regel wird hier zusätzlich ihre neue Vormerkung zurücknehmen.',
        'Open notes.txt’s context menu in Staged. Notice the section: applying the same rule here will also unstage this new file.',
      ],
      row('staged', 'notes.txt'),
      { prepare: seed({ staged: ['notes.txt'] }), completion: element(menu) },
    ),
    s(
      'ignore-staged',
      ['Ignoriere und entstage die neue Datei', 'Ignore and unstage the new file'],
      [
        'Wähle „Datei zu .gitignore hinzufügen“. notes.txt soll aus dem Index und der Git-Auswahl verschwinden, im Arbeitsordner aber erhalten bleiben. Die andere vorgemerkte Datei bleibt im Index.',
        'Choose “Add file to .gitignore”. notes.txt should leave the index and Git’s selection while remaining in the working directory. The other staged file stays in the index.',
      ],
      c('ignore-file'),
      { prepare: seed({ staged: ['notes.txt'], contextMenu: row('staged', 'notes.txt') }), completion: result('notes.txt', ['docs/ideas.md']) },
    ),
    s(
      'tracked-case',
      ['Frisches Beispiel: eine versionierte Datei', 'Fresh example: an already tracked file'],
      [
        'Das letzte Beispiel setzt die Regeln zurück. README.md ist bereits in der Historie und aktuell geändert. Wir fügen eine Regel für sie hinzu und prüfen, dass die Änderung trotzdem erhalten bleibt.',
        'The last example resets the rules. README.md is already in history and currently modified. We will add a rule for it and verify that its edit still remains visible.',
      ],
      readme,
      { continue: false },
    ),
    s(
      'open-tracked-menu',
      ['Öffne das Menü der geänderten README.md', 'Open modified README.md’s menu'],
      [
        'Öffne das Kontextmenü von README.md unter Geändert. Wir benutzen die normale Dateiregel und entfernen sie nicht aus der Versionierung.',
        'Open README.md’s context menu under Modified. We will use the normal file rule and keep the file tracked.',
      ],
      readme,
      { completion: element(menu) },
    ),
    s(
      'ignore-tracked',
      ['Füge die Regel für README.md hinzu', 'Add the README.md rule'],
      [
        'Wähle „Datei zu .gitignore hinzufügen“. Die neue .gitignore soll README.md enthalten; README.md selbst bleibt geändert und weiterhin versioniert.',
        'Choose “Add file to .gitignore”. The new .gitignore should contain README.md; README.md itself stays modified and tracked.',
      ],
      c('ignore-file'),
      { prepare: seed({ contextMenu: readme }), completion: result('README.md', ['notes.txt', 'docs/ideas.md']) },
    ),
    s(
      'reopen-tracked-menu',
      ['Prüfe eine bereits vorhandene Regel', 'Check an existing rule'],
      [
        'Öffne das Kontextmenü von README.md noch einmal. Wir wenden dieselbe Regel erneut an, um die Rückmeldung für eine schon vorhandene Regel zu sehen.',
        'Open README.md’s context menu again. We will apply the same rule a second time to see the message for an existing rule.',
      ],
      readme,
      { prepare: seed({ ignore: ['README.md'] }), completion: element(menu) },
    ),
    s(
      'repeat-rule',
      ['Wende die Dateiregel erneut an', 'Apply the file rule again'],
      [
        'Wähle erneut „Datei zu .gitignore hinzufügen“. Die App meldet, dass die Regel bereits existiert. Sie soll keinen zweiten identischen Eintrag schreiben und keine Änderung verlieren.',
        'Choose “Add file to .gitignore” again. The app reports that the rule already exists. It should neither write a duplicate entry nor lose any edits.',
      ],
      c('ignore-file'),
      {
        prepare: seed({ ignore: ['README.md'], contextMenu: readme }),
        action: 'ignore-repeated',
        completion: result('README.md', ['notes.txt', 'docs/ideas.md']),
      },
    ),
    s(
      'finish',
      ['Wähle Regeln passend zum Umfang', 'Choose rules for the intended scope'],
      [
        'Du hast eine Datei und einen Dateityp ignoriert, eine neue Vormerkung zurückgenommen und versionierte Dateien erhalten. Die nächste Lektion vergleicht einzelne Ordner mit ihrem übergeordneten Hauptordner und merkt die Regeldatei vor.',
        'You ignored a file and a file type, unstaged a new file and preserved tracked files. The next lesson compares individual folders with their top-level parent and stages the rule file.',
      ],
      c('staging'),
      { prepare: seed({ ignore: ['README.md'] }) },
    ),
  ],
};
