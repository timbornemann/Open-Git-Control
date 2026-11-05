import type { TutorialChapter, TutorialText } from './types';
import { scopeStep as s, scopeRecipe as seed, stagingControl as c, stagingRow as row, modifiedScopeFiles, tree, element } from './stagingLessonHelpers';

const menu = '.staging-context-menu';
const guide = 'docs/drafts/guide.md';
const output = 'tmp/build/output.log';
const cache = 'tmp/cache/item.log';
const edits = [guide, output, cache].map((path) => ({ path, content: [`Beispieldatei: ${path}\n`, `Example file: ${path}\n`] as TutorialText }));
const recipe = (options: NonNullable<Parameters<typeof seed>[0]> = {}, filter = 'docs') => seed({ edits, ...options }, filter);
const content = (rule: string) => [{ path: '.gitignore', source: 'worktree' as const, value: [rule + '\n', rule + '\n'] as TutorialText }];
const remaining = ['notes.txt', 'docs/ideas.md', guide];

export const TUTORIAL_STAGING_IGNORE_FOLDERS: TutorialChapter = {
  id: 'staging-ignore-folders',
  section: 'repo',
  title: ['Ordnerregeln und .gitignore vormerken', 'Folder rules and staging .gitignore'],
  description: [
    'Unterordner und Hauptordner unterscheiden, den Umfang prüfen und die Regeldatei vormerken.',
    'Distinguish subfolders from top-level folders, inspect the scope and stage the rule file.',
  ],
  question: ['Wie ignoriere ich einen Ordner und speichere die Regel?', 'How do I ignore a folder and save the rule?'],
  keywords: 'ignore ordner folder parent hauptordner unterordner gitignore regel stage speichern',
  steps: [
    s(
      'overview',
      ['Ein verschachtelter Ordner hat mehrere mögliche Umfänge', 'A nested folder offers several possible scopes'],
      [
        'Das frische Beispiel enthält docs/drafts/guide.md und zwei Dateien unter tmp/. Die Suche steht auf docs. Die Datei docs/ideas.md liegt neben drafts und soll bei einer Regel nur für drafts sichtbar bleiben.',
        'The fresh example contains docs/drafts/guide.md and two files under tmp/. Search is set to docs. docs/ideas.md sits beside drafts and should remain visible when the rule covers drafts only.',
      ],
      row('untracked', guide),
      { continue: false, prepare: recipe() },
    ),
    s(
      'open-folder-menu',
      ['Öffne das Menü von guide.md', 'Open guide.md’s menu'],
      [
        'Öffne das Kontextmenü von docs/drafts/guide.md. Im Menü findest du getrennte Regeln für den direkten Ordner und den Hauptordner.',
        'Open docs/drafts/guide.md’s context menu. It offers separate rules for the containing folder and the top-level folder.',
      ],
      row('untracked', guide),
      { prepare: recipe(), completion: element(menu) },
    ),
    s(
      'folder-scope',
      ['docs/drafts/ ist enger als docs/', 'docs/drafts/ is narrower than docs/'],
      [
        '„Ordner ignorieren (docs/drafts/)“ betrifft diesen Unterordner. „Hauptordner ignorieren (docs/)“ würde auch docs/ideas.md erfassen. Verwende im nächsten Schritt die engere Ordnerregel.',
        '“Ignore folder (docs/drafts/)” covers this subfolder. “Ignore top-level folder (docs/)” would also cover docs/ideas.md. Use the narrower folder rule in the next step.',
      ],
      c('ignore-folder'),
      { prepare: recipe({ contextMenu: row('untracked', guide) }) },
    ),
    s(
      'ignore-folder',
      ['Ignoriere nur docs/drafts/', 'Ignore docs/drafts/ only'],
      [
        'Wähle „Ordner ignorieren (docs/drafts/)“. guide.md soll verschwinden, docs/ideas.md sichtbar bleiben. Die Dateien unter tmp/ werden durch diese Regel nicht erfasst.',
        'Choose “Ignore folder (docs/drafts/)”. guide.md should disappear while docs/ideas.md remains visible. The files under tmp/ are outside this rule.',
      ],
      c('ignore-folder'),
      {
        prepare: recipe({ contextMenu: row('untracked', guide) }),
        completion: tree(['src/app.ts'], modifiedScopeFiles, ['.gitignore', 'notes.txt', 'docs/ideas.md', output, cache], { content: content('docs/drafts/') }),
      },
    ),
    s(
      'folder-result',
      ['Die Schwesterdatei bleibt in der Auswahl', 'The sibling file remains selectable'],
      [
        'Die Suche zeigt weiterhin docs/ideas.md. .gitignore, notes.txt und tmp/-Dateien liegen außerhalb des aktuellen Suchfilters. Der Filter löscht keine Dateien und verändert den Umfang der geschriebenen Regel nicht.',
        'Search still shows docs/ideas.md. .gitignore, notes.txt and the tmp/ files are outside the current search filter. Filtering neither deletes files nor changes the written rule’s scope.',
      ],
      row('untracked', 'docs/ideas.md'),
      { prepare: recipe({ ignore: ['docs/drafts/'] }) },
    ),
    s(
      'parent-case',
      ['Frisches Beispiel: ein gesamter Hauptordner', 'Fresh example: an entire top-level folder'],
      [
        'Das Beispiel wird zurückgesetzt und die Suche zeigt tmp. output.log liegt in tmp/build/, item.log in tmp/cache/. Diesmal wollen wir beide Unterordner über eine gemeinsame tmp/-Regel erfassen.',
        'The example resets, and search shows tmp. output.log is in tmp/build/ and item.log in tmp/cache/. This time we want one tmp/ rule to cover both subfolders.',
      ],
      row('untracked', output),
      { continue: false, prepare: recipe({}, 'tmp') },
    ),
    s(
      'open-parent-menu',
      ['Öffne das Menü von output.log', 'Open output.log’s menu'],
      [
        'Öffne das Kontextmenü von tmp/build/output.log. Der direkte Ordner wäre nur tmp/build/, der Hauptordner ist tmp/.',
        'Open tmp/build/output.log’s context menu. Its containing folder is tmp/build/; its top-level folder is tmp/.',
      ],
      row('untracked', output),
      { prepare: recipe({}, 'tmp'), completion: element(menu) },
    ),
    s(
      'parent-scope',
      ['Die Hauptordnerregel erfasst auch tmp/cache/', 'The top-level rule also covers tmp/cache/'],
      [
        '„Hauptordner ignorieren (tmp/)“ erfasst passende unversionierte Dateien in allen tmp/-Unterordnern. Der Menüeintrag ist deshalb umfassender als „Ordner ignorieren (tmp/build/)“. Bereits versionierte Dateien blieben weiterhin versioniert.',
        '“Ignore top-level folder (tmp/)” covers matching untracked files in every tmp/ subfolder. Its scope is wider than “Ignore folder (tmp/build/)”. Already tracked files would remain tracked.',
      ],
      c('ignore-parent'),
      { prepare: recipe({ contextMenu: row('untracked', output) }, 'tmp') },
    ),
    s(
      'ignore-parent',
      ['Ignoriere den Hauptordner tmp/', 'Ignore top-level folder tmp/'],
      [
        'Wähle „Hauptordner ignorieren (tmp/)“. Sowohl output.log als auch item.log sollen aus der Git-Auswahl verschwinden. docs/-Dateien und notes.txt bleiben erhalten.',
        'Choose “Ignore top-level folder (tmp/)”. Both output.log and item.log should leave Git’s selection. The docs/ files and notes.txt remain unchanged.',
      ],
      c('ignore-parent'),
      {
        prepare: recipe({ contextMenu: row('untracked', output) }, 'tmp'),
        completion: tree(['src/app.ts'], modifiedScopeFiles, ['.gitignore', ...remaining], { content: content('tmp/') }),
      },
    ),
    s(
      'clear-search',
      ['Zeige die neue Regeldatei', 'Reveal the new rule file'],
      [
        'Die Suche nach tmp zeigt jetzt keine neuen Dateien mehr. Leere das Suchfeld, um .gitignore und die übrigen Änderungen wieder zu sehen.',
        'Search for tmp now shows no new files. Clear the search field to see .gitignore and the remaining changes again.',
      ],
      c('staging-search'),
      { prepare: recipe({ ignore: ['tmp/'] }, 'tmp'), completion: { kind: 'value', selector: c('staging-search'), value: ['', ''] } },
    ),
    s(
      'rule-file',
      ['Die Regel wird wie Quellcode gespeichert', 'Save the rule like source code'],
      [
        '.gitignore ist neu und enthält tmp/. Sie ist noch nicht im nächsten Commit enthalten. Die ignorierten Dateien bleiben im Arbeitsordner; als Nächstes merken wir nur die Regeldatei vor.',
        '.gitignore is new and contains tmp/. It is not yet included in the next commit. Ignored files remain in the working directory; next we stage only the rule file.',
      ],
      row('untracked', '.gitignore'),
      { prepare: recipe({ ignore: ['tmp/'] }, '') },
    ),
    s(
      'stage-rule',
      ['Merke nur .gitignore vor', 'Stage .gitignore only'],
      [
        'Klicke Plus an der Zeile .gitignore. Die Datei soll in Vorgemerkt wechseln. Die zuvor vorgemerkte src/app.ts bleibt dort; andere neue Dateien werden nicht hinzugefügt.',
        'Click plus on .gitignore’s row. It should move to Staged. The previously staged src/app.ts remains there; other new files are not added.',
      ],
      `${row('untracked', '.gitignore')} ${c('stage-file')}`,
      {
        prepare: recipe({ ignore: ['tmp/'] }, ''),
        completion: tree(['src/app.ts', '.gitignore'], modifiedScopeFiles, remaining, { content: content('tmp/') }),
      },
    ),
    s(
      'rule-staged',
      ['Der Index enthält jetzt die Regel', 'The index now includes the rule'],
      [
        'Unter Vorgemerkt stehen src/app.ts und .gitignore. Ein anschließender Commit würde beide aufnehmen. Ignorierte Dateien unter tmp/ werden dadurch nicht mitcommittet.',
        'Staged now contains src/app.ts and .gitignore. A subsequent commit would include both. Ignored files under tmp/ would not be committed.',
      ],
      row('staged', '.gitignore'),
      { prepare: recipe({ ignore: ['tmp/'], staged: ['.gitignore'] }, '') },
    ),
    s(
      'finish',
      ['Prüfe Umfang und Regeldatei gemeinsam', 'Review scope and the rule file together'],
      [
        'Du hast Unterordner- und Hauptordnerregeln verglichen, den Suchfilter geleert und .gitignore gezielt vorgemerkt. Nutze eine möglichst passende Regel und prüfe die Dateiauswahl, bevor du sie committest.',
        'You compared subfolder and top-level rules, cleared search and staged .gitignore explicitly. Choose a rule matching the intended scope and review the selection before committing it.',
      ],
      c('staging'),
      { prepare: recipe({ ignore: ['tmp/'], staged: ['.gitignore'] }, '') },
    ),
  ],
};
