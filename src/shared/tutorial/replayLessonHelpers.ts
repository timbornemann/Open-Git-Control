import type { TutorialStep } from './types';
import { branchRecipe, branchControl } from './branchLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer, fileRow, fileTab } from './historyLessonHelpers';
import { mergeHead, mergeStep } from './mergeLessonHelpers';
export const replayStep = mergeStep;
export type ReplayOperation = 'cherry-pick' | 'revert';
export const replayMenu = (operation: ReplayOperation) => '[data-tutorial="graph-' + operation + '"]';
export type ReplayStage = 'start' | 'source' | 'source-diff' | 'menu' | 'result' | 'selected-result' | 'result-diff' | 'working' | 'tree' | 'work';
/** Each direct entry uses the same context-menu action as the learner. */
export function replayRecipe(operation: ReplayOperation, stage: ReplayStage = 'start'): NonNullable<TutorialStep['prepare']> {
  const picked = operation === 'cherry-pick',
    source = picked ? 2 : 4,
    initial = picked ? 1 : 4;
  const base = branchRecipe();
  const actions = [...base.actions!, { waitFor: mergeHead(initial) }];
  let ready = mergeHead(initial);
  if (stage !== 'start') {
    actions.push({ click: graphRow(source) }, { waitFor: commitPanel(source) + ' ' + commitFile() });
    ready = commitPanel(source);
  }
  if (stage === 'source-diff') {
    actions.push({ click: commitPanel(source) + ' ' + commitFile() }, { waitFor: historyViewer(source) }, { click: fileTab('diff') });
    ready = historyViewer(source) + '[data-tab="diff"]';
  }
  if (!['start', 'source', 'source-diff'].includes(stage)) {
    actions.push({ contextMenu: graphRow(source) }, { waitFor: replayMenu(operation) });
    ready = replayMenu(operation);
  }
  if (!['start', 'source', 'source-diff', 'menu'].includes(stage)) {
    actions.push({ click: replayMenu(operation) }, { waitFor: mergeHead(5) }, { waitFor: 'body:not(:has(.commit-context-menu))' });
    ready = mergeHead(5);
  }
  if (['selected-result', 'result-diff'].includes(stage)) {
    actions.push({ click: graphRow(5) }, { waitFor: commitPanel(5) + ' ' + commitFile() });
    ready = commitPanel(5);
  }
  if (stage === 'result-diff') {
    actions.push({ click: commitPanel(5) + ' ' + commitFile() }, { waitFor: historyViewer(5) }, { click: fileTab('diff') });
    ready = historyViewer(5) + '[data-tab="diff"]';
  }
  if (stage === 'working' || stage === 'tree' || stage === 'work') {
    actions.push({ click: '[data-tutorial="close-inspector"]' }, { expand: branchControl('inspector-toggle') }, { waitFor: '[data-tutorial="open-files"]' });
    ready = '[data-tutorial="open-files"]';
  }
  if (stage === 'tree' || stage === 'work') {
    actions.push(
      { expand: branchControl('inspector-toggle') },
      { click: '[data-tutorial="open-files"]' },
      { waitFor: '[data-tutorial="open-files"][aria-pressed="true"]' },
      { waitFor: fileRow('README.md') },
    );
    ready = fileRow('README.md');
  }
  if (stage === 'work') {
    actions.push({ click: fileRow('README.md') }, { waitFor: historyViewer() }, { click: fileTab('text') });
    ready = historyViewer() + '[data-tab="text"]';
  }
  return {
    ...base,
    branches: {
      heads: [
        { name: 'main', commit: initial },
        { name: 'feature/begruessung', commit: picked ? 2 : 1 },
      ],
      remotes: [{ name: 'origin/main', commit: picked ? 1 : 2 }],
      current: 'main',
    },
    actions,
    ready,
  };
}
