import type { TutorialPreparationAction, TutorialStep, TutorialText } from './types';
import { branchStep, branchRecipe, branchControl, branchPanel } from './branchLessonHelpers';
import { fileRow, fileTab } from './fileLessonHelpers';
import { SUBMODULE_PATH } from './submoduleLessonExamples';
export const submodulePanel = '[data-tutorial="submodules"]';
export const submoduleToggle = submodulePanel + ' .repo-card-toggle';
export const submoduleRow = '[data-submodule-path="' + SUBMODULE_PATH + '"]';
export const submoduleControl = (name: string) => '[data-tutorial="submodule-' + name + '"]';
export const submoduleField = (name: string) => submoduleRow + ' [data-submodule-field="' + name + '"]';
export const submoduleConfigViewer = '.file-viewer[data-path=".gitmodules"]';
export const submoduleStep = (id: string, title: TutorialText, description: TutorialText, target: string, extra: Partial<TutorialStep> = {}) =>
  branchStep(id, title, description, target, { inspector: 'history', ...extra });
type Options = {
  state?: NonNullable<TutorialStep['prepare']>['submodules'];
  sidebarCollapsed?: boolean;
  collapsed?: boolean;
  updated?: boolean;
  synced?: boolean;
  opened?: boolean;
  files?: boolean;
  config?: boolean;
};
/** Each direct entry restores the same controls and original child-repository state. */
export function submoduleRecipe(options: Options = {}): NonNullable<TutorialStep['prepare']> {
  const base = branchRecipe();
  const actions: TutorialPreparationAction[] = [
    { expand: branchControl('sidebar-toggle') },
    { collapse: branchPanel + ' .repo-card-toggle' },
    { collapse: '[data-tutorial="tags"] .repo-card-toggle' },
    options.collapsed ? { collapse: submoduleToggle } : { expand: submoduleToggle },
  ];
  let ready = submoduleToggle + '[aria-expanded="' + !options.collapsed + '"]';
  if (!options.collapsed) actions.push({ waitFor: submoduleRow });
  if (options.updated) {
    actions.push({ click: submoduleControl('update') }, { waitFor: submoduleRow + '[data-submodule-state="clean"]' });
    ready = submoduleRow + '[data-submodule-state="clean"]';
  }
  if (options.synced) actions.push({ click: submoduleControl('sync') }, { waitFor: '.action-toast.success' });
  if (options.opened) actions.push({ click: submoduleControl('open') });
  if (options.files || options.config) {
    actions.push({ click: branchControl('open-files') }, { waitFor: branchControl('open-files') + '[aria-pressed="true"]' });
    ready = branchControl('open-files') + '[aria-pressed="true"]';
  }
  if (options.config) {
    actions.push({ click: fileRow('.gitmodules') }, { waitFor: submoduleConfigViewer }, { click: fileTab('text') });
    ready = submoduleConfigViewer + '[data-tab="text"]';
  }
  if (options.sidebarCollapsed) {
    actions.push({ collapse: branchControl('sidebar-toggle') });
    ready = branchControl('sidebar-toggle') + '[aria-expanded="false"]';
  }
  return { branches: base.branches, submodules: options.state || 'ready', actions, ready };
}
