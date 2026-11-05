import type { TutorialStep } from './types';
import type { GitMergeMode } from '@/types/git';
import { mergeRecipe, mergeMore, mergeOpen, mergeControl as c, mergeSource, mergeConfirm, mergeHead } from './mergeLessonHelpers';
export const mergeFailure = '.action-toast.error';
export const mergeFailureClose = mergeFailure + ' .toast-action-btn-close';
type GuardStage = 'start' | 'more' | 'menu' | 'review' | 'rejected' | 'dismissed' | 'retry-more' | 'retry-menu' | 'retry-review' | 'merged';
/** Replays the failed attempt before opening a fresh, independently reviewed merge. */
export function mergeGuardRecipe(stage: GuardStage = 'start', selected = false, initialMode: GitMergeMode = 'ffOnly'): NonNullable<TutorialStep['prepare']> {
  const ordinary = ['start', 'more', 'menu', 'review'].includes(stage);
  const base = mergeRecipe({
    diverged: true,
    stage: ordinary ? (stage as 'start' | 'more' | 'menu' | 'review') : 'review',
    mode: ordinary ? initialMode : 'ffOnly',
    selected,
  });
  if (ordinary) return base;
  const phases = ['rejected', 'dismissed', 'retry-more', 'retry-menu', 'retry-review', 'merged'];
  const phase = phases.indexOf(stage),
    actions = [...base.actions!];
  actions.push({ click: mergeConfirm }, { waitFor: mergeFailure }, { waitFor: mergeHead(4) }, { waitFor: 'body:not(:has([data-dialog-action="confirm"]))' });
  let ready = mergeFailure;
  if (phase >= 1) {
    actions.push({ click: mergeFailureClose }, { waitFor: 'body:not(:has(.action-toast.error))' });
    ready = mergeHead(4);
  }
  if (phase >= 2) {
    actions.push({ click: mergeMore }, { waitFor: mergeOpen });
    ready = mergeOpen;
  }
  if (phase >= 3) {
    actions.push({ click: mergeOpen }, { waitFor: c('source') }, { fill: { selector: c('mode'), value: ['default', 'default'] } });
    if (selected || phase >= 4) actions.push({ fill: { selector: c('source'), value: [mergeSource, mergeSource] } });
    ready = c('source');
  }
  if (phase >= 4) {
    actions.push({ click: c('review') }, { waitFor: mergeConfirm });
    ready = mergeConfirm;
  }
  if (phase >= 5) {
    actions.push({ click: mergeConfirm }, { waitFor: mergeHead(6) }, { waitFor: 'body:not(:has([data-dialog-action="confirm"]))' });
    ready = mergeHead(6);
  }
  return { ...base, actions, ready };
}
