import type { TutorialPreparationAction, TutorialText } from './types';
import { branchRow } from './branchLessonHelpers';
import { ordinaryStashRecipe, ordinaryAction as action, stashConfirm, emptyStashes, noStashDialog } from './stashLessonHelpers';
import { stagingRow } from './stagingLessonHelpers';
import { historyViewer } from './historyLessonHelpers';
export const stashBranchName = 'feature/saved-work';
export const stashBranchField = '[data-dialog-field="branchName"] input';
export type StashBranchStage = 'start' | 'dialog' | 'empty' | 'named' | 'result';
export function stashBranchRecipe(stage: StashBranchStage = 'start', diff?: 'staged' | 'unstaged') {
  const base = ordinaryStashRecipe({ scope: 'all', stage: 'saved', stashes: true });
  const actions: TutorialPreparationAction[] = [
    ...base.actions!,
    { click: branchRow('feature/begruessung') },
    { waitFor: branchRow('feature/begruessung', true) },
    { waitFor: noStashDialog },
  ];
  let ready = branchRow('feature/begruessung', true);
  if (stage !== 'start') {
    actions.push({ click: action('branch') }, { waitFor: stashBranchField });
    ready = stashBranchField;
    if (stage !== 'dialog') {
      const value: TutorialText = stage === 'empty' ? ['', ''] : [stashBranchName, stashBranchName];
      actions.push({ fill: { selector: stashBranchField, value } });
    }
    if (stage === 'result') {
      actions.push(
        { click: stashConfirm },
        { waitFor: noStashDialog },
        { waitFor: branchRow(stashBranchName, true) },
        { waitFor: stagingRow('staged', 'README.md') },
        { waitFor: emptyStashes },
      );
      ready = branchRow(stashBranchName, true);
    }
  }
  if (diff) {
    actions.push({ click: stagingRow(diff, 'README.md') }, { waitFor: historyViewer(diff) });
    ready = historyViewer(diff);
  }
  return {
    ...base,
    branches: {
      ...base.branches!,
      heads: [
        { name: 'main', commit: 3 },
        { name: 'feature/begruessung', commit: 4 },
      ],
    },
    actions,
    ready,
  };
}
