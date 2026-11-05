import type { TutorialStep, TutorialText } from './types';
import { step } from './catalogSteps';
import { hunkText, type HunkExample } from './hunkLessonExamples';
import { stagingControl, stagingRow, tree } from './stagingLessonHelpers';

export const diffControl = stagingControl;
export const diffRow = (source: 'staged' | 'unstaged') => stagingRow(source, 'README.md');
export const viewer = '.file-viewer';
export const block = (index = 1) => `.diff-hunk[data-hunk="hunk-${index}"]`;
export const blockControl = (action: string, index = 1) => `${block(index)} ${diffControl(`${action}-hunk`)}`;
export const selectionUnit = (index = 0) => `${block()} [data-selection-unit="hunk-1:${index + 2}"]`;
export const selectionCount = (count: number) => `.diff-selection-bar[data-selection-count="${count}"]`;
export const diffRecipe = (
  index: HunkExample = 'head',
  source: 'staged' | 'unstaged' = 'unstaged',
  extra: NonNullable<TutorialStep['prepare']> = {},
): TutorialStep['prepare'] => ({ indexEdits: [{ path: 'README.md', content: hunkText(index) }], diff: { path: 'README.md', source }, ...extra });
export const diffStep = (id: string, title: TutorialText, description: TutorialText, target = viewer, extra: Partial<TutorialStep> = {}) =>
  step(id, title, description, 'repo', target, { scenario: 'hunks', inspector: 'staging', continue: true, openView: 'diff', ...extra });
export const diffState = (index: HunkExample, work: HunkExample = 'all') =>
  tree(index === 'head' ? [] : ['README.md'], index === work ? [] : ['README.md'], [], {
    content: [
      { path: 'README.md', source: 'head', value: hunkText('head') },
      { path: 'README.md', source: 'index', value: hunkText(index) },
      { path: 'README.md', source: 'worktree', value: hunkText(work) },
    ],
  });
