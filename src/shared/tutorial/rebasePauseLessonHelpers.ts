import type { TutorialPreparationAction, TutorialStep, TutorialText } from './types';
import { rebaseRecipe, rebaseField, rebaseConfirm } from './rebaseLessonHelpers';
import { rebasePauseTodo, type RebasePauseKind, isConflictRebaseLesson } from './rebasePauseExamples';
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileControl as c, fileRow, fileTab } from './fileLessonHelpers';
import { mergeHead } from './mergeLessonHelpers';
import { appendRebaseEditActions, type RebaseEditStage } from './rebaseEditPreparation';
import { appendRebaseConflictActions, type RebaseConflictStage } from './rebaseConflictPreparation';
export const rebaseControl = (name: string) => '[data-tutorial="rebase-' + name + '"]';
export const rebasePauseFailure = '.action-toast.error';
export const rebasePauseDismiss = rebasePauseFailure + ' .toast-action-btn-close';
export type RebasePauseStage =
  | 'start'
  | 'selected'
  | 'menu'
  | 'dialog'
  | 'todo'
  | 'paused'
  | 'notice-dismissed'
  | 'staging'
  | RebaseEditStage
  | RebaseConflictStage
  | 'continued'
  | 'commit'
  | 'diff';
/** Every checkpoint reaches its pause through the real graph action and todo. */
export function rebasePauseRecipe(kind: RebasePauseKind, stage: RebasePauseStage = 'start', form = 0): NonNullable<TutorialStep['prepare']> {
  const conflicted = isConflictRebaseLesson(kind),
    mode = conflicted ? 'review' : 'reorder';
  if (['start', 'selected', 'menu', 'dialog'].includes(stage)) return rebaseRecipe(mode, stage as 'start' | 'selected' | 'menu' | 'dialog');
  const base = rebaseRecipe(mode, 'dialog'),
    actions: TutorialPreparationAction[] = [...base.actions!, { fill: { selector: rebaseField, value: rebasePauseTodo(kind) } }];
  let ready = rebaseField;
  if (stage !== 'todo') {
    actions.push({ click: rebaseConfirm }, { waitFor: mergeHead(conflicted ? 2 : 3) }, { waitFor: 'body:not(:has(' + rebaseField + '))' });
    ready = mergeHead(conflicted ? 2 : 3);
  }
  if (conflicted && !['todo', 'paused'].includes(stage))
    actions.push({ waitFor: rebasePauseFailure }, { click: rebasePauseDismiss }, { waitFor: 'body:not(:has(' + rebasePauseFailure + '))' });
  if (!['todo', 'paused', 'notice-dismissed'].includes(stage)) {
    actions.push({ click: c('close-inspector') }, { expand: c('inspector-toggle') }, { click: c('open-staging') }, { waitFor: rebaseControl('continue') });
    ready = rebaseControl('continue');
  }
  if (!['todo', 'paused', 'notice-dismissed', 'staging'].includes(stage)) {
    ready = conflicted ? appendRebaseConflictActions(actions, stage, kind) : appendRebaseEditActions(actions, stage, kind, form);
  }
  if (['continued', 'commit', 'diff'].includes(stage)) {
    const head = conflicted ? 5 : 6;
    actions.push({ click: rebaseControl('continue') }, { waitFor: mergeHead(head) }, { waitFor: 'body:not(:has(' + rebaseControl('actions') + '))' });
    ready = mergeHead(head);
    if (stage !== 'continued') {
      actions.push({ click: graphRow(5) }, { waitFor: commitPanel(5) + ' ' + commitFile(conflicted ? 'README.md' : 'LICENSE') });
      ready = commitPanel(5);
    }
    if (stage === 'diff') {
      const path = conflicted ? 'README.md' : 'LICENSE';
      actions.push({ click: commitPanel(5) + ' ' + commitFile(path) }, { waitFor: historyViewer(5, path) }, { click: fileTab('diff') });
      ready = historyViewer(5, path) + '[data-tab="diff"]';
    }
  }
  return { ...base, actions, ready };
}
export const rebaseFileTree = fileRow;
export const rebaseTodoValue = (value: TutorialText) => ({ kind: 'value' as const, selector: rebaseField, value });
