import type { TutorialStep, TutorialText } from './types';
import { branchRecipe, branchRow, branchControl, branchStep } from './branchLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer, hash } from './historyLessonHelpers';
import { fileTab } from './fileLessonHelpers';
import { mergeHead } from './mergeLessonHelpers';
export const recoveryControl = (name: string) => `[data-tutorial="recovery-${name}"]`;
export const recoveryEntry = (number: number, kind = 'commit') => `[data-recovery-hash="${hash(number)}"][data-recovery-kind="${kind}"]`;
export const recoveryDetail = (number: number) => recoveryControl('detail') + `[data-recovery-hash="${hash(number)}"]`;
export const recoveryList = (count: number) => recoveryControl('list') + `[data-entry-count="${count}"][aria-busy="false"]`;
export const recoveryNavigation = '[data-tutorial="open-recovery"], [data-tutorial="commit-search-more"]:not([aria-expanded="true"])';
export const recoveryName = 'recovery/begruessung';
export const recoverySuccess: TutorialText = ['Recovery-Branch "' + recoveryName + '" wurde erstellt.', 'Recovery branch "' + recoveryName + '" was created.'];
export const recoveryStep = (id: string, title: TutorialText, text: TutorialText, target: string, extra: Partial<TutorialStep> = {}) =>
  branchStep(id, title, text, target, { inspector: undefined, ...extra });
type Options = {
  open?: boolean;
  query?: string;
  selected?: boolean | 2 | 4;
  details?: boolean;
  name?: string;
  created?: boolean;
  graph?: boolean;
  commit?: boolean;
  file?: boolean;
};
export function recoveryRecipe(options: Options = {}): NonNullable<TutorialStep['prepare']> {
  const base = branchRecipe();
  const actions = [
    ...base.actions!,
    { waitFor: branchRow('main', true) },
    { collapse: branchControl('inspector-toggle') },
    { contextMenu: graphRow(2) },
    { waitFor: '[data-tutorial="graph-reset-hard"]' },
    { click: '[data-tutorial="graph-reset-hard"]' },
    { waitFor: '[data-dialog-action="confirm"]' },
    { click: '[data-dialog-action="confirm"]' },
    { waitFor: mergeHead(2) },
    { collapse: branchControl('sidebar-toggle') },
  ];
  let ready = mergeHead(2);
  if (options.open) {
    actions.push({ click: '[data-tutorial="open-recovery"]' }, { waitFor: recoveryList(5) });
    ready = recoveryList(5);
  }
  if (options.query !== undefined) {
    const count = !options.query ? 5 : options.query === 'feat:' ? 2 : options.query === hash(4).slice(0, 7) ? 1 : 0;
    actions.push({ fill: { selector: recoveryControl('search'), value: [options.query, options.query] } }, { waitFor: recoveryList(count) });
    ready = recoveryList(count);
  }
  if (options.selected || options.created) {
    const number = typeof options.selected === 'number' ? options.selected : 4;
    actions.push(
      { click: recoveryEntry(number) },
      { waitFor: recoveryDetail(number) },
      { waitValue: { selector: recoveryControl('branch-name'), value: ['recovery-' + hash(number).slice(0, 7), 'recovery-' + hash(number).slice(0, 7)] } },
    );
    ready = recoveryDetail(number);
  }
  if (options.details) {
    actions.push({ click: recoveryControl('git-details') + ' > summary' }, { waitFor: recoveryControl('git-details') + '[open]' });
    ready = recoveryControl('git-details') + '[open]';
  }
  if (options.name !== undefined || options.created) {
    const name = options.name ?? recoveryName;
    actions.push({ fill: { selector: recoveryControl('branch-name'), value: [name, name] } });
    ready = recoveryControl('branch-name');
  }
  if (options.created) {
    actions.push({ click: recoveryControl('create-branch') }, { waitFor: '.recovery-center__notice--success' });
    ready = '.recovery-center__notice--success';
  }
  if (options.graph) {
    actions.push({ click: '[data-tutorial="close-recovery"]' }, { waitFor: mergeHead(4) });
    ready = mergeHead(4);
  }
  if (options.commit || options.file) {
    actions.push({ expand: branchControl('inspector-toggle') }, { click: graphRow(4) }, { waitFor: commitPanel(4) + ' ' + commitFile() });
    ready = commitPanel(4);
  }
  if (options.file) {
    actions.push({ click: commitPanel(4) + ' ' + commitFile() }, { waitFor: historyViewer(4) }, { click: fileTab('diff') });
    ready = historyViewer(4) + '[data-tab="diff"]';
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
