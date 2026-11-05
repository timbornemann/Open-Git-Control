import type { TutorialPreparationAction, TutorialStep } from './types';
import { branchRecipe, branchControl as c, branchRow, branchName } from './branchLessonHelpers';
export const renamedBranch = 'feature/kapitel';
export const branchMenu = (name: string) => c('branch-menu') + '[data-branch-name=' + JSON.stringify(name) + ']';
export const branchAction = (name: string) => '[data-branch-action=' + JSON.stringify(name) + ']';
export const renameField = '[data-dialog-field="newName"] input';
export const dialogAction = (name: 'confirm' | 'cancel') => '[data-dialog-action=' + JSON.stringify(name) + ']';
type Options = { renamed?: boolean; active?: boolean; deleted?: boolean; menu?: string; dialog?: 'rename' | 'delete'; value?: string };
export function branchManageRecipe(options: Options = {}): NonNullable<TutorialStep['prepare']> {
  const name = options.renamed ? renamedBranch : branchName;
  const base = branchRecipe({ created: !options.deleted, renamed: options.renamed ? renamedBranch : undefined, current: options.active ? name : 'main' });
  const actions: TutorialPreparationAction[] = [...base.actions!, { collapse: c('inspector-toggle') }];
  let ready = c('branch-filter');
  const target = options.menu || (options.dialog ? name : undefined);
  if (target) {
    actions.push({ contextMenu: branchRow(target) }, { waitFor: branchMenu(target) });
    ready = branchMenu(target);
  }
  if (options.dialog) {
    actions.push({ click: branchAction(options.dialog) }, { waitFor: options.dialog === 'rename' ? renameField : dialogAction('confirm') });
    ready = options.dialog === 'rename' ? renameField : dialogAction('confirm');
    if (options.value !== undefined) actions.push({ fill: { selector: renameField, value: [options.value, options.value] } });
  }
  return { ...base, actions, ready };
}
