import type { GitMergeMode } from '@/types/git';
import type { TutorialPreparationAction, TutorialStep, TutorialText } from './types';
import { branchRecipe, branchRow, branchStep } from './branchLessonHelpers';
import { graphRow, historyViewer, historyTreeRecipe, commitPanel, commitFile } from './historyLessonHelpers';
import { stagingRow } from './stagingLessonHelpers';
import { fileControl, fileRow, fileTab } from './fileLessonHelpers';
export { branchElement as element, branchValue as value } from './branchLessonHelpers';
export const mergeSource = 'feature/begruessung';
export const mergeControl = (name: string) => '[data-tutorial="merge-' + name + '"]';
export const mergeMore = '.topbar-more-toggle';
export const mergeOpen = '[data-topbar-more-merge]';
export const mergeDialog = '[role="dialog"]:has(.dialog-context-list)';
export const mergeConfirm = '[data-dialog-action="confirm"]';
export const mergeCancel = '[data-dialog-action="cancel"]';
export const mergeContext = (number: number) => mergeDialog + ' .dialog-context-list dd:nth-of-type(' + number + ')';
export const mergeHead = (number: number) => graphRow(number) + '[data-commit-head="true"]';
export const mergeMessage: TutorialText = ['Begrüßung übernehmen', 'combine the greeting'];
export const mergeDescription: TutorialText = ['Beispieländerungen bewusst in einem Commit speichern.', 'Save the sample changes deliberately in one commit.'];
export const mergeField = (name: string) => '[data-tutorial="commit-' + name + '"]';
export const mergeStep = (id: string, title: TutorialText, text: TutorialText, target: string, extra: Partial<TutorialStep> = {}) =>
  branchStep(id, title, text, target, { inspector: 'history', ...extra });
export type MergeStage = 'start' | 'more' | 'menu' | 'review' | 'result' | 'committed';
type Options = {
  stage?: MergeStage;
  mode?: GitMergeMode;
  selected?: boolean;
  outward?: boolean;
  current?: string;
  form?: number;
  file?: 'tree' | 'work' | 'staged' | 'commit';
  commit?: boolean;
  diverged?: boolean;
  path?: string;
};
function prepareCommitFields(actions: TutorialPreparationAction[], form: number, committed: boolean) {
  const fields: readonly [string, TutorialText][] = [
    ['type', ['feat', 'feat']],
    ['prefix', ['lernen', 'lernen']],
    ['message', mergeMessage],
    ['description', mergeDescription],
  ];
  for (const [index, [name, text]] of fields.entries()) if (index < form || committed) actions.push({ fill: { selector: mergeField(name), value: text } });
}
function prepareFileView(actions: TutorialPreparationAction[], options: Options, newCommit: number, path: string) {
  const { file } = options;
  let ready: string | undefined;
  if (options.commit || file === 'commit') {
    actions.push({ click: graphRow(newCommit) }, { waitFor: commitPanel(newCommit) + ' ' + commitFile(path) });
    ready = commitPanel(newCommit);
  }
  if (file === 'tree') {
    actions.push(...historyTreeRecipe().actions!, { waitFor: fileControl('open-files') + '[aria-pressed="true"]' });
    ready = fileRow(path);
  } else if (file === 'commit') {
    actions.push({ click: commitPanel(newCommit) + ' ' + commitFile(path) }, { waitFor: historyViewer(newCommit, path) }, { click: fileTab('diff') });
    ready = historyViewer(newCommit, path) + '[data-tab="diff"]';
  } else if (file === 'work') {
    actions.push(
      ...historyTreeRecipe().actions!,
      { waitFor: fileControl('open-files') + '[aria-pressed="true"]' },
      { click: fileRow(path) },
      { waitFor: historyViewer('unstaged', path) },
      { click: fileTab('text') },
    );
    ready = historyViewer('unstaged', path) + '[data-tab="text"]';
  } else if (file === 'staged') {
    actions.push({ click: stagingRow('staged', path) }, { waitFor: historyViewer('staged', path) }, { click: fileTab('diff') });
    ready = historyViewer('staged', path) + '[data-tab="diff"]';
  }
  return ready;
}
/** Direct entries replay actual menu choices, confirmation and writes. */
export function mergeRecipe(options: Options = {}): NonNullable<TutorialStep['prepare']> {
  const { stage = 'start', mode = 'default', outward = false, form = 0 } = options;
  const current = options.current || 'main';
  const other = current === mergeSource ? 'main' : mergeSource;
  const mainHead = options.diverged ? 4 : 3,
    sourceHead = options.diverged ? 5 : 4,
    newCommit = options.diverged ? 6 : 5;
  const path = options.path || (options.diverged ? 'LICENSE' : 'README.md');
  const changedPath = options.diverged && (outward ? other : current) === 'main' ? 'LICENSE' : 'README.md';
  const base = branchRecipe({ current });
  const actions: TutorialPreparationAction[] = [...base.actions!, { waitFor: branchRow(current, true) }];
  let ready = mergeHead(current === 'main' ? mainHead : sourceHead);
  if (stage !== 'start') {
    actions.push({ click: mergeMore }, { waitFor: mergeOpen });
    ready = mergeOpen;
  }
  if (!['start', 'more'].includes(stage)) {
    actions.push({ click: mergeOpen }, { waitFor: mergeControl('source') });
    ready = mergeControl('source');
    if (outward) actions.push({ click: mergeControl('outward') }, { waitFor: mergeControl('outward') + '[aria-pressed="true"]' });
    if (options.selected || ['review', 'result', 'committed'].includes(stage))
      actions.push({ fill: { selector: mergeControl('source'), value: [other, other] } });
    actions.push({ fill: { selector: mergeControl('mode'), value: [mode, mode] } });
  }
  if (['review', 'result', 'committed'].includes(stage)) {
    actions.push({ click: mergeControl('review') }, { waitFor: mergeConfirm });
    ready = mergeConfirm;
  }
  if (stage === 'result' || stage === 'committed') {
    actions.push({ click: mergeConfirm });
    ready = mode === 'squash' ? stagingRow('staged', changedPath) : mergeHead(mode === 'noFf' || options.diverged ? newCommit : 4);
    actions.push({ waitFor: branchRow(outward ? other : current, true) }, { waitFor: ready }, { waitFor: 'body:not(:has([data-dialog-action="confirm"]))' });
  }
  prepareCommitFields(actions, form, stage === 'committed');
  if (stage === 'committed') {
    actions.push({ click: '.staging-commit-btn' }, { waitFor: mergeHead(newCommit) });
    ready = mergeHead(newCommit);
  }
  ready = prepareFileView(actions, options, newCommit, path) ?? ready;
  return {
    ...base,
    branches: {
      ...base.branches!,
      ...(options.diverged ? { fixture: 'diverged-license' as const } : {}),
      heads: [
        { name: 'main', commit: mainHead },
        { name: mergeSource, commit: sourceHead },
      ],
      current,
    },
    actions,
    ready,
  };
}
