import type { TutorialChapter } from './types';
import { branchRow } from './branchLessonHelpers';
import { graphRow, historyViewer } from './historyLessonHelpers';
import { fileControl } from './fileLessonHelpers';
import { stagingRow } from './stagingLessonHelpers';
import {
  mergeStep as s,
  mergeRecipe as seed,
  mergeControl as c,
  mergeMore,
  mergeOpen,
  mergeSource,
  mergeHead,
  mergeDialog,
  mergeConfirm,
  mergeField as field,
  mergeMessage,
  mergeDescription,
  element,
  value,
} from './mergeLessonHelpers';
const result = (form = 0, file?: 'staged') => seed({ stage: 'result', mode: 'squash', form, file });
export const TUTORIAL_MERGE_SQUASH: TutorialChapter = {
  id: 'merge-squash',
  section: 'repo',
  title: ['Squash: Änderungen prüfen und selbst committen', 'Squash: inspect changes and create your own commit'],
  description: [
    'Bereite den Quellenstand im Index vor, lies seinen Diff und fülle den eigenen Commit aus. Prüfe anschließend den einzelnen Vorgänger.',
    'Prepare source changes in the index, read their diff and fill in your own commit. Then check its single parent.',
  ],
  question: ['Wie übernehme ich Änderungen mit Squash in einen eigenen Commit?', 'How do I squash changes into a commit of my own?'],
  keywords: 'merge squash zusammenfassen index staging eigene nachricht ein vorgänger',
  steps: [
    s(
      'overview',
      ['Squash bereitet Änderungen für deinen eigenen Commit vor', 'Squash prepares changes for your own commit'],
      [
        'Wir beginnen erneut mit main einen Commit hinter feature/begruessung. Squash übernimmt dessen Änderungen in den Index, bewegt HEAD aber noch nicht. Danach erstellst du selbst einen Commit.',
        'We start again with main one commit behind feature/begruessung. Squash takes its changes into the index without moving HEAD yet. You then create a commit yourself.',
      ],
      '[data-tutorial="graph"]',
      { continue: false, prepare: seed() },
    ),
    s(
      'before',
      ['Der alte Ziel-Commit bleibt zunächst HEAD', 'The old target commit initially remains HEAD'],
      [
        'Merke dir diesen Stand von main. Erst dein eigener Commit wird den Branch weiterführen.',
        'Notice this revision of main. Only the commit you create will advance the branch.',
      ],
      mergeHead(3),
      { prepare: seed() },
    ),
    s(
      'more',
      ['Öffne weitere Aktionen', 'Open more actions'],
      ['Öffne das Dreipunktmenü der oberen Leiste.', 'Open the three-dot menu in the top bar.'],
      mergeMore,
      { prepare: seed(), completion: element(mergeOpen) },
    ),
    s('open', ['Öffne Zusammenführen', 'Open Merge'], ['Wähle die Branch-Zusammenführung.', 'Choose the branch merge action.'], mergeOpen, {
      prepare: seed({ stage: 'more' }),
      completion: element(c('source')),
    }),
    s(
      'source',
      ['Wähle den Beispielbranch als Quelle', 'Choose the sample branch as source'],
      [
        'Lass In aktuellen Branch ausgewählt. Wähle feature/begruessung, damit main dessen Änderungen erhalten kann.',
        'Keep Into current branch selected. Choose feature/begruessung so that main can receive its changes.',
      ],
      c('source'),
      { prepare: seed({ stage: 'menu' }), completion: value(c('source'), mergeSource) },
    ),
    s(
      'mode',
      ['Wähle Squash', 'Choose Squash'],
      [
        'Wähle Für einen Commit bündeln (Squash) im Verfahrensfeld. Die eingeblendete Erklärung beschreibt den zusätzlich nötigen eigenen Commit.',
        'Choose Combine for one commit (squash) in the behavior field. Its explanation describes the additional commit you must create yourself.',
      ],
      c('mode'),
      { prepare: seed({ stage: 'menu', selected: true }), completion: value(c('mode'), 'squash') },
    ),
    s(
      'behavior',
      ['Vorbereiten und Speichern sind zwei getrennte Aktionen', 'Preparing and saving are two separate actions'],
      [
        'Squash füllt Arbeitsdateien und Index mit den übernommenen Änderungen. Es erzeugt hier noch keinen neuen Commit und speichert keine zweite Vorgängerbeziehung.',
        'Squash updates working files and the index with the combined changes. It creates no new commit here and records no second parent relationship.',
      ],
      c('behavior'),
      { prepare: seed({ stage: 'menu', selected: true, mode: 'squash' }) },
    ),
    s(
      'review',
      ['Öffne die Prüfung', 'Open the review'],
      [
        'Klicke Weiter · Merge prüfen. Kontrolliere feature/begruessung als Quelle, main als Ziel und Squash als Verfahren.',
        'Click Continue · review merge. Check feature/begruessung as source, main as target and Squash as behavior.',
      ],
      c('review'),
      { prepare: seed({ stage: 'menu', selected: true, mode: 'squash' }), completion: element(mergeDialog) },
    ),
    s(
      'confirm',
      ['Bereite die Änderungen vor', 'Prepare the changes'],
      [
        'Bestätige Änderungen vorbereiten. Die App soll die übernommenen Inhalte im Staging anzeigen.',
        'Confirm Prepare changes. The app should show the combined contents in Staging.',
      ],
      mergeConfirm,
      { prepare: seed({ stage: 'review', mode: 'squash' }), completion: element(stagingRow('staged', 'README.md')) },
    ),
    s(
      'head-unchanged',
      ['HEAD ist noch nicht weitergezogen', 'HEAD has not advanced yet'],
      [
        'main steht weiterhin am bisherigen Commit. Der Quellen-Commit und die bisherigen vier Commits sind unverändert; der eigene neue Commit fehlt noch.',
        'main still points to the previous commit. The source and the existing four commits are unchanged; your new commit has not been created yet.',
      ],
      mergeHead(3),
      { prepare: result() },
    ),
    s(
      'staged',
      ['Die übernommenen Dateien liegen im Index', 'The combined files are in the index'],
      [
        'README.md und src/app.ts sind vorgemerkt. Das ist der Inhalt, den dein anschließender Commit speichern wird.',
        'README.md and src/app.ts are staged. This is what your subsequent commit will save.',
      ],
      '[data-tutorial="staged-files"]',
      { prepare: result() },
    ),
    s(
      'open-diff',
      ['Prüfe die vorgemerkte README', 'Inspect the staged README'],
      [
        'Öffne README.md im vorgemerkten Bereich. Vergleiche den bisherigen main mit dem jetzt vorbereiteten Index.',
        'Open README.md in the staged section. Compare the old main against the index now prepared.',
      ],
      stagingRow('staged', 'README.md'),
      { prepare: result(), completion: element(historyViewer('staged')) },
    ),
    s(
      'read-diff',
      ['Der Diff zeigt den Inhalt deines künftigen Commits', 'The diff shows your future commit contents'],
      [
        'Rot stammt vom bisherigen Ziel-Commit, Grün aus dem übernommenen Quellenstand. Prüfe diese Änderungen vor dem Commit ebenso wie selbst geschriebene Änderungen.',
        'Red comes from the old target commit and green from the source revision. Review these changes before committing just as you would your own edits.',
      ],
      historyViewer('staged') + ' .file-viewer-diff',
      { prepare: result(0, 'staged') },
    ),
    s(
      'close-diff',
      ['Schließe den Diff zum Ausfüllen des Commits', 'Close the diff to fill in the commit'],
      ['Schließe die Dateiansicht. Die vorgemerkten Inhalte bleiben erhalten.', 'Close the file viewer. The staged contents remain.'],
      fileControl('close-file'),
      { prepare: result(0, 'staged'), completion: { kind: 'absent', selector: historyViewer('staged') } },
    ),
    s(
      'type',
      ['Wähle feat für den eigenen Commit', 'Choose feat for your commit'],
      [
        'Die übernommene Begrüßung ist eine Beispiel-Funktion. Wähle feat. Diese Konvention verändert den Titel, nicht die vorgemerkten Dateien.',
        'The combined greeting is a sample feature. Choose feat. This convention changes the title, not the staged files.',
      ],
      field('type'),
      { prepare: result(), completion: value(field('type'), 'feat') },
    ),
    s(
      'scope',
      ['Trage den Bereich lernen ein', 'Enter the scope lernen'],
      [
        'Schreibe lernen in das Präfix-/Bereichsfeld. Mit feat setzt die App den Bereich automatisch in Klammern.',
        'Enter lernen in the prefix/scope field. With feat, the app automatically puts the scope in parentheses.',
      ],
      field('prefix'),
      { prepare: result(1), completion: value(field('prefix'), 'lernen') },
    ),
    s(
      'message',
      ['Gib dem zusammengefassten Commit eine Nachricht', 'Give the combined commit a message'],
      [
        'Schreibe „Begrüßung übernehmen“. Du formulierst eine eigene Zusammenfassung, statt die Quellen-Nachricht übernehmen zu müssen.',
        'Enter “combine the greeting”. You provide your own summary rather than having to reuse the source message.',
      ],
      field('message'),
      { prepare: result(2), completion: { kind: 'value', selector: field('message'), value: mergeMessage } },
    ),
    s(
      'description',
      ['Beschreibe den bewussten gemeinsamen Commit', 'Describe the deliberate combined commit'],
      [
        'Schreibe „Beispieländerungen bewusst in einem Commit speichern.“ in die Beschreibung. Diese zusätzliche Erklärung gehört zum eigenen Commit.',
        'Enter “Save the sample changes deliberately in one commit.” in Description. This extra explanation belongs to your own commit.',
      ],
      field('description'),
      { prepare: result(3), completion: { kind: 'value', selector: field('description'), value: mergeDescription } },
    ),
    s(
      'preview',
      ['Prüfe den zusammengesetzten Titel', 'Check the assembled title'],
      [
        'Die Vorschau verbindet feat, den Bereich lernen und deine Nachricht. Der Commit wird die vorgemerkten Inhalte speichern.',
        'The preview combines feat, the lernen scope and your message. The commit will save the staged contents.',
      ],
      '.staging-commit-preview',
      { prepare: result(4) },
    ),
    s(
      'amend',
      ['Lass Amend für diesen neuen Commit ausgeschaltet', 'Keep Amend off for this new commit'],
      [
        'Wir erzeugen einen eigenen neuen Commit. Amend würde den letzten Commit ersetzen und gehört nicht zu diesem Ablauf.',
        'We are creating a new commit of our own. Amend would replace the last commit and is not part of this flow.',
      ],
      field('amend'),
      { prepare: result(4) },
    ),
    s(
      'commit',
      ['Speichere den eigenen lokalen Commit', 'Save your own local commit'],
      [
        'Prüfe Titel, Beschreibung und Index. Klicke Commit. Erst jetzt darf main auf einen neu erzeugten Commit weiterziehen.',
        'Check the title, description and index. Click Commit. Only now should main advance to a newly created commit.',
      ],
      '.staging-commit-btn',
      { prepare: result(4), completion: element(mergeHead(5)) },
    ),
    s(
      'single-parent',
      ['Der neue Commit hat nur den bisherigen Zielstand als Vorgänger', 'The new commit has only the old target as its parent'],
      [
        'Dein eigener Commit führt main weiter und speichert den vorbereiteten Inhalt. Im Unterschied zum Merge-Commit hat er nur einen Vorgänger; die zweite Verbindung zur Quelle fehlt.',
        'Your commit advances main and saves the prepared contents. Unlike a merge commit, it has only one parent; there is no second connection to the source.',
      ],
      mergeHead(5),
      { prepare: seed({ stage: 'committed', mode: 'squash' }) },
    ),
    s(
      'source-kept',
      ['Der Quellbranch bleibt am ursprünglichen Quellen-Commit', 'The source branch stays on its original source commit'],
      [
        'feature/begruessung bleibt erhalten. Der sichtbare Quellen-Commit gehört über diesen Branch weiterhin zum Graphen, wird durch Squash aber nicht zum zweiten Vorgänger deines neuen Commits.',
        'feature/begruessung is retained. Its commit remains in the graph through that branch, but Squash does not make it the second parent of your new commit.',
      ],
      graphRow(4),
      { prepare: seed({ stage: 'committed', mode: 'squash' }) },
    ),
    s(
      'finish',
      ['Die übernommenen Änderungen besitzen jetzt deine eigene Nachricht', 'The combined changes now have your own message'],
      [
        'Du hast den vorbereiteten Diff gelesen, die Commit-Felder ausgefüllt und einen eigenen Commit erstellt. main ist aktiv, der Index ist sauber und die Quelle bleibt erhalten. Die Aktion hat nichts veröffentlicht.',
        'You reviewed the prepared diff, filled in the commit fields and created your own commit. main is active, the index is clean and the source remains. Nothing was published.',
      ],
      branchRow('main', true),
      { prepare: seed({ stage: 'committed', mode: 'squash' }) },
    ),
  ],
};
