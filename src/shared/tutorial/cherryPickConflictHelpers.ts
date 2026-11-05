import type { TutorialStep, TutorialCompletion } from './types';
import { branchRecipe } from './branchLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer, fileTab, historyTreeRecipe, fileRow } from './historyLessonHelpers';
import { mergeHead, mergeConfirm, mergeCancel } from './mergeLessonHelpers';
import { replayMenu, replayStep } from './replayLessonHelpers';
import { conflictControl as c, conflictStage, conflictContent } from './conflictLessonHelpers';
export const cherryPickStep = replayStep;
export const cherryControl = (name: string) => '[data-tutorial="cherry-pick-' + name + '"]';
export const cherryResolved: TutorialCompletion = {
  kind: 'all',
  conditions: [
    { kind: 'absent', selector: c('editor') },
    { kind: 'element', selector: cherryControl('continue') },
    { kind: 'working-tree', staged: ['README.md'], unstaged: [], untracked: [], content: [{ path: 'README.md', source: 'index', value: conflictContent }] },
  ],
};
export type CherryStage =
  'start' | 'source' | 'menu' | 'conflicted' | 'chosen' | 'saved' | 'resolved' | 'continued' | 'commit' | 'diff' | 'review' | 'cancelled' | 'aborted';
/** Starts the actual failed action; the app opens its conflict resolver itself. */
export function cherryPickRecipe(stage: CherryStage = 'start', file?: 'tree' | 'work'): NonNullable<TutorialStep['prepare']> {
  const base = branchRecipe();
  const actions = [...base.actions!, { waitFor: mergeHead(4) }];
  let ready = mergeHead(4);
  if (stage !== 'start') {
    actions.push({ click: graphRow(5) }, { waitFor: commitPanel(5) + ' ' + commitFile() });
    ready = commitPanel(5);
  }
  if (!['start', 'source'].includes(stage)) {
    actions.push({ contextMenu: graphRow(5) }, { waitFor: replayMenu('cherry-pick') });
    ready = replayMenu('cherry-pick');
  }
  if (!['start', 'source', 'menu'].includes(stage)) {
    actions.push({ click: replayMenu('cherry-pick') }, { waitFor: c('editor') }, { waitFor: cherryControl('continue') });
    ready = c('editor');
  }
  if (!['start', 'source', 'menu', 'conflicted'].includes(stage)) {
    actions.push({ click: c('take-theirs') }, { waitValue: { selector: c('content'), value: conflictContent } });
    ready = conflictStage('true');
  }
  if (!['start', 'source', 'menu', 'conflicted', 'chosen'].includes(stage)) {
    actions.push({ click: c('save') }, { waitFor: conflictStage('false') });
    ready = conflictStage('false');
  }
  if (['resolved', 'continued', 'commit', 'diff'].includes(stage)) {
    actions.push({ click: c('mark') }, { waitFor: c('section') + '[data-conflict-files="0"]' }, { waitFor: 'body:not(:has(' + c('editor') + '))' });
    ready = cherryControl('continue');
  }
  if (['continued', 'commit', 'diff'].includes(stage)) {
    actions.push({ click: cherryControl('continue') }, { waitFor: mergeHead(6) });
    ready = mergeHead(6);
  }
  if (stage === 'commit' || stage === 'diff') {
    actions.push({ click: graphRow(6) }, { waitFor: commitPanel(6) + ' ' + commitFile() });
    ready = commitPanel(6);
  }
  if (stage === 'diff') {
    actions.push({ click: commitPanel(6) + ' ' + commitFile() }, { waitFor: historyViewer(6) }, { click: fileTab('diff') });
    ready = historyViewer(6) + '[data-tab="diff"]';
  }
  if (['review', 'cancelled', 'aborted'].includes(stage)) {
    actions.push({ click: cherryControl('abort') }, { waitFor: mergeConfirm });
    ready = mergeConfirm;
  }
  if (stage === 'cancelled') {
    actions.push({ click: mergeCancel }, { waitFor: 'body:not(:has([data-dialog-action="confirm"]))' });
    ready = conflictStage('false');
  }
  if (stage === 'aborted') {
    actions.push({ click: mergeConfirm }, { waitFor: 'body:not(:has([data-tutorial="conflict-section"]))' }, { waitFor: mergeHead(4) });
    ready = mergeHead(4);
  }
  if (file) {
    actions.push(...historyTreeRecipe().actions!, { waitFor: '[data-tutorial="open-files"][aria-pressed="true"]' });
    ready = fileRow('README.md');
  }
  if (file === 'work') {
    actions.push({ click: fileRow('README.md') }, { waitFor: historyViewer() }, { click: fileTab('text') });
    ready = historyViewer() + '[data-tab="text"]';
  }
  return {
    ...base,
    branches: {
      fixture: 'diverged-readme',
      heads: [
        { name: 'main', commit: 4 },
        { name: 'feature/begruessung', commit: 5 },
      ],
      remotes: [{ name: 'origin/main', commit: 2 }],
      current: 'main',
    },
    actions,
    ready,
  };
}
