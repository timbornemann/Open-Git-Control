import type { TutorialChapter, TutorialCompletion } from './types';
import { branchStep, branchControl as c, branchRow as row, branchElement as element } from './branchLessonHelpers';
import {
  branchCarryRecipe as seed,
  carryBranch as branch,
  carryDialog as dialog,
  carryButton as button,
  carryField as field,
  carryName as name,
} from './branchCarryHelpers';
import { stagingRow } from './stagingLessonHelpers';
import { historyViewer as viewer, graphRow } from './historyLessonHelpers';
const s: typeof branchStep = (id, title, description, target, extra) => branchStep(id, title, description, target, { inspector: 'staging', ...extra });
const review = { dialog: 'review' as const };
const choice = { dialog: 'choice' as const };
const namedChoice = { ...choice, name };
const result = { dialog: 'result' as const, name };
const post = { post: true };
const state: TutorialCompletion = {
  kind: 'working-tree',
  staged: ['README.md'],
  unstaged: ['README.md'],
  untracked: ['notes.txt'],
  content: [
    { path: 'README.md', source: 'head', value: { example: 'history-readme', version: 'latest' } },
    { path: 'README.md', source: 'index', value: { example: 'history-readme', version: 'index' } },
    { path: 'README.md', source: 'worktree', value: { example: 'history-readme', version: 'work' } },
    { path: 'notes.txt', source: 'worktree', value: { example: 'tree-files', version: 'note' } },
  ],
};
const closedViewer: TutorialCompletion = { kind: 'absent', selector: '.file-viewer' };
export const TUTORIAL_BRANCHES_CARRY: TutorialChapter = {
  id: 'branches-carry',
  section: 'repo',
  title: ['Offene Änderungen mitnehmen und danach kontrollieren', 'Carry uncommitted changes and verify them afterwards'],
  description: [
    'Wechsle mit teilweise gestagter README und einer neuen Datei; kontrolliere anschließend HEAD, Historie und beide getrennten Diffs.',
    'Switch with a partially staged README and a new file; then verify HEAD, history and the two separate diffs.',
  ],
  question: ['Wie nehme ich offene Änderungen auf einen anderen Branch mit?', 'How do I carry uncommitted changes to another branch?'],
  keywords: 'branch wechsel carry mitnehmen checkout offen staged unstaged untracked index prüfen erhalten stash sichern',
  steps: [
    s(
      'overview',
      ['Wir nehmen die drei offenen Dateizustände mit', 'We will carry the three uncommitted file states'],
      [
        'README ist teilweise gestagt und notes.txt ist neu. main und feature/begruessung zeigen hier auf denselben gespeicherten Commit, damit wir den Erhalt dieser offenen Versionen gezielt prüfen können. Unterschiedliche Zielstände und Konflikte erhalten eigene Übungen.',
        'README is partially staged and notes.txt is new. main and feature/begruessung point to the same saved commit here so we can specifically verify preservation of those uncommitted versions. Different target revisions and conflicts have separate exercises.',
      ],
      c('staging'),
      { continue: false, prepare: seed() },
    ),
    s(
      'request',
      ['Fordere den Wechsel zu feature/begruessung an', 'Request a switch to feature/begruessung'],
      [
        'Klicke den Beispielbranch. Die offenen Änderungen sollen zuerst im geführten Dialog geprüft werden. Der Wechsel ist mit diesem ersten Klick noch nicht bestätigt.',
        'Click the sample branch. Its uncommitted changes should first be reviewed in the guided dialog. This initial click does not confirm the switch yet.',
      ],
      row(branch),
      { prepare: seed(), completion: element('.branch-change-files') },
    ),
    s(
      'review',
      ['Prüfe Quelle, Ziel und die drei Dateigruppen', 'Inspect source, target and the three file groups'],
      [
        'Quelle ist main, Ziel ist feature/begruessung. README steht unter Gestagt und Ungestagt; notes.txt bei den neuen Dateien. Die separate Prüfungslektion erklärt jede Vorschau ausführlich. Hier führen wir nach der Kontrolle den Wechsel aus.',
        'The source is main and the target is feature/begruessung. README appears in Staged and Unstaged; notes.txt is in new files. The separate review lesson explains every preview in detail. Here we will execute the switch after checking.',
      ],
      '.branch-change-files',
      { prepare: seed(review) },
    ),
    s(
      'next',
      ['Gehe zur Wechselentscheidung', 'Proceed to the switch decision'],
      [
        'Wähle Weiter im Dialog. Danach bestimmen wir den Sicherungsnamen und wählen ausdrücklich Mitnehmen.',
        'Choose Next in the dialog. We will then set the backup name and explicitly choose Carry.',
      ],
      button('confirm'),
      { prepare: seed(review), completion: element(field) },
    ),
    s(
      'name',
      ['Benenne die Sicherung der offenen Arbeit', 'Name the backup of uncommitted work'],
      [
        'Trage „Notizen für den Branchwechsel“ ein. Dieser Name bezeichnet die Sicherung der offenen Arbeit, nicht einen neuen Branch oder Commit.',
        'Enter “Notes for the branch switch”. This identifies the backup of uncommitted work, not a new branch or commit.',
      ],
      field,
      { prepare: seed(choice), completion: { kind: 'value', selector: field, value: name } },
    ),
    s(
      'carry-purpose',
      ['Mitnehmen stellt die offenen Änderungen im Ziel wieder her', 'Carry restores uncommitted changes at the target'],
      [
        'Mitnehmen und wechseln soll zuerst den Branch wechseln und anschließend die offene Arbeit einschließlich des Staging-Zustands wiederherstellen. Die Änderungen werden dadurch noch nicht committed.',
        'Carry and switch changes the branch and restores the uncommitted work, including its staged state, at the target. This does not commit those changes.',
      ],
      button('confirm'),
      { prepare: seed(namedChoice) },
    ),
    s(
      'park-purpose',
      ['Parken ist eine eigene Entscheidung', 'Parking is a separate decision'],
      [
        'Parken und wechseln würde die Arbeit für eine spätere Rückkehr sichern. Diese Variante erhält ihre eigene Übung. Für diesen Ablauf wählen wir Mitnehmen, damit README und notes.txt direkt am Ziel verfügbar bleiben.',
        'Park and switch would save the work for a later return. That choice has its own exercise. In this flow we choose Carry so README and notes.txt remain available immediately at the target.',
      ],
      button('secondary'),
      { prepare: seed(namedChoice) },
    ),
    s(
      'carry',
      ['Bestätige Mitnehmen und wechseln', 'Confirm Carry and switch'],
      [
        'Wähle die primäre Aktion Mitnehmen und wechseln. Warte auf das Ergebnis. Erfolgreich ist dieser Schritt erst, wenn der Zielbranch aktiv ist und die drei Dateizustände erhalten sind.',
        'Choose the primary Carry and switch action. Wait for the outcome. This step succeeds only once the target branch is active and the three file states are preserved.',
      ],
      button('confirm'),
      {
        prepare: seed(namedChoice),
        completion: {
          kind: 'all',
          conditions: [element(c('branch-change-result') + '[data-branch-change-restored="true"]'), element(row(branch, true)), state],
        },
      },
    ),
    s(
      'result',
      ['Das Ergebnis bestätigt Änderungen und Staging-Zustand', 'The outcome confirms changes and staged state'],
      [
        'Der Dialog meldet die Wiederherstellung von Änderungen und Staging-Zustand. Wir prüfen die Fassungen gleich zusätzlich in der normalen Oberfläche. Eine Erfolgsmeldung ersetzt diese Inhaltskontrolle nicht.',
        'The dialog reports restoration of changes and staged state. We will additionally inspect the versions in the normal interface. A success message does not replace checking the contents.',
      ],
      c('branch-change-result'),
      { prepare: seed(result) },
    ),
    s(
      'close',
      ['Schließe den abgeschlossenen Wechsel', 'Close the completed switch'],
      [
        'Wähle Schließen. Damit verlässt du nur die Ergebnisansicht; es wird kein zweiter Wechsel ausgeführt und keine offene Änderung verworfen.',
        'Choose Close. This only leaves the outcome view; it neither executes another switch nor discards uncommitted work.',
      ],
      button('cancel'),
      { prepare: seed(result), completion: { kind: 'absent', selector: dialog } },
    ),
    s(
      'head',
      ['HEAD steht jetzt am Zielbranch', 'HEAD now belongs to the target branch'],
      [
        'feature/begruessung trägt HEAD. main ist weiterhin vorhanden. Nur der aktive Branch hat gewechselt; seine offenen Fassungen sind noch keine zusätzlichen Commits.',
        'feature/begruessung carries HEAD. main still exists. Only the active branch changed; its uncommitted versions are not additional commits.',
      ],
      row(branch, true),
      { prepare: seed(post) },
    ),
    s(
      'history',
      ['Die gespeicherte Historie hat keinen neuen Commit', 'The saved history has no new commit'],
      [
        'Es gibt weiterhin vier gespeicherte Commits. Beide lokalen Namen zeigen wie vorbereitet auf denselben letzten Commit. Der Branchwechsel hat weder einen Merge noch einen Commit erzeugt.',
        'There are still four saved commits. Both local names still point to the same latest commit as prepared. The switch created neither a merge nor a commit.',
      ],
      graphRow(4),
      { prepare: seed(post) },
    ),
    s(
      'staged',
      ['Die vorgemerkte README ist am Ziel noch vorhanden', 'The staged README remains at the target'],
      [
        'README.md steht weiterhin im vorgemerkten Bereich. Wir öffnen jetzt genau diese Quelle, um die Begrüßung im Index zu überprüfen.',
        'README.md remains in the staged section. We will open that source specifically to inspect the greeting in the index.',
      ],
      c('staged-files'),
      { prepare: seed(post) },
    ),
    s(
      'open-staged',
      ['Öffne den vorgemerkten README-Diff', 'Open the staged README diff'],
      [
        'Klicke README.md im Bereich Vorgemerkt. Wähle den Dateinamen, damit du die Quelle liest, ohne etwas aus dem Index zu nehmen.',
        'Click README.md in Staged. Choose the filename to read that source without removing anything from the index.',
      ],
      stagingRow('staged', 'README.md'),
      { prepare: seed(post), completion: element(viewer('staged')) },
    ),
    s(
      'staged-content',
      ['Der Index enthält weiterhin die Staging-Begrüßung', 'The index still contains the staging greeting'],
      [
        'Der Vergleich entfernt die Welt-Begrüßung aus dem letzten Commit und fügt die Staging-Begrüßung hinzu. Genau diese vorgemerkte Fassung hat den Wechsel überstanden.',
        'The diff removes the world greeting from the last commit and adds the staging greeting. That exact staged version survived the switch.',
      ],
      viewer('staged'),
      { prepare: seed({ ...post, diff: 'staged' }) },
    ),
    s(
      'close-staged',
      ['Schließe den vorgemerkten Diff wieder', 'Close the staged diff again'],
      [
        'Schließe den Viewer über das X. Die Inhaltskontrolle verändert den Index nicht. Danach prüfen wir den zusätzlichen ungestagten Unterschied.',
        'Close the viewer using X. Inspecting the contents does not change the index. We will next check the additional unstaged difference.',
      ],
      c('close-file'),
      { prepare: seed({ ...post, diff: 'staged' }), completion: closedViewer },
    ),
    s(
      'unstaged',
      ['Dieselbe README besitzt weiterhin eine weitere Bearbeitung', 'The same README still has a further edit'],
      [
        'README steht auch im Bereich Änderungen. Ihr Arbeitsinhalt weicht weiterhin vom Index ab. Mitnehmen hat die beiden Fassungen nicht zu einer einzigen vorgemerkten Version zusammengefasst.',
        'README also appears in Changes. Its working contents still differ from the index. Carry did not combine both versions into one staged version.',
      ],
      c('unstaged-files'),
      { prepare: seed(post) },
    ),
    s(
      'open-unstaged',
      ['Öffne nun den ungestagten README-Diff', 'Now open the unstaged README diff'],
      [
        'Klicke README.md im Bereich Änderungen. Dieser Vergleich soll Index gegen Arbeitsdatei lesen.',
        'Click README.md in Changes. This diff should compare the index against the working file.',
      ],
      stagingRow('unstaged', 'README.md'),
      { prepare: seed(post), completion: element(viewer('unstaged')) },
    ),
    s(
      'working-content',
      ['Die Team-Begrüßung bleibt ungestagt', 'The team greeting remains unstaged'],
      [
        'Jetzt wird die Staging-Begrüßung durch die Team-Begrüßung ersetzt. Der zusätzliche Arbeitsstand ist erhalten geblieben und weiterhin nicht für den nächsten Commit vorgemerkt.',
        'Now the staging greeting is replaced by the team greeting. The additional working edit survived and is still not staged for the next commit.',
      ],
      viewer('unstaged'),
      { prepare: seed({ ...post, diff: 'unstaged' }) },
    ),
    s(
      'close-unstaged',
      ['Kehre wieder zur Änderungsübersicht zurück', 'Return to the change overview again'],
      [
        'Schließe auch diesen Viewer. Wir lassen alle offenen Änderungen absichtlich bestehen, ohne sie zu stagen, zu verwerfen oder zu committen.',
        'Close this viewer too. We deliberately leave all uncommitted changes in place without staging, discarding or committing them.',
      ],
      c('close-file'),
      { prepare: seed({ ...post, diff: 'unstaged' }), completion: closedViewer },
    ),
    s(
      'untracked',
      ['notes.txt ist weiterhin neu und unvorgemerkt', 'notes.txt remains new and unstaged'],
      [
        'Die zusätzliche Beispieldatei steht weiterhin unter Neue Dateien. Sie wurde mitgenommen, aber weder automatisch versioniert noch in den Index aufgenommen.',
        'The additional example file remains in New files. It was carried over but neither automatically tracked nor added to the index.',
      ],
      c('untracked-files'),
      { prepare: seed(post) },
    ),
    s(
      'finish',
      ['Branch und offene Fassungen sind getrennt geprüft', 'The branch and uncommitted versions are verified separately'],
      [
        'Du hast den Wechsel bestätigt und anschließend HEAD, Historie, Index-Diff, Arbeitsdatei-Diff und die neue Datei kontrolliert. Alle drei offenen Zustände sind erhalten. Weiter beendet diese Lektion.',
        'You confirmed the switch, then inspected HEAD, history, the index diff, the working-file diff and the new file. All three uncommitted states remain. Next completes this lesson.',
      ],
      c('staging'),
      { prepare: seed(post) },
    ),
  ],
};
