import type { TutorialStep, TutorialText } from './types';
import { branchRecipe, branchRow, branchStep } from './branchLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileTab } from './fileLessonHelpers';
import { mergeHead } from './mergeLessonHelpers';
import { tagControl, tagField, tagConfirm, tagRow, tagToggle } from './tagLessonHelpers';
import { REWORD_TITLE, REWORD_DESCRIPTION, REWORD_ORIGINAL_TITLE, REWORD_ORIGINAL_DESCRIPTION } from './rewordLessonExamples';
export const rewordControl = (name: string) => `[data-tutorial="reword-${name}"]`;
export const rewordMenu = '[data-tutorial="edit-commit-message"]';
export const rewordDialog = '.dialog-modal:has(' + rewordControl('title') + ')';
export const rewordConfirm = rewordDialog + ' [data-dialog-action="confirm"]';
export const rewordCancel = rewordDialog + ' [data-dialog-action="cancel"]';
export const rewordStep = (id: string, title: TutorialText, text: TutorialText, target: string, extra: Partial<TutorialStep> = {}) =>
  branchStep(id, title, text, target, { inspector: 'history', ...extra });
type Stage = 'start' | 'selected' | 'menu' | 'dialog' | 'cancelled' | 'result' | 'commit' | 'file' | 'following';
type Options = { form?: number; guard?: 'published' | 'referenced' };
export function rewordRecipe(stage: Stage = 'start', { form = 0, guard }: Options = {}): NonNullable<TutorialStep['prepare']> {
  const base = branchRecipe(),
    actions = [...base.actions!, { waitFor: branchRow('main', true) }];
  const number = guard === 'published' ? 2 : 3;
  if (guard === 'referenced') {
    actions.push(
      { expand: tagToggle },
      { click: tagControl('create') },
      { waitFor: tagField('name') },
      { fill: { selector: tagField('name'), value: ['vor-nachrichtenkorrektur', 'vor-nachrichtenkorrektur'] } },
      { click: tagConfirm },
      { waitFor: tagRow('vor-nachrichtenkorrektur') },
      { waitFor: 'body:not(:has([data-dialog-field]))' },
    );
  }
  let ready = mergeHead(4);
  if (stage !== 'start') {
    actions.push({ click: graphRow(number) }, { waitFor: commitPanel(number) + ' ' + commitFile() });
    ready = commitPanel(number);
  }
  if (!['start', 'selected'].includes(stage)) {
    actions.push({ contextMenu: graphRow(number) }, { waitFor: rewordMenu });
    ready = rewordMenu;
  }
  if (!['start', 'selected', 'menu'].includes(stage)) {
    actions.push({ click: rewordMenu }, { waitFor: rewordControl('title') });
    if (guard) actions.push({ waitFor: rewordControl('block') + `[data-block-reason="${guard}"]` });
    else
      actions.push(
        { waitValue: { selector: rewordControl('title'), value: REWORD_ORIGINAL_TITLE } },
        { waitValue: { selector: rewordControl('description'), value: REWORD_ORIGINAL_DESCRIPTION } },
      );
    ready = guard ? rewordControl('block') : rewordControl('title');
    if (!guard) {
      if (form > 0 || ['cancelled', 'result', 'commit', 'file', 'following'].includes(stage))
        actions.push({ fill: { selector: rewordControl('title'), value: REWORD_TITLE } });
      if (form > 1 || ['cancelled', 'result', 'commit', 'file', 'following'].includes(stage))
        actions.push({ fill: { selector: rewordControl('description'), value: REWORD_DESCRIPTION } });
    }
  }
  if (stage === 'cancelled') {
    actions.push({ click: rewordCancel }, { waitFor: 'body:not(:has(' + rewordControl('title') + '))' });
    ready = mergeHead(4);
  }
  if (['result', 'commit', 'file', 'following'].includes(stage)) {
    actions.push(
      { click: rewordConfirm },
      { waitFor: mergeHead(6) },
      { waitFor: commitPanel(5) },
      { waitFor: 'body:not(:has(' + rewordControl('title') + '))' },
    );
    ready = mergeHead(6);
  }
  if (stage === 'file') {
    actions.push({ click: commitPanel(5) + ' ' + commitFile() }, { waitFor: historyViewer(5) }, { click: fileTab('diff') });
    ready = historyViewer(5) + '[data-tab="diff"]';
  }
  if (stage === 'following') {
    actions.push({ click: graphRow(6) }, { waitFor: commitPanel(6) + ' ' + commitFile() });
    ready = commitPanel(6);
  }
  return {
    ...base,
    branches: {
      heads: [
        { name: 'main', commit: 4 },
        { name: 'feature/begruessung', commit: 1 },
      ],
      remotes: [{ name: 'origin/main', commit: 2 }],
      current: 'main',
    },
    actions,
    ready,
  };
}
