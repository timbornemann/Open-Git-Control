import type { TutorialChapter } from './types';
import {
  scopeStep as s,
  scopeRecipe as seed,
  stagingControl as c,
  stagingRow as row,
  dialog,
  confirmDialog,
  cancelDialog,
  readmeHead,
  readmeIndex,
  readmeLater,
  newScopeFiles as fresh,
  tree,
  element,
} from './stagingLessonHelpers';
const discard = `${row('unstaged', 'README.md')} ${c('discard-file')}`;
const section = c('discard-modified-section');
const filteredSection = `${c('staging')}:not(:has([aria-label="package.json"])) ${section}`;
const stagedCopy = { staged: ['README.md'], edits: [{ path: 'README.md', content: readmeLater }] };
const unchanged = tree(['src/app.ts'], ['package.json'], fresh, { content: [{ path: 'README.md', source: 'worktree', value: readmeHead }] });
export const TUTORIAL_STAGING_DISCARD: TutorialChapter = {
  id: 'staging-discard',
  section: 'repo',
  title: ['Verwerfen: Dialog, Dateistand und Suchfilter', 'Discard: confirmation, file versions and search scope'],
  description: [
    'Abbrechen, einzelne Änderungen verwerfen, den Indexstand erhalten und den Umfang von Bereichsaktionen praktisch prüfen.',
    'Practice Cancel, discarding individual edits, preserving the index and reviewing section scope.',
  ],
  question: ['Wie verwerfe ich Änderungen und was bleibt dabei erhalten?', 'How do I discard edits and what is preserved?'],
  keywords: 'discard verwerfen checkout restore index unstaged ungestagt dialog abbrechen cancel bestätigung scope filter',
  steps: [
    s(
      'overview',
      ['Verwerfen verändert den Arbeitsordner', 'Discard changes the working directory'],
      [
        'Aus dem Index nehmen ändert deine Commit-Auswahl. Verwerfen ersetzt dagegen die ungestagten Inhalte durch die vorgemerkte Version. Git kann verworfene Zeilen ohne gespeicherten Stand nicht zurückholen. Wir üben mit vorbereiteten Beispielen und dem echten Bestätigungsdialog.',
        'Unstaging changes your commit selection. Discard replaces unstaged contents with the indexed version. Git cannot recover discarded lines without a saved version. We practice with prepared samples and the real confirmation dialog.',
      ],
      undefined,
      { continue: false },
    ),
    s(
      'button',
      ['Die Verwerfen-Aktion erkennen', 'Recognize the discard action'],
      [
        'Das rote x in der geänderten README-Zeile gehört zum Verwerfen. Das Plus daneben würde die Datei vormerken. Lies die Beschriftung, bevor du eine der beiden Aktionen auswählst.',
        'The red x in the modified README row discards edits. The plus beside it stages the file. Read the label before choosing an action.',
      ],
      discard,
    ),
    s(
      'open-confirm',
      ['Öffne die Bestätigung für README', 'Open confirmation for README'],
      [
        'Klicke das rote x bei README.md im Bereich Änderungen. Es erscheint zuerst eine Bestätigung; bis dahin sind die Dateiinhalte unverändert.',
        'Click the red x beside README.md in Changes. A confirmation appears first; the file contents have not changed yet.',
      ],
      discard,
      { completion: element(dialog) },
    ),
    s(
      'scope',
      ['Lies Datei, Umfang und Folgen', 'Read the file, scope and consequences'],
      [
        'Der Dialog nennt README.md, den ungestagten Arbeitsordner und die Folgen. Die Bestätigung gilt für diese Auswahl. Du kannst sie mit Abbrechen oder Escape schließen. Prüfe besonders den Pfad, wenn mehrere Dateien ähnlich heißen.',
        'The dialog identifies README.md, unstaged working-tree changes and the consequences. Confirmation applies to this selection. Cancel or Escape closes it. Check the path carefully when files have similar names.',
      ],
      dialog,
      { prepare: seed({ submit: discard }) },
    ),
    s(
      'cancel',
      ['Brich die Aktion ab', 'Cancel the operation'],
      [
        'Klicke Abbrechen. Die README bleibt geändert und kann weiterhin verglichen oder vorgemerkt werden. Ein abgebrochener Dialog verwirft nichts.',
        'Click Cancel. README stays modified and can still be compared or staged. Canceling discards nothing.',
      ],
      cancelDialog,
      { prepare: seed({ submit: discard }), completion: { kind: 'absent', selector: dialog } },
    ),
    s(
      'cancelled',
      ['Die Änderung ist weiterhin da', 'The edit is still present'],
      [
        'README.md und package.json stehen weiterhin unter Änderungen. src/app.ts bleibt vorgemerkt; notes.txt und docs/ideas.md bleiben neu. Jetzt probieren wir die bestätigte Aktion aus.',
        'README.md and package.json remain in Changes. src/app.ts stays staged; notes.txt and docs/ideas.md remain new. Next we try confirming the operation.',
      ],
      row('unstaged', 'README.md'),
    ),
    s(
      'reopen',
      ['Öffne denselben Dialog erneut', 'Reopen the same dialog'],
      [
        'Klicke noch einmal das rote x bei README.md. Kontrolliere, dass die Bestätigung wieder genau diese Datei nennt.',
        'Click the red x beside README.md again. Check that confirmation names this file.',
      ],
      discard,
      { completion: element(dialog) },
    ),
    s(
      'confirm-discard',
      ['Verwirf die ungestagte README-Änderung', 'Discard the unstaged README edit'],
      [
        'Bestätige Änderungen verwerfen. README.md soll danach aus Änderungen verschwinden. package.json, die vorgemerkte src/app.ts und beide neuen Dateien bleiben erhalten.',
        'Confirm Discard changes. README.md should disappear from Changes. package.json, staged src/app.ts and both untracked files are preserved.',
      ],
      confirmDialog,
      { prepare: seed({ submit: discard }), completion: unchanged },
    ),
    s(
      'result',
      ['Warum die Datei aus der Liste verschwindet', 'Why the file leaves the list'],
      [
        'Die README entspricht jetzt wieder der Indexversion. Sie ist noch im Projektordner vorhanden, hat aber keine ungestagte Abweichung mehr. Im Bereich Änderungen bleibt package.json.',
        'README matches the index again. It still exists in the project folder, but has no unstaged difference. package.json remains in Changes.',
      ],
      c('unstaged-files'),
      { prepare: seed({ restored: ['README.md'] }) },
    ),
    s(
      'staged-case',
      ['Eine Datei kann in beiden Bereichen stehen', 'A file can appear in both sections'],
      [
        'Für dieses neue Beispiel ist README.md vorgemerkt und danach noch einmal bearbeitet worden. Deshalb erscheint sie sowohl vorgemerkt als auch geändert. Die Indexversion enthält die Begrüßung; die spätere Zeile liegt nur im Arbeitsordner.',
        'In this new sample, README.md was staged and then edited again. It therefore appears in both Staged changes and Changes. The index contains the welcome text; the later line exists only in the working directory.',
      ],
      row('unstaged', 'README.md'),
      { continue: false, prepare: seed(stagedCopy) },
    ),
    s(
      'open-staged',
      ['Wähle die ungestagte README-Zeile', 'Choose the unstaged README row'],
      [
        'Klicke das rote x in der README-Zeile unter Änderungen. Die vorgemerkte Zeile darüber bleibt Teil der Commit-Auswahl.',
        'Click the red x in README’s Changes row. The staged row above remains part of the commit selection.',
      ],
      discard,
      { prepare: seed(stagedCopy), completion: element(dialog) },
    ),
    s(
      'index-message',
      ['Der Indexstand bleibt der Ausgangspunkt', 'The index version is the baseline'],
      [
        'Du verwirfst hier die spätere Bearbeitung des Arbeitsordners. Bereits vorgemerkte Inhalte bleiben im Index. Verwerfen ist deshalb auch bei derselben Datei etwas anderes als Minus in der vorgemerkten Zeile.',
        'Here you discard the later working-directory edit. Already staged contents stay in the index. Even for the same file, Discard therefore differs from minus on its staged row.',
      ],
      dialog,
      { prepare: seed({ ...stagedCopy, submit: discard }) },
    ),
    s(
      'confirm-index',
      ['Behalte die vorgemerkte Version', 'Preserve the staged version'],
      [
        'Bestätige das Verwerfen. Danach soll die README weiterhin vorgemerkt sein und keine ungestagte Abweichung mehr haben. Die Begrüßung bleibt für den nächsten Commit ausgewählt.',
        'Confirm Discard. README should remain staged with no unstaged difference. The welcome text remains selected for the next commit.',
      ],
      confirmDialog,
      {
        prepare: seed({ ...stagedCopy, submit: discard }),
        completion: tree(['src/app.ts', 'README.md'], ['package.json'], fresh, {
          content: [
            { path: 'README.md', source: 'worktree', value: readmeIndex },
            { path: 'README.md', source: 'index', value: readmeIndex },
            { path: 'README.md', source: 'head', value: readmeHead },
          ],
        }),
      },
    ),
    s(
      'index-result',
      ['Die Commit-Auswahl ist erhalten', 'The commit selection is preserved'],
      [
        'Die README steht jetzt nur noch unter Vorgemerkte Änderungen. Du hast die spätere Zeile verworfen, ohne die ausgewählte Begrüßung aus dem Index zu nehmen.',
        'README now appears only under Staged changes. You discarded the later line while keeping the selected welcome text in the index.',
      ],
      row('staged', 'README.md'),
      { prepare: seed({ ...stagedCopy, restored: ['README.md'] }) },
    ),
    s(
      'filtered',
      ['Ein gefilterter Bereich begrenzt das Verwerfen', 'A filtered section limits discarding'],
      [
        'Wir beginnen wieder mit zwei geänderten Dateien und suchen nach README. Das rote x Alle Treffer im Bereich Änderungen betrifft nur die angezeigte Auswahl. Die ausgeblendete package.json soll unverändert bleiben.',
        'We start again with two modified files and search for README. The red x All matches in Changes affects only displayed matches. Hidden package.json must remain unchanged.',
      ],
      section,
      { continue: false, prepare: seed({}, 'README') },
    ),
    s(
      'open-filtered',
      ['Öffne die Bereichsbestätigung', 'Open section confirmation'],
      [
        'Klicke x Alle Treffer im Bereich Änderungen. Der Dialog zeigt die Auswahl und den aktiven Suchfilter. Prüfe den Umfang vor dem Bestätigen.',
        'Click x All matches in Changes. The dialog shows the selection and active search filter. Review the scope before confirming.',
      ],
      section,
      { prepare: seed({}, 'README'), completion: element(dialog) },
    ),
    s(
      'confirm-filtered',
      ['Verwirf nur die gefilterte Auswahl', 'Discard the filtered selection only'],
      [
        'Bestätige das Verwerfen der ausgewählten Änderung. Nur README.md wird zurückgesetzt. package.json soll trotz ihrer ausgeblendeten Zeile geändert bleiben.',
        'Confirm discarding the selected edit. Only README.md is restored. package.json must stay modified even though its row is hidden.',
      ],
      confirmDialog,
      { prepare: seed({ submit: filteredSection }, 'README'), completion: unchanged },
    ),
    s(
      'all',
      ['Ohne Filter betrifft der Bereich alle seine Dateien', 'Without a filter, the section affects all its files'],
      [
        'Im letzten Beispiel sind wieder beide geänderten Dateien sichtbar. x Alle im Bereich Änderungen betrifft deren ungestagte Inhalte. Bereits vorgemerkte und unversionierte Dateien gehören weiterhin nicht zu diesem Vorgang.',
        'In the last sample, both modified files are visible again. x All in Changes affects their unstaged contents. Already staged and untracked files are still outside this operation.',
      ],
      section,
      { continue: false, prepare: seed() },
    ),
    s(
      'open-all',
      ['Prüfe die vollständige Bereichsauswahl', 'Review the full section selection'],
      [
        'Klicke x Alle im Bereich Änderungen. Die Bestätigung nennt die zwei geänderten Dateien als Umfang. Das ist kein Löschen des Repositories.',
        'Click x All in Changes. Confirmation identifies the two modified files as its scope. This does not delete the repository.',
      ],
      section,
      { completion: element(dialog) },
    ),
    s(
      'confirm-all',
      ['Verwirf die ungestagten Bereichsänderungen', 'Discard the section’s unstaged edits'],
      [
        'Bestätige den Dialog. README.md und package.json sollen dem Index entsprechen. src/app.ts bleibt vorgemerkt; die zwei neuen Dateien bleiben im Arbeitsordner.',
        'Confirm the dialog. README.md and package.json should match the index. src/app.ts stays staged; both untracked files stay in the working directory.',
      ],
      confirmDialog,
      {
        prepare: seed({ submit: section }),
        completion: tree(['src/app.ts'], [], fresh, { content: [{ path: 'README.md', source: 'worktree', value: readmeHead }] }),
      },
    ),
    s(
      'finish',
      ['Auswahl zurücknehmen, Inhalte verwerfen, Dateien löschen', 'Unstage, discard contents, delete files'],
      [
        'Du hast Abbrechen, einzelne Dateien, einen gefilterten Bereich und den vollständigen Änderungsbereich geübt. Minus nimmt eine Commit-Auswahl zurück; Verwerfen stellt den Indexinhalt wieder her. Neue Dateien brauchen eine eigene Löschaktion, die wir als Nächstes ansehen.',
        'You practiced Cancel, individual files, a filtered section and the full Changes section. Minus removes a commit selection; Discard restores index contents. Untracked files have a separate delete action, which we explore next.',
      ],
      undefined,
      { prepare: seed({ restored: ['.'] }) },
    ),
  ],
};
