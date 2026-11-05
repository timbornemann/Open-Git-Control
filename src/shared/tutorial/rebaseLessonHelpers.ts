import type { TutorialStep } from './types';
import { branchRecipe } from './branchLessonHelpers';
import { historyStep, graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileTab } from './fileLessonHelpers';
import { mergeHead } from './mergeLessonHelpers';
import { rebaseTodo, rebaseResultNumber, type RebaseLessonMode } from './rebaseLessonExamples';
export const rebaseStep = historyStep;
export const rebaseMenu = '[data-tutorial="graph-interactive-rebase"]';
export const rebaseField = '[data-dialog-field="todo"] textarea';
export const rebaseDialog = '.dialog-modal:has(' + rebaseField + ')';
export const rebaseConfirm = rebaseDialog + ' [data-dialog-action="confirm"]';
export const rebaseCancel = rebaseDialog + ' [data-dialog-action="cancel"]';
export const rebaseContext = (number: number) => rebaseDialog + ' .dialog-context-list dd:nth-of-type(' + number + ')';
type Stage = 'start' | 'selected' | 'source-diff' | 'menu' | 'dialog' | 'edited' | 'empty' | 'cancelled' | 'result' | 'commit' | 'result-diff' | 'following';
export function rebaseRecipe(mode: RebaseLessonMode, stage: Stage = 'start'): NonNullable<TutorialStep['prepare']> {
  const base = branchRecipe(),
    actions = [...base.actions!, { waitFor: mergeHead(4) }];
  const sourcePath = mode === 'reorder' ? 'LICENSE' : 'README.md',
    result = rebaseResultNumber(mode);
  let ready = mergeHead(4);
  if (stage !== 'start') {
    actions.push({ click: graphRow(3) }, { waitFor: commitPanel(3) + ' ' + commitFile(sourcePath) });
    ready = commitPanel(3);
  }
  if (stage === 'source-diff') {
    actions.push({ click: commitPanel(3) + ' ' + commitFile(sourcePath) }, { waitFor: historyViewer(3, sourcePath) }, { click: fileTab('diff') });
    ready = historyViewer(3, sourcePath) + '[data-tab="diff"]';
  }
  if (!['start', 'selected', 'source-diff'].includes(stage)) {
    actions.push({ contextMenu: graphRow(3) }, { waitFor: rebaseMenu });
    ready = rebaseMenu;
  }
  if (!['start', 'selected', 'source-diff', 'menu'].includes(stage)) {
    actions.push({ click: rebaseMenu }, { waitFor: rebaseField }, { waitValue: { selector: rebaseField, value: rebaseTodo(mode, true) } });
    ready = rebaseField;
    if (stage !== 'dialog') actions.push({ fill: { selector: rebaseField, value: stage === 'empty' ? ['', ''] : rebaseTodo(mode) } });
  }
  if (stage === 'cancelled') {
    actions.push({ click: rebaseCancel }, { waitFor: 'body:not(:has(' + rebaseField + '))' });
    ready = mergeHead(4);
  }
  if (['result', 'commit', 'result-diff', 'following'].includes(stage)) {
    actions.push({ click: rebaseConfirm }, { waitFor: mergeHead(result) }, { waitFor: 'body:not(:has(' + rebaseField + '))' });
    ready = mergeHead(result);
  }
  if (['commit', 'result-diff', 'following'].includes(stage)) {
    const selected = stage === 'following' ? (mode === 'reorder' ? 5 : 6) : mode === 'reword' ? 5 : result;
    const path = mode === 'reorder' && stage !== 'following' ? 'LICENSE' : 'README.md';
    actions.push({ click: graphRow(selected) }, { waitFor: commitPanel(selected) + ' ' + commitFile(path) });
    ready = commitPanel(selected);
    if (stage === 'result-diff') {
      actions.push({ click: commitPanel(selected) + ' ' + commitFile(path) }, { waitFor: historyViewer(selected, path) }, { click: fileTab('diff') });
      ready = historyViewer(selected, path) + '[data-tab="diff"]';
    }
  }
  return {
    ...base,
    branches: {
      ...(mode === 'reorder' ? { fixture: 'linear-independent' as const } : {}),
      heads: [
        { name: 'main', commit: 4 },
        { name: 'feature/begruessung', commit: 1 },
      ],
      remotes: [{ name: 'origin/main', commit: 2 }],
      current: 'main',
    },
    actions,
    ready,
  };
}
