import type { TutorialPreparationAction } from './types';
import { conflictControl as c, conflictStage } from './conflictLessonHelpers';
import { mergeHead } from './mergeLessonHelpers';
import { REBASE_ABORT_DRAFT, type RebasePauseKind } from './rebasePauseExamples';
export type RebaseConflictStage = 'conflicts' | 'chosen' | 'resolution-saved' | 'resolved' | 'abort-review' | 'cancelled' | 'aborted';
const control = (name: string) => '[data-tutorial="rebase-' + name + '"]';
const confirm = '.dialog-modal [data-dialog-action="confirm"]',
  cancel = '.dialog-modal [data-dialog-action="cancel"]';
export function appendRebaseConflictActions(actions: TutorialPreparationAction[], stage: string, kind: RebasePauseKind) {
  const phases = ['conflicts', 'chosen', 'resolution-saved', 'resolved', 'continued', 'commit', 'diff'],
    rank = phases.indexOf(stage);
  const aborting = ['abort-review', 'cancelled', 'aborted'].includes(stage);
  if (rank < 0 && !aborting) throw new Error('Unknown practice rebase conflict stage.');
  actions.push({ click: c('open') + '[data-conflict-path="README.md"]' }, { waitFor: c('editor') });
  let ready = c('editor');
  if (rank >= 1 || aborting) {
    actions.push(kind === 'abort' ? { fill: { selector: c('content'), value: REBASE_ABORT_DRAFT } } : { click: c('take-theirs') });
    actions.push({ waitValue: { selector: c('content'), value: kind === 'abort' ? REBASE_ABORT_DRAFT : { example: 'history-readme', version: 'latest' } } });
    ready = conflictStage('true');
  }
  if (rank >= 2 || aborting) {
    actions.push({ click: c('save') }, { waitFor: conflictStage('false') });
    ready = conflictStage('false');
  }
  if (rank >= 3) {
    actions.push({ click: c('mark') }, { waitFor: c('section') + '[data-conflict-files="0"]' }, { waitFor: 'body:not(:has(' + c('editor') + '))' });
    ready = control('continue');
  }
  if (aborting) {
    actions.push({ click: control('abort') }, { waitFor: confirm });
    ready = confirm;
  }
  if (stage === 'cancelled') {
    actions.push({ click: cancel }, { waitFor: 'body:not(:has([data-dialog-action="confirm"]))' });
    ready = conflictStage('false');
  }
  if (stage === 'aborted') {
    actions.push(
      { click: confirm },
      { waitFor: mergeHead(4) },
      { waitFor: 'body:not(:has(' + control('actions') + '))' },
      { waitFor: 'body:not(:has(' + c('editor') + '))' },
    );
    ready = mergeHead(4);
  }
  return ready;
}
