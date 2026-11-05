import type { TutorialStep } from './types';
import { rewordRecipe } from './rewordLessonHelpers';
import { branchControl } from './branchLessonHelpers';
import { recoveryControl as c, recoveryList, recoveryDetail } from './recoveryLessonHelpers';
import { mergeHead } from './mergeLessonHelpers';
import { graphRow, commitPanel, commitFile, hash } from './historyLessonHelpers';
export const messageRecoveryName = 'recovery/vor-nachricht';
export const messageRecoverySuccess = [
  'Recovery-Branch "' + messageRecoveryName + '" wurde erstellt.',
  'Recovery branch "' + messageRecoveryName + '" was created.',
] as const;
type Stage = 'start' | 'center' | 'history' | 'backup' | 'empty' | 'details' | 'named' | 'cancelled' | 'created' | 'result' | 'new-commit' | 'old-commit';
export function messageRecoveryRecipe(stage: Stage = 'start'): NonNullable<TutorialStep['prepare']> {
  const base = rewordRecipe('result');
  const actions = [
    { expand: branchControl('inspector-toggle') },
    ...base.actions!,
    { collapse: branchControl('inspector-toggle') },
    { collapse: branchControl('sidebar-toggle') },
  ];
  let ready = mergeHead(6);
  if (stage !== 'start') {
    actions.push({ click: '[data-tutorial="open-recovery"]' }, { waitFor: recoveryList(6) });
    ready = recoveryList(6);
  }
  if (!['start', 'center'].includes(stage)) {
    const source = stage === 'history' ? 'history' : 'backup',
      count = stage === 'history' ? 5 : 1;
    actions.push({ fill: { selector: c('source'), value: [source, source] } }, { waitFor: recoveryList(count) });
    ready = stage === 'history' ? recoveryList(5) : recoveryDetail(4);
    if (stage !== 'history')
      actions.push(
        { waitFor: recoveryDetail(4) },
        { waitValue: { selector: c('branch-name'), value: ['recovery-' + hash(4).slice(0, 7), 'recovery-' + hash(4).slice(0, 7)] } },
      );
  }
  if (stage === 'empty') {
    actions.push({ fill: { selector: c('search'), value: ['keine-beispielsicherung', 'keine-beispielsicherung'] } }, { waitFor: recoveryList(0) });
    ready = recoveryList(0);
  }
  if (stage === 'details') {
    actions.push({ click: c('git-details') + ' > summary' }, { waitFor: c('git-details') + '[open]' });
    ready = c('git-details') + '[open]';
  }
  if (['named', 'cancelled', 'created', 'result', 'new-commit', 'old-commit'].includes(stage)) {
    actions.push({ fill: { selector: c('branch-name'), value: [messageRecoveryName, messageRecoveryName] } });
    ready = c('branch-name');
  }
  if (['created', 'result', 'new-commit', 'old-commit'].includes(stage)) {
    actions.push({ click: c('create-branch') }, { waitFor: '.recovery-center__notice--success' });
    ready = '.recovery-center__notice--success';
  }
  if (['cancelled', 'result', 'new-commit', 'old-commit'].includes(stage)) {
    actions.push({ click: '[data-tutorial="close-recovery"]' }, { waitFor: mergeHead(stage === 'cancelled' ? 6 : 4) });
    ready = mergeHead(stage === 'cancelled' ? 6 : 4);
  }
  if (['new-commit', 'old-commit'].includes(stage)) {
    const number = stage === 'new-commit' ? 5 : 3;
    actions.push({ expand: branchControl('inspector-toggle') }, { click: graphRow(number) }, { waitFor: commitPanel(number) + ' ' + commitFile() });
    ready = commitPanel(number);
  }
  return { ...base, actions, ready };
}
