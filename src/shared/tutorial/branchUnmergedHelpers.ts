import type { TutorialPreparationAction, TutorialStep } from './types';
import { branchRecipe, branchControl, branchRow } from './branchLessonHelpers';
import { branchMenu, branchAction } from './branchManageHelpers';
export const unmergedBranch = 'feature/offene-arbeit';
export const ordinaryDeleteDialog = '[role="dialog"]:is([aria-label="Branch löschen?"],[aria-label="Delete branch?"])';
export const forceDeleteDialog = '[role="dialog"]:is([aria-label="Branch force-löschen?"],[aria-label="Force-delete branch?"])';
export const deleteConfirm = ordinaryDeleteDialog + ' [data-dialog-action="confirm"]';
export const forceConfirm = forceDeleteDialog + ' [data-dialog-action="confirm"]';

export function branchUnmergedRecipe(options: { deleted?: boolean; menu?: boolean; dialog?: 'delete' | 'force' } = {}): NonNullable<TutorialStep['prepare']> {
  const base = branchRecipe();
  const actions: TutorialPreparationAction[] = [...base.actions!, { collapse: branchControl('inspector-toggle') }];
  let ready = branchRow('main', true);
  if (options.menu || options.dialog) {
    actions.push({ contextMenu: branchRow(unmergedBranch) }, { waitFor: branchMenu(unmergedBranch) });
    ready = branchMenu(unmergedBranch);
  }
  if (options.dialog) {
    actions.push({ click: branchAction('delete') }, { waitFor: ordinaryDeleteDialog });
    ready = ordinaryDeleteDialog;
  }
  if (options.dialog === 'force') {
    actions.push({ click: deleteConfirm }, { waitFor: forceDeleteDialog });
    ready = forceDeleteDialog;
  }
  return {
    ...base,
    branches: {
      heads: [{ name: 'main', commit: 3 }, { name: 'feature/begruessung', commit: 3 }, ...(options.deleted ? [] : [{ name: unmergedBranch, commit: 4 }])],
      current: 'main',
      remotes: [{ name: 'origin/main', commit: 3 }],
    },
    actions,
    ready,
  };
}
