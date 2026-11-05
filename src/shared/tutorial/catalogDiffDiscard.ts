import type { TutorialChapter } from './types';
import { diffStep as s, diffControl as c, diffRow as row, block, blockControl as button, diffRecipe as seed, diffState, viewer } from './diffLessonHelpers';
import { dialog, confirmDialog, cancelDialog, element } from './stagingLessonHelpers';
import { hunkText } from './hunkLessonExamples';
const before = seed('first');
const after = seed('first', 'unstaged', { click: [button('discard')], submit: confirmDialog, ready: '.diff-empty-state' });
const closed = seed('first', 'unstaged', { edits: [{ path: 'README.md', content: hunkText('first') }] });

export const TUTORIAL_DIFF_DISCARD: TutorialChapter = {
  id: 'diff-hunk-discard',
  section: 'repo',
  title: ['Einen Hunk gezielt verwerfen', 'Discard one hunk deliberately'],
  description: [
    'Nur eine verbleibende Arbeitsänderung verwerfen, die Bestätigung prüfen und vorgemerkte Inhalte erhalten.',
    'Discard one remaining worktree change, review confirmation and preserve staged contents.',
  ],
  question: ['Wie verwerfe ich nur einen Änderungsblock?', 'How do I discard only one change block?'],
  keywords: 'hunk verwerfen discard block index erhalten abbrechen bestätigen diff',
  steps: [
    s(
      'overview',
      ['Dieses Beispiel enthält bereits eine Vormerkung', 'This example already has a staged change'],
      [
        'Das frische Beispiel hat den oberen README-Block bereits im Index. Im Arbeitsordner ist zusätzlich der Eintrag bei Next steps geändert. Wir verwerfen nur diese verbleibende Änderung und erhalten die Vormerkung.',
        'The fresh example already has the upper README block in the index. The working file also changes the Next steps entry. We will discard only that remaining edit and preserve the staged block.',
      ],
      row('unstaged'),
      { continue: false, openView: undefined, prepare: before },
    ),
    s(
      'open-diff',
      ['Öffne README.md unter Änderungen', 'Open README.md under Changes'],
      [
        'Klicke die Datei unter Änderungen, nicht unter Vorgemerkt. Hier siehst du den Unterschied zwischen Index und Arbeitsordner.',
        'Click the file under Changes, rather than Staged. This shows the difference between index and worktree.',
      ],
      row('unstaged'),
      { openView: undefined, prepare: before, completion: element(`${viewer}[data-source="unstaged"] ${block()}`) },
    ),
    s(
      'remaining',
      ['Der vorgemerkte Block gehört nicht zu diesem Diff', 'The staged block is outside this diff'],
      [
        'Der Diff enthält nur die Ersetzung „Check files“ durch „Compare changes“. Begrüßung, Autor und Status stehen schon im Index und werden hier nicht erneut als Arbeitsänderungen gezeigt.',
        'The diff contains only “Check files” becoming “Compare changes”. Greeting, author and status are already in the index and are not shown as additional worktree edits.',
      ],
      block(),
      { prepare: before },
    ),
    s(
      'scope',
      ['Verwerfen ändert den Arbeitsordner', 'Discard changes the worktree'],
      [
        'Der rote Verwerfen-Button gehört nur zu diesem Hunk. Er stellt dessen Indexstand im Arbeitsordner wieder her. Die Vormerkung selbst bleibt erhalten. Zuerst öffnen wir den Dialog und brechen ab.',
        'The red Discard button belongs only to this hunk. It restores the index version of those lines in the worktree. The staged change is preserved. First we open the dialog and cancel.',
      ],
      button('discard'),
      { prepare: before },
    ),
    s(
      'open-confirm',
      ['Öffne die Hunk-Bestätigung', 'Open hunk confirmation'],
      [
        'Klicke Verwerfen am Hunk. Vor der Bestätigung soll sich noch kein Dateiinhalt ändern.',
        'Click Discard on the hunk. No file contents should change before confirmation.',
      ],
      button('discard'),
      { prepare: before, completion: element(dialog) },
    ),
    s(
      'warning',
      ['Prüfe Datei und Hunk-Kopfzeile', 'Review the file and hunk header'],
      [
        'Die Bestätigung nennt README.md und die @@-Kopfzeile des betroffenen Blocks. Verworfene, zuvor nicht gespeicherte Bearbeitungen lassen sich nicht zuverlässig aus Git zurückholen. Der Dialog bietet bewusst Abbrechen an.',
        'Confirmation names README.md and the affected block’s @@ header. Edits discarded before being saved cannot reliably be recovered from Git. The dialog provides Cancel deliberately.',
      ],
      dialog,
      { prepare: seed('first', 'unstaged', { click: [button('discard')] }) },
    ),
    s(
      'cancel',
      ['Brich das Verwerfen ab', 'Cancel discarding'],
      ['Klicke Abbrechen. Die Änderung bei Next steps soll unverändert bleiben.', 'Click Cancel. The Next steps edit should remain intact.'],
      cancelDialog,
      { prepare: seed('first', 'unstaged', { click: [button('discard')] }), completion: { kind: 'absent', selector: dialog } },
    ),
    s(
      'preserved',
      ['Abbrechen hat nichts zurückgesetzt', 'Cancel did not restore anything'],
      [
        'Die entfernte und neue Zeile sind weiterhin sichtbar. Der Index enthält nach wie vor den ersten Block. Jetzt probieren wir dieselbe Aktion mit Bestätigung aus.',
        'The removed and added lines are still visible. The index still contains the first block. Next we try the same action and confirm it.',
      ],
      block(),
      { prepare: before },
    ),
    s(
      'reopen',
      ['Öffne den Dialog erneut', 'Reopen the dialog'],
      [
        'Klicke noch einmal Verwerfen an diesem Hunk. Prüfe erneut, dass README.md und der passende Block genannt werden.',
        'Click Discard on this hunk again. Check that the dialog identifies README.md and the intended block.',
      ],
      button('discard'),
      { prepare: before, completion: element(dialog) },
    ),
    s(
      'confirm-discard',
      ['Verwirf nur den verbleibenden Arbeitsblock', 'Discard only the remaining worktree block'],
      [
        'Bestätige Verwerfen. Die Arbeitsdatei soll anschließend dem Index entsprechen. Der vorgemerkte obere Block und der letzte Commit bleiben unverändert.',
        'Confirm Discard. The working file should then match the index. The staged upper block and the last commit must remain unchanged.',
      ],
      confirmDialog,
      { prepare: seed('first', 'unstaged', { click: [button('discard')] }), completion: diffState('first', 'first') },
    ),
    s(
      'result',
      ['Der Arbeits-Diff ist jetzt leer', 'The worktree diff is now empty'],
      [
        'Für diese Datei gibt es keine Unterschiede mehr zwischen Arbeitsordner und Index. Die drei vorgemerkten Ersetzungen sind noch immer für den nächsten Commit ausgewählt.',
        'This file now has no differences between worktree and index. The three staged replacements are still selected for the next commit.',
      ],
      '.diff-empty-state',
      { prepare: after },
    ),
    s(
      'close-diff',
      ['Kehre zur Dateiliste zurück', 'Return to the file list'],
      ['Schließe den Viewer. Die README soll ausschließlich unter Vorgemerkt stehen.', 'Close the viewer. README should appear only under Staged.'],
      c('close-file'),
      { prepare: after, completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'staged-result',
      ['Die Vormerkung wurde erhalten', 'The staged change was preserved'],
      [
        'README.md steht weiterhin unter Vorgemerkt. Im Bereich Änderungen gibt es für sie keinen Eintrag mehr. Unstage würde jetzt die Vormerkung zurücknehmen, während die Arbeitsdatei erhalten bliebe.',
        'README.md remains under Staged. It no longer has an entry under Changes. Unstage would now remove its staged change while preserving the working file.',
      ],
      row('staged'),
      { openView: undefined, prepare: closed },
    ),
    s(
      'finish',
      ['Prüfe beim Verwerfen immer Quelle und Umfang', 'Always check source and scope before discarding'],
      [
        'Du hast das Hunk-Verwerfen abgebrochen und bestätigt und dabei den Index erhalten. Für kleinere Commit-Auswahlen bietet der Diff außerdem Zeilenpaare und Bereichsauswahl; diese übst du in der nächsten Lektion.',
        'You canceled and confirmed hunk discard while preserving the index. For smaller commit selections, the diff also offers line pairs and range selection; those are covered in the next lesson.',
      ],
      c('staging'),
      { openView: undefined, prepare: closed },
    ),
  ],
};
