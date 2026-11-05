import type { TutorialStep } from './types';
import { conflictRecipe, conflictControl, conflictStage } from './conflictLessonHelpers';
import { mergeHead, mergeConfirm, mergeCancel } from './mergeLessonHelpers';
import { historyTreeRecipe, historyViewer } from './historyLessonHelpers';
import { fileControl, fileRow, fileTab } from './fileLessonHelpers';
type Stage = 'before' | 'review' | 'cancelled' | 'aborted';
export function conflictAbortRecipe(stage: Stage = 'before', file?: 'tree' | 'work'): NonNullable<TutorialStep['prepare']> {
  const base = conflictRecipe({ stage: 'saved' });
  const actions = [...base.actions!];
  let ready = conflictStage('false');
  if (stage !== 'before') {
    actions.push({ click: conflictControl('abort') }, { waitFor: mergeConfirm });
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
    actions.push(...historyTreeRecipe().actions!, { waitFor: fileControl('open-files') + '[aria-pressed="true"]' });
    ready = fileRow('README.md');
  }
  if (file === 'work') {
    actions.push({ click: fileRow('README.md') }, { waitFor: historyViewer() }, { click: fileTab('text') });
    ready = historyViewer() + '[data-tab="text"]';
  }
  return { ...base, actions, ready };
}
