import type { TutorialPreparationAction, TutorialStep, TutorialText } from './types';
import { branchRecipe, branchControl as c, branchRow } from './branchLessonHelpers';
import { stagingRow } from './stagingLessonHelpers';
import { historyViewer } from './historyLessonHelpers';
export const carryBranch = 'feature/begruessung';
export const carryName: TutorialText = ['Notizen für den Branchwechsel', 'Notes for the branch switch'];
export const carryDialog = '[role="dialog"]:has(.branch-change)';
export const carryButton = (action: 'confirm' | 'cancel' | 'secondary') => carryDialog + ' [data-dialog-action=' + JSON.stringify(action) + ']';
export const carryField = c('branch-change-name');
export const carryGroup = (group: 'staged' | 'unstaged' | 'new') => '.branch-change-files [data-branch-change-group=' + JSON.stringify(group) + ']';
export const carryFile = (group: 'staged' | 'unstaged' | 'new') =>
  carryGroup(group) + ' [data-branch-change-path=' + JSON.stringify(group === 'new' ? 'notes.txt' : 'README.md') + ']';
type Options = {
  post?: boolean;
  dialog?: 'review' | 'choice' | 'result';
  preview?: 'staged' | 'unstaged' | 'new';
  name?: TutorialText;
  reviewedName?: TutorialText;
  diff?: 'staged' | 'unstaged';
};
export function branchCarryRecipe(options: Options = {}): NonNullable<TutorialStep['prepare']> {
  const base = branchRecipe({ current: options.post ? carryBranch : 'main' });
  const actions: TutorialPreparationAction[] = [...base.actions!, { expand: c('inspector-toggle') }, { click: c('open-staging') }];
  let ready = stagingRow('staged', 'README.md');
  if (options.dialog) {
    actions.push({ click: branchRow(carryBranch) }, { waitFor: '.branch-change-files' });
    ready = '.branch-change-files';
    if (options.dialog === 'choice' || options.dialog === 'result' || options.reviewedName) {
      actions.push({ click: carryButton('confirm') }, { waitFor: carryField });
      ready = carryField;
      const name = options.name || options.reviewedName;
      if (name) actions.push({ fill: { selector: carryField, value: name } });
      if (options.reviewedName && options.dialog === 'review') {
        actions.push({ click: c('branch-change-review') }, { waitFor: '.branch-change-files' });
        ready = '.branch-change-files';
      }
    }
    if (options.preview) {
      actions.push({ click: carryFile(options.preview) }, { waitFor: carryFile(options.preview) + '[aria-pressed="true"]' });
      ready = '.branch-change-preview';
    }
    if (options.dialog === 'result') {
      actions.push({ click: carryButton('confirm') }, { waitFor: c('branch-change-result') });
      ready = c('branch-change-result');
    }
  }
  if (options.diff) {
    actions.push({ click: stagingRow(options.diff, 'README.md') }, { waitFor: historyViewer(options.diff) });
    ready = historyViewer(options.diff);
  }
  return {
    ...base,
    branches: {
      ...base.branches!,
      heads: [
        { name: 'main', commit: 4 },
        { name: carryBranch, commit: 4 },
      ],
    },
    indexEdits: [{ path: 'README.md', content: { example: 'history-readme', version: 'index' } }],
    edits: [
      { path: 'README.md', content: { example: 'history-readme', version: 'work' } },
      { path: 'notes.txt', content: { example: 'tree-files', version: 'note' } },
    ],
    actions,
    ready,
  };
}
