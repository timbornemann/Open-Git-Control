import type { TutorialStep, TutorialText } from './types';
import { resetStep as s, resetRecipe as recipe, type ResetMode } from './resetLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
import { graphRow, historyViewer, fileRow, fileTab } from './historyLessonHelpers';
import { stagingRow } from './stagingLessonHelpers';
import { fileControl } from './fileLessonHelpers';
const indexText: Record<ResetMode, TutorialText> = {
  soft: [
    'Der Index enthält weiter Hallo Staging. Zusätzlich ist src/app.ts gegenüber dem neuen HEAD vorgemerkt: Die letzte Commit-Änderung liegt nun im Index außerhalb der zurückgesetzten Historie.',
    'The index still contains Hello Staging. src/app.ts is also staged against the new HEAD: the latest commit’s change is now in the index outside the reset history.',
  ],
  mixed: [
    'Der Index entspricht jetzt dem dritten Commit. Die frühere nur vorgemerkte Staging-Fassung ist dadurch ersetzt. Es gibt noch keine neue Vormerkung der erhaltenen Arbeitsdateien.',
    'The index now matches the third commit. This replaced the earlier staged-only Staging version. The retained working files have not been staged again yet.',
  ],
  hard: [
    'Der Index entspricht dem dritten Commit. Die frühere vorgemerkte Staging-Fassung ist verworfen. Es gibt in diesem Beispiel keine vorgemerkten Änderungen mehr.',
    'The index matches the third commit. The earlier staged Staging version was discarded. This example has no staged changes now.',
  ],
};
const workText: Record<ResetMode, TutorialText> = {
  soft: [
    'Die README im Arbeitsordner enthält weiter Hallo Team. Dieser spätere Entwurf liegt wie vorher außerhalb des Index und bleibt als zusätzliche Arbeitsänderung sichtbar.',
    'The working README still contains Hello team. This later draft remains outside the index as before and is visible as an additional working change.',
  ],
  mixed: [
    'README.md mit Hallo Team und die aktuelle App-Datei sind unverändert im Arbeitsordner vorhanden. Ihre Unterschiede zum neuen Index erscheinen jetzt vollständig unter Änderungen.',
    'README.md with Hello team and the current app file remain unchanged in the working directory. Their differences from the new index now appear entirely under Changes.',
  ],
  hard: [
    'Die erfassten Arbeitsdateien entsprechen jetzt dem dritten Commit. Der spätere Team-Entwurf ist verworfen. Die unabhängige neue Notiz bleibt als unversionierte Datei erhalten.',
    'Tracked working files now match the third commit. The later Team draft was discarded. The independent new note remains as an untracked file.',
  ],
};
const closed = { kind: 'absent' as const, selector: '.file-viewer' };
const resultDiffSteps = (mode: ResetMode, source: 'staged' | 'unstaged'): TutorialStep[] => {
  const stage = source === 'staged' ? 'after-staged' : 'after-work';
  return [
    s(
      'open-' + source + '-result',
      [
        source === 'staged' ? 'Prüfe die erhaltene Vormerkung' : 'Prüfe die erhaltene Arbeitsänderung',
        source === 'staged' ? 'Inspect the retained staged version' : 'Inspect the retained working change',
      ],
      [
        'Öffne README.md in diesem Bereich. Der Vergleich macht die Wirkung des neuen HEAD beziehungsweise Index sichtbar.',
        'Open README.md in this section. The comparison makes the effect of the new HEAD or index visible.',
      ],
      stagingRow(source, 'README.md'),
      { prepare: recipe(mode, 'directory'), completion: element(historyViewer(source)) },
    ),
    s(
      'diff-' + source + '-result',
      ['Lies die beiden Fassungen nach dem Reset', 'Read both versions after reset'],
      source === 'staged' ? indexText[mode] : workText[mode],
      '.file-viewer-diff',
      { prepare: recipe(mode, stage) },
    ),
    s(
      'close-' + source + '-result',
      ['Schließe den Vergleich', 'Close the comparison'],
      [
        'Kehre zur Arbeitsansicht zurück. Das Lesen hat keine weitere Vormerkung erzeugt.',
        'Return to the working view. Reading created no additional staged change.',
      ],
      fileControl('close-file'),
      { prepare: recipe(mode, stage), completion: closed },
    ),
  ];
};
export const resetResultSteps = (mode: ResetMode): TutorialStep[] => [
  s(
    'head-result',
    ['main zeigt jetzt auf den dritten Commit', 'main now points to the third commit'],
    [
      'HEAD und main wurden auf das gewählte Ziel gesetzt. Der Reset hat keinen neuen Commit erzeugt.',
      'HEAD and main moved to the selected target. Reset did not create a new commit.',
    ],
    mergeHead(3),
    { prepare: recipe(mode, 'result') },
  ),
  s(
    'old-commit',
    ['Der Beispielbranch hält den früheren HEAD erreichbar', 'The sample branch keeps the former HEAD reachable'],
    [
      'feature/begruessung zeigt weiter auf den vierten Commit. Der Reset des aktiven main verschiebt diesen anderen Branch nicht.',
      'feature/begruessung still points to the fourth commit. Resetting active main does not move that other branch.',
    ],
    graphRow(4) + ' .commit-refs',
    { prepare: recipe(mode, 'result') },
  ),
  s(
    'close-inspector',
    ['Kehre zur Arbeitsansicht zurück', 'Return to the working view'],
    [
      'Schließe die Commit-Details, um den Zustand von Index und Arbeitsdateien im Staging zu prüfen.',
      'Close commit details to inspect index and working-file state in staging.',
    ],
    '[data-tutorial="close-inspector"]',
    { prepare: recipe(mode, 'result'), completion: element('[data-tutorial="staging"]') },
  ),
  s(
    'index-result',
    ['Prüfe den Index nach dem Reset', 'Check the index after reset'],
    indexText[mode],
    mode === 'soft' ? '[data-tutorial="staged-files"]' : '[data-tutorial="staging"]',
    { prepare: recipe(mode, 'directory') },
  ),
  s(
    'work-result',
    ['Prüfe die Arbeitsänderungen getrennt', 'Check working changes separately'],
    workText[mode],
    mode === 'hard' ? '[data-tutorial="staging"]' : '[data-tutorial="unstaged-files"]',
    { prepare: recipe(mode, 'directory') },
  ),
  s(
    'note',
    ['Die unabhängige neue Notiz bleibt erhalten', 'The independent new note remains intact'],
    [
      'notes.txt ist in keinem der gespeicherten Zielbäume enthalten und steht keinem Zielpfad im Weg. Sie bleibt unversioniert im Arbeitsordner erhalten.',
      'notes.txt is absent from the saved target trees and obstructs no target path. It remains untracked in the working directory.',
    ],
    stagingRow('untracked', 'notes.txt'),
    { prepare: recipe(mode, 'directory') },
  ),
  ...(mode === 'soft' ? resultDiffSteps(mode, 'staged') : []),
  ...(mode !== 'hard' ? resultDiffSteps(mode, 'unstaged') : []),
  s(
    'tree',
    ['Öffne die aktuellen Arbeitsdateien', 'Open current working files'],
    ['Wähle Working Directory, um die aktuelle README unmittelbar zu lesen.', 'Choose Working Directory to read the current README directly.'],
    fileControl('open-files'),
    { prepare: recipe(mode, 'directory'), completion: element(fileControl('open-files') + '[aria-pressed="true"]') },
  ),
  s(
    'open-readme',
    ['Öffne README.md aus dem Dateibaum', 'Open README.md from the file tree'],
    ['Öffne die aktuelle Datei und prüfe den nach dem Reset verbliebenen Inhalt.', 'Open the current file and inspect the contents remaining after reset.'],
    fileRow('README.md'),
    { prepare: recipe(mode, 'tree'), completion: element(historyViewer()) },
  ),
  s(
    'text',
    ['Wähle die Textansicht', 'Choose the text view'],
    [
      'Wähle Text. Wir lesen hier die aktuelle Arbeitsdatei unabhängig von ihrem Indexvergleich.',
      'Choose Text. We are reading the current working file independently of its index comparison.',
    ],
    fileTab('text'),
    { prepare: recipe(mode, 'text'), completion: element(historyViewer() + '[data-tab="text"]') },
  ),
  s('contents', ['Der Arbeitsinhalt bestätigt die gewählte Wirkung', 'The working contents confirm the chosen effect'], workText[mode], historyViewer(), {
    prepare: recipe(mode, 'text'),
  }),
  s(
    'close-file',
    ['Schließe die Inhaltsprüfung', 'Close the content check'],
    ['Schließe den Dateibetrachter und kehre zum Graphen zurück.', 'Close the file viewer and return to the graph.'],
    fileControl('close-file'),
    { prepare: recipe(mode, 'text'), completion: closed },
  ),
  s(
    'done',
    ['HEAD, Index und Arbeitsdatei einzeln geprüft', 'Checked HEAD, index and working file separately'],
    [
      'Du hast den Modus und seine Bestätigung geprüft, zunächst abgebrochen und anschließend die tatsächliche Wirkung untersucht. Weiter beendet diese Lektion.',
      'You reviewed the mode and confirmation, canceled first, then inspected its actual effect. Next finishes this lesson.',
    ],
    mergeHead(3),
    { prepare: recipe(mode, 'result') },
  ),
];
