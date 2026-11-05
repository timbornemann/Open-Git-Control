import type { TutorialStep } from './types';
import { resetStep as s, resetRecipe as recipe, type ResetMode } from './resetLessonHelpers';
import { stagingRow } from './stagingLessonHelpers';
import { graphRow, commitPanel, historyViewer, fileTab } from './historyLessonHelpers';
import { fileControl } from './fileLessonHelpers';
import { element } from './mergeLessonHelpers';
const closed = { kind: 'absent' as const, selector: '.file-viewer' };
export const resetStartingSteps = (mode: ResetMode): TutorialStep[] => [
  s(
    'planes',
    ['Drei getrennte Zustände derselben Datei', 'Three separate states of the same file'],
    [
      'HEAD enthält Hallo Welt, der Index Hallo Staging und die spätere Arbeitsdatei Hallo Team. Die README steht deshalb sowohl unter Vorgemerkt als auch unter Änderungen.',
      'HEAD contains Hello world, the index Hello Staging and the later working file Hello team. The README therefore appears under both Staged and Changes.',
    ],
    '[data-tutorial="staging"]',
    { prepare: recipe(mode) },
  ),
  s(
    'open-index',
    ['Öffne zuerst den vorgemerkten Unterschied', 'First open the staged difference'],
    [
      'Klicke README.md unter Vorgemerkt. Dieser Diff vergleicht HEAD mit dem Index, nicht mit dem späteren Arbeitsentwurf.',
      'Click README.md under Staged. This diff compares HEAD with the index rather than the later working draft.',
    ],
    stagingRow('staged', 'README.md'),
    { prepare: recipe(mode), completion: element(historyViewer('staged')) },
  ),
  s(
    'index-tab',
    ['Wähle den Index-Diff', 'Choose the index diff'],
    ['Wähle Diff. Dieser Vergleich zeigt den vorgemerkten Inhalt gegen HEAD.', 'Choose Diff. This comparison shows staged contents against HEAD.'],
    fileTab('diff'),
    { prepare: recipe(mode, 'before-staged'), completion: element(historyViewer('staged') + '[data-tab="diff"]') },
  ),
  s(
    'index-before',
    ['Der Index enthält eine eigene Fassung', 'The index contains its own version'],
    [
      'Der vorgemerkte Text begrüßt Staging. Er ist getrennt vom späteren Team-Entwurf gespeichert. Beim Reset müssen wir deshalb Index und Arbeitsdatei einzeln betrachten.',
      'The staged text greets Staging. It is stored separately from the later Team draft. Reset therefore requires considering the index and working file separately.',
    ],
    '.file-viewer-diff',
    { prepare: recipe(mode, 'before-staged') },
  ),
  s(
    'close-index',
    ['Schließe den vorgemerkten Vergleich', 'Close the staged comparison'],
    ['Schließe den Betrachter, um anschließend die spätere Arbeitsänderung zu prüfen.', 'Close the viewer before inspecting the later working change.'],
    fileControl('close-file'),
    { prepare: recipe(mode, 'before-staged'), completion: closed },
  ),
  s(
    'open-work',
    ['Öffne die nicht vorgemerkte README', 'Open the unstaged README'],
    [
      'Klicke README.md unter Änderungen. Dieser Diff vergleicht den Index mit der aktuellen Arbeitsdatei.',
      'Click README.md under Changes. This diff compares the index with the current working file.',
    ],
    stagingRow('unstaged', 'README.md'),
    { prepare: recipe(mode), completion: element(historyViewer()) },
  ),
  s(
    'work-tab',
    ['Wähle den Arbeits-Diff', 'Choose the working diff'],
    ['Wähle Diff, um den Arbeitsinhalt mit dem Index zu vergleichen.', 'Choose Diff to compare working contents with the index.'],
    fileTab('diff'),
    { prepare: recipe(mode, 'before-work'), completion: element(historyViewer() + '[data-tab="diff"]') },
  ),
  s(
    'work-before',
    ['Der spätere Team-Entwurf liegt außerhalb des Index', 'The later Team draft is outside the index'],
    [
      'Der Vergleich zeigt die Änderung von Hallo Staging zu Hallo Team. Diese spätere Fassung ist noch nicht vorgemerkt.',
      'The comparison shows the change from Hello Staging to Hello team. This later version is not staged yet.',
    ],
    '.file-viewer-diff',
    { prepare: recipe(mode, 'before-work') },
  ),
  s(
    'close-work',
    ['Schließe auch den Arbeitsvergleich', 'Close the working comparison too'],
    [
      'Kehre zum Graphen zurück. Wir wählen nun den gespeicherten Zielstand des Resets.',
      'Return to the graph. We will now select the reset’s saved target revision.',
    ],
    fileControl('close-file'),
    { prepare: recipe(mode, 'before-work'), completion: closed },
  ),
  s(
    'select',
    ['Wähle den dritten Commit als Ziel', 'Select the third commit as the target'],
    [
      'Klicke den Dokumentationscommit vor der letzten Begrüßungsänderung. Der Reset wird main auf diesen vorhandenen Stand setzen.',
      'Click the documentation commit before the latest greeting change. Reset will move main to this existing revision.',
    ],
    graphRow(3),
    { prepare: recipe(mode), completion: element(commitPanel(3)) },
  ),
  s(
    'target',
    ['Der Zielstand ist ein vorhandener Commit', 'The target is an existing commit'],
    [
      'Der dritte Commit enthält die Projektübersicht. Die letzte Begrüßungsänderung liegt danach. Der Beispielbranch feature/begruessung hält den bisherigen vierten Commit zusätzlich erreichbar.',
      'The third commit contains the project overview. The latest greeting change follows it. The sample feature/begruessung branch also keeps the previous fourth commit reachable.',
    ],
    graphRow(3),
    { prepare: recipe(mode, 'source') },
  ),
];
