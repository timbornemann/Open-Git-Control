import type { TutorialStep } from './types';
import { mergeRecipe, mergeHead } from './mergeLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer, fileRow, fileTab } from './historyLessonHelpers';
export const mergeRevertMenu = '[data-tutorial="graph-revert-merge"]';
export const mergeRevertDialog = '.dialog-modal:has([data-dialog-context-value="1"])';
export const mergeRevertConfirm = mergeRevertDialog + ' [data-dialog-action="confirm"]';
export const mergeRevertCancel = mergeRevertDialog + ' [data-dialog-action="cancel"]';
export type MergeRevertStage =
  'start' | 'source' | 'source-diff' | 'menu' | 'dialog' | 'cancelled' | 'result' | 'commit' | 'result-diff' | 'working' | 'tree' | 'work' | 'readme';
/** Prepare a real divergent merge first, then use the existing parent-1 revert UI. */
export function mergeRevertRecipe(stage: MergeRevertStage = 'start'): NonNullable<TutorialStep['prepare']> {
  const base = mergeRecipe({ diverged: true, stage: 'result' });
  const actions = [...base.actions!];
  let ready = mergeHead(6);
  if (stage !== 'start') {
    actions.push({ click: graphRow(6) }, { waitFor: commitPanel(6) + ' ' + commitFile('LICENSE') });
    ready = commitPanel(6);
  }
  if (stage === 'source-diff') {
    actions.push({ click: commitPanel(6) + ' ' + commitFile('LICENSE') }, { waitFor: historyViewer(6, 'LICENSE') }, { click: fileTab('diff') });
    ready = historyViewer(6, 'LICENSE') + '[data-tab="diff"]';
  }
  if (!['start', 'source', 'source-diff'].includes(stage)) {
    actions.push({ contextMenu: graphRow(6) }, { waitFor: mergeRevertMenu });
    ready = mergeRevertMenu;
  }
  if (!['start', 'source', 'source-diff', 'menu'].includes(stage)) {
    actions.push({ click: mergeRevertMenu }, { waitFor: mergeRevertDialog });
    ready = mergeRevertDialog;
  }
  if (stage === 'cancelled') {
    actions.push({ click: mergeRevertCancel }, { waitFor: 'body:not(:has([data-dialog-action="confirm"]))' });
    ready = mergeHead(6);
  }
  if (['result', 'commit', 'result-diff', 'working', 'tree', 'work', 'readme'].includes(stage)) {
    actions.push({ click: mergeRevertConfirm }, { waitFor: mergeHead(7) }, { waitFor: 'body:not(:has([data-dialog-action="confirm"]))' });
    ready = mergeHead(7);
  }
  if (stage === 'commit' || stage === 'result-diff') {
    actions.push({ click: graphRow(7) }, { waitFor: commitPanel(7) + ' ' + commitFile('LICENSE') });
    ready = commitPanel(7);
  }
  if (stage === 'result-diff') {
    actions.push({ click: commitPanel(7) + ' ' + commitFile('LICENSE') }, { waitFor: historyViewer(7, 'LICENSE') }, { click: fileTab('diff') });
    ready = historyViewer(7, 'LICENSE') + '[data-tab="diff"]';
  }
  if (stage === 'working' || stage === 'tree' || stage === 'work' || stage === 'readme') {
    actions.push({ click: '[data-tutorial="close-inspector"]' }, { waitFor: '[data-tutorial="open-files"]' });
    ready = '[data-tutorial="open-files"]';
  }
  if (stage === 'tree' || stage === 'work' || stage === 'readme') {
    actions.push({ click: '[data-tutorial="open-files"]' }, { waitFor: '[data-tutorial="open-files"][aria-pressed="true"]' });
    ready = fileRow('LICENSE');
  }
  if (stage === 'work' || stage === 'readme') {
    const path = stage === 'readme' ? 'README.md' : 'LICENSE';
    actions.push({ click: fileRow(path) }, { waitFor: historyViewer('unstaged', path) }, { click: fileTab('text') });
    ready = historyViewer('unstaged', path) + '[data-tab="text"]';
  }
  return { ...base, branches: { ...base.branches!, remotes: [{ name: 'origin/main', commit: 2 }] }, actions, ready };
}
