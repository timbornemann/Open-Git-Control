import type { MergeConflictExample, TutorialCompletion, TutorialFileContent, TutorialStep } from './types';
import { conflictRecipe, conflictControl as c } from './conflictLessonHelpers';
import { mergeHead, mergeConfirm, mergeCancel } from './mergeLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer, blameLine, historyList } from './historyLessonHelpers';
import { fileTab } from './fileLessonHelpers';

export const multipleContent = (version: MergeConflictExample): TutorialFileContent => ({ example: 'merge-conflicts', version });
export const multipleEditor = (path: string, blocks?: number) =>
  c('editor') + '[data-conflict-path=' + JSON.stringify(path) + ']' + (blocks === undefined ? '' : '[data-conflict-blocks="' + blocks + '"]');
export const multiplePosition = (block: number, file = 2) =>
  c('position') + '[data-conflict-file-index="' + file + '"][data-conflict-block-index="' + block + '"]';
export const multipleDraft = (version: MergeConflictExample): TutorialCompletion => ({
  kind: 'value',
  selector: c('content'),
  value: multipleContent(version),
});
export const multipleResolved: TutorialCompletion = {
  kind: 'all',
  conditions: [
    { kind: 'absent', selector: c('editor') },
    { kind: 'element', selector: c('continue') },
    {
      kind: 'working-tree',
      staged: ['README.md'],
      unstaged: [],
      untracked: [],
      content: [{ path: 'README.md', source: 'index', value: multipleContent('mixed') }],
    },
  ],
};
const stages = [
  'start',
  'open',
  'second',
  'first',
  'chosen',
  'review',
  'cancelled',
  'saved',
  'license',
  'returned',
  'mixed',
  'readme-resolved',
  'resolved',
  'continued',
  'commit',
  'diff',
  'text',
  'blame',
  'history',
] as const;
export type MultipleStage = (typeof stages)[number];
/** Replays the learner's choices, guarded file switch and partial save. */
export function conflictMultipleRecipe(stage: MultipleStage = 'start'): NonNullable<TutorialStep['prepare']> {
  const phase = stages.indexOf(stage),
    base = conflictRecipe();
  const actions = [...base.actions!];
  let ready = base.ready!;
  if (phase >= 1) {
    actions.push({ click: c('open') + '[data-conflict-path="README.md"]' }, { waitFor: multipleEditor('README.md', 2) });
    ready = multiplePosition(1);
  }
  if (phase >= 2) {
    actions.push({ click: c('next') }, { waitFor: multiplePosition(2) });
    ready = multiplePosition(2);
  }
  if (phase >= 3) {
    actions.push({ click: c('previous') }, { waitFor: multiplePosition(1) });
    ready = multiplePosition(1);
  }
  if (phase >= 4) {
    actions.push({ click: c('take-theirs') }, { waitValue: { selector: c('content'), value: multipleContent('first-incoming') } });
    ready = multipleEditor('README.md', 1) + '[data-conflict-dirty="true"]';
  }
  if (phase >= 5) {
    actions.push({ click: c('previous') }, { waitFor: mergeConfirm });
    ready = mergeConfirm;
  }
  if (phase >= 6) {
    actions.push({ click: mergeCancel }, { waitFor: 'body:not(:has([data-dialog-action="confirm"]))' });
    ready = multipleEditor('README.md', 1);
  }
  if (phase >= 7) {
    actions.push({ click: c('save') }, { waitFor: multipleEditor('README.md', 1) + '[data-conflict-dirty="false"]' });
    ready = multipleEditor('README.md', 1);
  }
  if (phase >= 8) {
    actions.push({ click: c('previous') }, { waitFor: multipleEditor('LICENSE', 0) });
    ready = multipleEditor('LICENSE', 0);
  }
  if (phase >= 9) {
    actions.push({ click: c('next') }, { waitFor: multipleEditor('README.md', 1) });
    ready = multipleEditor('README.md', 1);
  }
  if (phase >= 10) {
    actions.push({ click: c('take-ours') }, { waitValue: { selector: c('content'), value: multipleContent('mixed') } });
    ready = multipleEditor('README.md', 0) + '[data-conflict-dirty="true"]';
  }
  if (phase >= 11) {
    actions.push({ click: c('save-resolved') }, { waitFor: multipleEditor('LICENSE', 0) }, { waitFor: c('section') + '[data-conflict-files="1"]' });
    ready = multipleEditor('LICENSE', 0);
  }
  if (phase >= 12) {
    actions.push(
      { click: c('mark') },
      { waitFor: c('section') + '[data-conflict-files="0"]' },
      { waitFor: 'body:not(:has([data-tutorial="conflict-editor"]))' },
    );
    ready = c('continue');
  }
  if (phase >= 13) {
    actions.push({ click: c('continue') }, { waitFor: mergeHead(6) });
    ready = mergeHead(6);
  }
  if (phase >= 14) {
    actions.push({ click: graphRow(6) }, { waitFor: commitPanel(6) + ' ' + commitFile() });
    ready = commitPanel(6);
  }
  if (phase >= 15) {
    actions.push({ click: commitPanel(6) + ' ' + commitFile() }, { waitFor: historyViewer(6) }, { click: fileTab('diff') });
    ready = historyViewer(6) + '[data-tab="diff"]';
  }
  if (phase >= 16) {
    actions.push({ click: fileTab('text') });
    ready = historyViewer(6) + '[data-tab="text"]';
  }
  if (phase >= 17) {
    actions.push({ click: fileTab('blame') }, { waitFor: blameLine(3, 5) }, { waitFor: blameLine(10, 4) });
    ready = historyViewer(6) + '[data-tab="blame"]';
  }
  if (phase >= 18) {
    actions.push({ click: fileTab('history') }, { waitFor: historyList(5, 4, 3, 2, 1) });
    ready = historyViewer(6) + '[data-tab="history"]';
  }
  return { ...base, branches: { ...base.branches!, fixture: 'diverged-conflicts' }, actions, ready };
}
