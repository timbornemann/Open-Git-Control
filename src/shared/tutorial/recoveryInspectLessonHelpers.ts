import type { TutorialStep } from './types';
import { recoveryRecipe, recoveryControl as c, recoveryEntry, recoveryDetail, recoveryList } from './recoveryLessonHelpers';
import { mergeHead } from './mergeLessonHelpers';
import { branchControl } from './branchLessonHelpers';
import { hash, fileRow, fileTab, historyViewer } from './historyLessonHelpers';
export const inspectRecoveryName = 'recovery/angesehen';
export const recoveryPrompt = '.dialog-modal:has(.dialog-context-list)';
export const recoveryConfirm = recoveryPrompt + ' [data-dialog-action="confirm"]';
export const recoveryCancel = recoveryPrompt + ' [data-dialog-action="cancel"]';
export const inspectedMessage = ['Commit ' + hash(4).slice(0, 7) + ' wurde geöffnet.', 'Opened commit ' + hash(4).slice(0, 7) + '.'] as const;
export const inspectedBranchMessage = [
  'Recovery-Branch "' + inspectRecoveryName + '" wurde erstellt.',
  'Recovery branch "' + inspectRecoveryName + '" was created.',
] as const;
type Stage =
  'start' | 'center' | 'selected' | 'advanced' | 'prompt' | 'cancelled' | 'inspected' | 'detached' | 'files' | 'reopened' | 'named' | 'branched' | 'result';
export function inspectRecoveryRecipe(stage: Stage = 'start'): NonNullable<TutorialStep['prepare']> {
  const base = recoveryRecipe(stage === 'start' ? {} : { open: true });
  const actions = [...base.actions!];
  let ready = stage === 'start' ? mergeHead(2) : recoveryList(5);
  if (!['start', 'center'].includes(stage)) {
    actions.push(
      { click: recoveryEntry(4) },
      { waitFor: recoveryDetail(4) },
      { waitValue: { selector: c('branch-name'), value: ['recovery-' + hash(4).slice(0, 7), 'recovery-' + hash(4).slice(0, 7)] } },
    );
    ready = recoveryDetail(4);
  }
  if (!['start', 'center', 'selected'].includes(stage)) {
    actions.push({ click: c('advanced') + ' > summary' }, { waitFor: c('advanced') + '[open]' });
    ready = c('advanced') + '[open]';
  }
  if (!['start', 'center', 'selected', 'advanced'].includes(stage)) {
    actions.push({ click: c('inspect') }, { waitFor: recoveryPrompt });
    ready = recoveryPrompt;
  }
  if (stage === 'cancelled') {
    actions.push({ click: recoveryCancel }, { waitFor: 'body:not(:has(.dialog-modal))' });
    ready = recoveryDetail(4);
  }
  if (['inspected', 'detached', 'files', 'reopened', 'named', 'branched', 'result'].includes(stage)) {
    actions.push({ click: recoveryConfirm }, { waitFor: '.recovery-center__notice--success' }, { waitFor: recoveryList(6) });
    ready = '.recovery-center__notice--success';
  }
  if (['detached', 'files', 'reopened', 'named', 'branched', 'result'].includes(stage)) {
    actions.push({ click: '[data-tutorial="close-recovery"]' }, { waitFor: mergeHead(4) });
    ready = mergeHead(4);
  }
  if (stage === 'files') {
    actions.push(
      { expand: branchControl('inspector-toggle') },
      { click: '[data-tutorial="open-files"]' },
      { waitFor: '[data-tutorial="open-files"][aria-pressed="true"]' },
      { waitFor: fileRow('README.md') },
      { click: fileRow('README.md') },
      { waitFor: historyViewer() },
      { click: fileTab('text') },
    );
    ready = historyViewer() + '[data-tab="text"]';
  }
  if (['reopened', 'named', 'branched', 'result'].includes(stage)) {
    actions.push(
      { click: '[data-tutorial="open-recovery"]' },
      { waitFor: recoveryList(6) },
      { waitValue: { selector: c('branch-name'), value: ['recovery-' + hash(4).slice(0, 7), 'recovery-' + hash(4).slice(0, 7)] } },
    );
    ready = recoveryDetail(4);
  }
  if (['named', 'branched', 'result'].includes(stage)) {
    actions.push({ fill: { selector: c('branch-name'), value: [inspectRecoveryName, inspectRecoveryName] } });
    ready = c('branch-name');
  }
  if (['branched', 'result'].includes(stage)) {
    actions.push({ click: c('create-branch') }, { waitFor: '.recovery-center__notice--success' }, { waitFor: recoveryList(7) });
    ready = '.recovery-center__notice--success';
  }
  if (stage === 'result') {
    actions.push({ click: '[data-tutorial="close-recovery"]' }, { waitFor: mergeHead(4) });
    ready = mergeHead(4);
  }
  return { ...base, actions, ready };
}
