import type { TutorialCompletion, TutorialStep } from './types';
import { conflictMultipleRecipe, multipleContent, multipleEditor } from './conflictMultipleHelpers';
import { conflictControl as c } from './conflictLessonHelpers';
import { mergeHead } from './mergeLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer, historyTreeRecipe } from './historyLessonHelpers';
import { fileTab, fileControl } from './fileLessonHelpers';
import { stagingRow } from './stagingLessonHelpers';
export const deletionResolved: TutorialCompletion = {
  kind: 'all',
  conditions: [
    { kind: 'element', selector: c('continue') },
    {
      kind: 'working-tree',
      staged: ['LICENSE', 'README.md'],
      unstaged: [],
      untracked: [],
      absent: ['LICENSE'],
      content: [{ path: 'README.md', source: 'index', value: multipleContent('incoming') }],
    },
  ],
};
const stages = ['ready', 'deleted', 'continued', 'commit', 'diff'] as const;
type Stage = (typeof stages)[number];
export function conflictDeletionRecipe(stage: Stage = 'ready', options: { stagedDiff?: boolean; tree?: boolean } = {}): NonNullable<TutorialStep['prepare']> {
  const phase = stages.indexOf(stage),
    base = conflictMultipleRecipe('open'),
    actions = [...base.actions!];
  actions.push(
    { click: c('all-theirs') },
    { waitValue: { selector: c('content'), value: multipleContent('incoming') } },
    { click: c('save-resolved') },
    { waitFor: multipleEditor('LICENSE', 0) },
    { waitFor: c('section') + '[data-conflict-files="1"]' },
  );
  let ready = multipleEditor('LICENSE', 0);
  if (phase >= 1) {
    actions.push(
      { click: c('delete') },
      { waitFor: c('section') + '[data-conflict-files="0"]' },
      { waitFor: 'body:not(:has([data-tutorial="conflict-editor"]))' },
    );
    ready = c('continue');
  }
  if (options.stagedDiff) {
    actions.push({ click: stagingRow('staged', 'LICENSE') }, { waitFor: historyViewer('staged', 'LICENSE') }, { click: fileTab('diff') });
    ready = historyViewer('staged', 'LICENSE') + '[data-tab="diff"]';
  }
  if (phase >= 2) {
    actions.push({ click: c('continue') }, { waitFor: mergeHead(6) });
    ready = mergeHead(6);
  }
  if (phase >= 3) {
    actions.push({ click: graphRow(6) }, { waitFor: commitPanel(6) + ' ' + commitFile('LICENSE') });
    ready = commitPanel(6);
  }
  if (phase >= 4) {
    actions.push({ click: commitPanel(6) + ' ' + commitFile('LICENSE') }, { waitFor: historyViewer(6, 'LICENSE') }, { click: fileTab('diff') });
    ready = historyViewer(6, 'LICENSE') + '[data-tab="diff"]';
  }
  if (options.tree) {
    actions.push(...historyTreeRecipe().actions!, { waitFor: fileControl('open-files') + '[aria-pressed="true"]' });
    ready = fileControl('open-files') + '[aria-pressed="true"]';
  }
  return { ...base, actions, ready };
}
