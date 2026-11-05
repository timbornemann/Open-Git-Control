import type { TutorialStep } from './types';
import { recoveryRecipe, recoveryControl as c, recoveryEntry, recoveryDetail, recoveryList } from './recoveryLessonHelpers';
import { recoveryPrompt, recoveryConfirm, recoveryCancel } from './recoveryInspectLessonHelpers';
import { branchControl } from './branchLessonHelpers';
import { mergeHead } from './mergeLessonHelpers';
import { hash, fileRow, fileTab, historyViewer } from './historyLessonHelpers';
export const resetRecoveryMessage = [
  'Repository wurde auf ' + hash(4).slice(0, 7) + ' zurückgesetzt.',
  'Repository was reset to ' + hash(4).slice(0, 7) + '.',
] as const;
type Stage = 'start' | 'center' | 'selected' | 'advanced' | 'prompt' | 'cancelled' | 'reset' | 'result' | 'tree' | 'files';
export function resetRecoveryRecipe(stage: Stage = 'start'): NonNullable<TutorialStep['prepare']> {
  const base = recoveryRecipe(stage === 'start' ? {} : { open: true });
  const actions = [...base.actions!];
  let ready = stage === 'start' ? mergeHead(2) : recoveryList(5);
  if (!['start', 'center'].includes(stage)) {
    actions.push({ click: recoveryEntry(4) }, { waitFor: recoveryDetail(4) });
    ready = recoveryDetail(4);
  }
  if (!['start', 'center', 'selected'].includes(stage)) {
    actions.push({ click: c('advanced') + ' > summary' }, { waitFor: c('advanced') + '[open]' });
    ready = c('advanced') + '[open]';
  }
  if (!['start', 'center', 'selected', 'advanced'].includes(stage)) {
    actions.push({ click: c('reset') }, { waitFor: recoveryPrompt });
    ready = recoveryPrompt;
  }
  if (stage === 'cancelled') {
    actions.push({ click: recoveryCancel }, { waitFor: 'body:not(:has(.dialog-modal))' });
    ready = recoveryDetail(4);
  }
  if (['reset', 'result', 'tree', 'files'].includes(stage)) {
    actions.push({ click: recoveryConfirm }, { waitFor: '.recovery-center__notice--success' }, { waitFor: recoveryList(6) });
    ready = '.recovery-center__notice--success';
  }
  if (['result', 'tree', 'files'].includes(stage)) {
    actions.push({ click: '[data-tutorial="close-recovery"]' }, { waitFor: mergeHead(4) });
    ready = mergeHead(4);
  }
  if (['tree', 'files'].includes(stage)) {
    actions.push(
      { expand: branchControl('inspector-toggle') },
      { click: '[data-tutorial="open-files"]' },
      { waitFor: '[data-tutorial="open-files"][aria-pressed="true"]' },
      { waitFor: fileRow('README.md') },
    );
    ready = fileRow('README.md');
  }
  if (stage === 'files') {
    actions.push({ click: fileRow('README.md') }, { waitFor: historyViewer() }, { click: fileTab('text') });
    ready = historyViewer() + '[data-tab="text"]';
  }
  return { ...base, actions, ready };
}
