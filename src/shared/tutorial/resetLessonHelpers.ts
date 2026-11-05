import type { TutorialCompletion, TutorialStep } from './types';
import { branchRecipe } from './branchLessonHelpers';
import { replayStep } from './replayLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer, historyContent, fileTab, fileRow, hash } from './historyLessonHelpers';
import { mergeHead, mergeDialog, mergeConfirm, mergeCancel } from './mergeLessonHelpers';
import { stagingRow } from './stagingLessonHelpers';
export const resetStep = replayStep;
export type ResetMode = 'soft' | 'mixed' | 'hard';
export const resetMenu = (mode: ResetMode) => '[data-tutorial="graph-reset-' + mode + '"]';
export const resetDialog = mergeDialog;
export const resetConfirm = mergeConfirm;
export const resetCancel = mergeCancel;
export const resetGuardDialog = (mode: ResetMode) =>
  '.dialog-modal:has([data-dialog-context-value=' + JSON.stringify('git reset --' + mode + ' ' + hash(3)) + '])';
export const resetGuardConfirm = (mode: ResetMode) => resetGuardDialog(mode) + ' [data-dialog-action="confirm"]';
export const resetGuardCancel = (mode: ResetMode) => resetGuardDialog(mode) + ' [data-dialog-action="cancel"]';
export const resetNote = ['Eine unabhängige unversionierte Notiz.\n', 'An independent untracked note.\n'] as const;
export const resetResult = (mode: ResetMode): TutorialCompletion => ({
  kind: 'all',
  conditions: [
    { kind: 'element', selector: mergeHead(3) },
    { kind: 'absent', selector: resetDialog },
    {
      kind: 'working-tree',
      staged: mode === 'soft' ? ['README.md', 'src/app.ts'] : [],
      unstaged: mode === 'hard' ? [] : mode === 'mixed' ? ['README.md', 'src/app.ts'] : ['README.md'],
      untracked: ['notes.txt'],
      content: [
        { path: 'README.md', source: 'head', value: historyContent('description') },
        { path: 'README.md', source: 'index', value: historyContent(mode === 'soft' ? 'index' : 'description') },
        { path: 'README.md', source: 'worktree', value: historyContent(mode === 'hard' ? 'description' : 'work') },
        { path: 'notes.txt', source: 'worktree', value: resetNote },
      ],
    },
  ],
});
export type ResetStage =
  | 'start'
  | 'before-staged'
  | 'before-work'
  | 'source'
  | 'menu'
  | 'dialog'
  | 'cancelled'
  | 'guard'
  | 'guard-cancelled'
  | 'result'
  | 'directory'
  | 'after-staged'
  | 'after-work'
  | 'tree'
  | 'text';
/** Restore distinct HEAD, index and working drafts before the real reset menu. */
export function resetRecipe(mode: ResetMode, stage: ResetStage = 'start'): NonNullable<TutorialStep['prepare']> {
  const base = branchRecipe({ sidebarCollapsed: true }),
    actions = [...base.actions!, { waitFor: mergeHead(4) }];
  let ready = mergeHead(4);
  if (stage === 'before-staged' || stage === 'before-work') {
    const source = stage === 'before-staged' ? 'staged' : 'unstaged';
    actions.push({ click: stagingRow(source, 'README.md') }, { waitFor: historyViewer(source) }, { click: fileTab('diff') });
    ready = historyViewer(source) + '[data-tab="diff"]';
  }
  if (!['start', 'before-staged', 'before-work'].includes(stage)) {
    actions.push({ click: graphRow(3) }, { waitFor: commitPanel(3) + ' ' + commitFile() });
    ready = commitPanel(3);
  }
  if (!['start', 'before-staged', 'before-work', 'source'].includes(stage)) {
    actions.push({ contextMenu: graphRow(3) }, { waitFor: resetMenu(mode) });
    ready = resetMenu(mode);
  }
  if (!['start', 'before-staged', 'before-work', 'source', 'menu'].includes(stage)) {
    actions.push({ click: resetMenu(mode) }, { waitFor: resetConfirm });
    ready = resetConfirm;
  }
  if (stage === 'cancelled') {
    actions.push({ click: resetCancel }, { waitFor: 'body:not(:has([data-dialog-action="confirm"]))' });
    ready = mergeHead(4);
  }
  if (['guard', 'guard-cancelled', 'result', 'directory', 'after-staged', 'after-work', 'tree', 'text'].includes(stage)) {
    actions.push({ click: resetConfirm }, { waitFor: resetGuardDialog(mode) });
    ready = resetGuardDialog(mode);
  }
  if (stage === 'guard-cancelled') {
    actions.push({ click: resetGuardCancel(mode) }, { waitFor: 'body:not(:has([data-dialog-action="confirm"]))' });
    ready = mergeHead(4);
  }
  if (['result', 'directory', 'after-staged', 'after-work', 'tree', 'text'].includes(stage)) {
    actions.push({ click: resetGuardConfirm(mode) }, { waitFor: mergeHead(3) }, { waitFor: 'body:not(:has([data-dialog-action="confirm"]))' });
    ready = mergeHead(3);
  }
  if (['directory', 'after-staged', 'after-work', 'tree', 'text'].includes(stage)) {
    actions.push({ click: '[data-tutorial="close-inspector"]' }, { waitFor: '[data-tutorial="open-staging"]' }, { click: '[data-tutorial="open-staging"]' });
    ready = '[data-tutorial="staging"]';
  }
  if (stage === 'after-staged' || stage === 'after-work') {
    const source = stage === 'after-staged' ? 'staged' : 'unstaged';
    actions.push({ click: stagingRow(source, 'README.md') }, { waitFor: historyViewer(source) }, { click: fileTab('diff') });
    ready = historyViewer(source) + '[data-tab="diff"]';
  }
  if (stage === 'tree' || stage === 'text') {
    actions.push({ click: '[data-tutorial="open-files"]' }, { waitFor: '[data-tutorial="open-files"][aria-pressed="true"]' });
    ready = fileRow('README.md');
  }
  if (stage === 'text') {
    actions.push({ click: fileRow('README.md') }, { waitFor: historyViewer() }, { click: fileTab('text') });
    ready = historyViewer() + '[data-tab="text"]';
  }
  return {
    ...base,
    branches: {
      heads: [
        { name: 'main', commit: 4 },
        { name: 'feature/begruessung', commit: 4 },
      ],
      remotes: [{ name: 'origin/main', commit: 2 }],
      current: 'main',
    },
    indexEdits: [{ path: 'README.md', content: historyContent('index') }],
    edits: [
      { path: 'README.md', content: historyContent('work') },
      { path: 'notes.txt', content: resetNote },
    ],
    actions,
    ready,
  };
}
