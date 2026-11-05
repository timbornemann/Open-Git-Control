import type { TutorialPreparationAction, TutorialStep, TutorialText } from './types';
import { branchStep, branchControl as c } from './branchLessonHelpers';
import { branchCarryRecipe } from './branchCarryHelpers';
import { stagingRow, confirmDialog, cancelDialog } from './stagingLessonHelpers';
import { historyViewer } from './historyLessonHelpers';
export const stashStep: typeof branchStep = (id, title, text, target, extra) => branchStep(id, title, text, target, { inspector: 'staging', ...extra });
export const stashMessage = '[data-dialog-field="message"] input';
export const ordinaryEntry = '[data-tutorial="stashes"] [data-stash-name="stash@{0}"]';
export const ordinaryAction = (action: string) => ordinaryEntry + ' [data-stash-action=' + JSON.stringify(action) + ']';
export const ordinaryFile = (path: string) => ordinaryEntry + ' [data-stash-path=' + JSON.stringify(path) + ']';
export const ordinaryName = (scope: 'file' | 'all'): TutorialText =>
  scope === 'file' ? ['README für später', 'README for later'] : ['Arbeitspaket', 'Work bundle'];
export const emptyStashes = c('stashes') + ' .empty-state';
export const noStashDialog = 'body:not(:has(.dialog-modal))';
export type StashStage = 'start' | 'menu' | 'dialog' | 'saved' | 'applied' | 'popped' | 'drop-dialog' | 'dropped';
type Options = { scope?: 'file' | 'all'; stage?: StashStage; name?: TutorialText; stashes?: boolean; files?: boolean; diff?: 'staged' | 'unstaged' };
export function ordinaryStashRecipe(options: Options = {}): NonNullable<TutorialStep['prepare']> {
  const { scope = 'file', stage = 'start' } = options;
  const base = branchCarryRecipe();
  const actions: TutorialPreparationAction[] = [...base.actions!];
  let ready = c('staging');
  if (stage !== 'start') {
    actions.push(
      { contextMenu: scope === 'file' ? stagingRow('unstaged', 'README.md') : stagingRow('untracked', 'notes.txt') },
      { waitFor: c('stash-' + scope) },
    );
    ready = c('stash-' + scope);
  }
  if (!['start', 'menu'].includes(stage)) {
    actions.push({ click: c('stash-' + scope) }, { waitFor: stashMessage });
    ready = stashMessage;
    if (options.name) actions.push({ fill: { selector: stashMessage, value: options.name } });
  }
  if (!['start', 'menu', 'dialog'].includes(stage)) {
    if (!options.name) actions.push({ fill: { selector: stashMessage, value: ordinaryName(scope) } });
    actions.push({ click: confirmDialog }, { waitFor: noStashDialog }, { waitFor: c('staging') + ':not(:has(.staging-file-row[aria-label="README.md"]))' });
    ready = c('staging');
  }
  const applies = ['applied', 'drop-dialog', 'dropped'].includes(stage);
  const popped = stage === 'popped';
  const show = options.stashes || options.files || applies || popped;
  if (show) {
    actions.push({ expand: c('stash-panel-toggle') }, { waitFor: ordinaryEntry });
    ready = ordinaryEntry;
  }
  if (applies || popped) {
    actions.push({ click: ordinaryAction(popped ? 'pop' : 'apply') }, { waitFor: stagingRow('unstaged', 'README.md') });
    ready = stagingRow('unstaged', 'README.md');
    if (popped) {
      actions.push({ waitFor: emptyStashes });
      ready = emptyStashes;
    }
  }
  if (options.files && !popped) {
    actions.push({ click: ordinaryAction('files') }, { waitFor: ordinaryFile('README.md') });
    ready = ordinaryFile('README.md');
  }
  if (stage === 'drop-dialog' || stage === 'dropped') {
    actions.push({ click: ordinaryAction('drop') }, { waitFor: ordinaryAction('confirm-drop') });
    ready = ordinaryAction('confirm-drop');
    if (stage === 'dropped') {
      actions.push({ click: ordinaryAction('confirm-drop') }, { waitFor: emptyStashes });
      ready = emptyStashes;
    }
  }
  if (options.diff) {
    actions.push({ click: stagingRow(options.diff, 'README.md') }, { waitFor: historyViewer(options.diff) });
    ready = historyViewer(options.diff);
  }
  return { ...base, actions, ready };
}
export const stashConfirm = confirmDialog;
export const stashCancel = cancelDialog;
