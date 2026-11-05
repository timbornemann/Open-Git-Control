import type { TutorialStep, TutorialText } from './types';
import { branchRecipe, branchPanel, branchControl, branchStep, branchRow } from './branchLessonHelpers';
import { commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileTab } from './fileLessonHelpers';
export { branchElement as element, branchValue as value } from './branchLessonHelpers';
export const tagControl = (name: string) => '[data-tutorial="tag-' + name + '"]';
export const tagPanel = '[data-tutorial="tags"]';
export const tagToggle = tagPanel + ' .repo-card-toggle';
export const tagRow = (name: string) => tagPanel + ' [data-tag-name=' + JSON.stringify(name) + ']';
export const tagName = 'v1.1.0';
export const tagMessage: TutorialText = ['Erster bewusst markierter Lernstand.', 'First deliberately marked learning revision.'];
export const tagField = (name: string) => '[data-dialog-field=' + JSON.stringify(name) + '] input';
export const tagDialog = '[role="dialog"]:has([data-dialog-field="name"]):has([data-dialog-field="message"])';
export const tagDeleteDialog = '[role="dialog"]:has(.dialog-context-list):not(:has([data-dialog-field]))';
export const tagConfirm = '[data-dialog-action="confirm"]';
export const tagCancel = '[data-dialog-action="cancel"]';
export const tagStep = (id: string, title: TutorialText, description: TutorialText, target: string, extra: Partial<TutorialStep> = {}) =>
  branchStep(id, title, description, target, { inspector: 'history', ...extra });
type Options = {
  sidebarCollapsed?: boolean;
  collapsed?: boolean;
  query?: string;
  dialog?: boolean;
  name?: string;
  message?: boolean;
  created?: boolean;
  selected?: 'old' | 'new';
  file?: 'diff' | 'text';
  deleting?: boolean;
  deleted?: boolean;
};
/** Direct entries use the same tag form, navigation and confirmation controls. */
export function tagRecipe(options: Options = {}): NonNullable<TutorialStep['prepare']> {
  const base = branchRecipe();
  const actions = [...base.actions!, { waitFor: branchRow('main', true) }, { collapse: branchPanel + ' .repo-card-toggle' }];
  actions.push(options.collapsed ? { collapse: tagToggle } : { expand: tagToggle });
  let ready = tagToggle + '[aria-expanded="' + !options.collapsed + '"]';
  if (options.dialog || options.created || options.deleted || options.deleting) {
    actions.push({ click: tagControl('create') }, { waitFor: tagDialog });
    ready = tagDialog;
    if (options.name || options.created || options.deleted || options.deleting)
      actions.push({ fill: { selector: tagField('name'), value: [options.name || tagName, options.name || tagName] } });
    if (options.message) actions.push({ fill: { selector: tagField('message'), value: tagMessage } });
  }
  if (options.created || options.deleted || options.deleting) {
    actions.push({ click: tagConfirm }, { waitFor: tagRow(options.name || tagName) }, { waitFor: 'body:not(:has([data-dialog-field]))' });
    ready = tagRow(options.name || tagName);
  }
  if (options.query !== undefined) {
    actions.push({ fill: { selector: tagControl('filter'), value: [options.query, options.query] } });
    ready = tagControl('filter');
  }
  if (options.selected) {
    const number = options.selected === 'old' ? 2 : 4;
    actions.push({ click: tagRow(options.selected === 'old' ? 'v1.0.0' : options.name || tagName) }, { waitFor: commitPanel(number) + ' ' + commitFile() });
    ready = commitPanel(number);
    if (options.file) {
      actions.push({ click: commitPanel(number) + ' ' + commitFile() }, { waitFor: historyViewer(number) }, { click: fileTab(options.file) });
      ready = historyViewer(number) + '[data-tab="' + options.file + '"]';
    }
  }
  if (options.deleting || options.deleted) {
    actions.push({ click: tagRow(options.name || tagName) + ' ' + tagControl('delete') }, { waitFor: tagDeleteDialog });
    ready = tagDeleteDialog;
  }
  if (options.deleted) {
    actions.push(
      { click: tagConfirm },
      { waitFor: 'body:not(:has([data-tag-name=' + JSON.stringify(options.name || tagName) + ']))' },
      { waitFor: 'body:not(:has([data-dialog-action="confirm"]))' },
    );
    ready = tagRow('v1.0.0');
  }
  if (options.sidebarCollapsed) {
    actions.push({ collapse: branchControl('sidebar-toggle') });
    ready = branchControl('sidebar-toggle') + '[aria-expanded="false"]';
  }
  return { ...base, actions, ready };
}
