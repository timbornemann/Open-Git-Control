import type { TutorialCompletion, TutorialPreparationAction, TutorialStep, TutorialText } from './types';
import { commitSearchStep } from './commitSearchLessonHelpers';
import { graphRow, hash, c, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
export { c, element, commitPanel, commitFile, historyViewer, graphRow } from './historyLessonHelpers';
export const overviewTerm: TutorialText = ['Projektübersicht', 'Project overview'];
export const forensicResult = (number: number) => `[data-forensic-hash="${hash(number)}"]`;
export const forensicState = (count: number, empty = count === 0, mode: 'string' | 'line' | 'regex' = 'string') =>
  `${c('forensic-search')}[data-active="true"][data-search-mode="${mode}"][data-search-loading="false"][data-search-count="${count}"][data-search-empty="${empty}"]`;
export const forensicStep = commitSearchStep;
export const forensicValue = (selector: string, value: TutorialText): TutorialCompletion => ({
  kind: 'all',
  conditions: [
    { kind: 'value', selector, value },
    { kind: 'element', selector: `${c('forensic-search')}[data-active="true"][data-search-mode="string"]` },
  ],
});
export function forensicRecipe(
  options: { path?: string; term?: TutorialText; run?: number; diff?: number; select?: number; file?: string } = {},
): NonNullable<TutorialStep['prepare']> {
  const { path = 'README.md', term = overviewTerm, run, diff, select, file } = options;
  const actions: TutorialPreparationAction[] = [
    { collapse: c('inspector-toggle') },
    { fill: { selector: c('commit-search-mode'), value: ['forensic', 'forensic'] } },
    { waitFor: `${c('forensic-search')}[data-active="true"]` },
    { fill: { selector: c('forensic-path'), value: [path, path] } },
    { fill: { selector: c('forensic-query'), value: term } },
  ];
  let ready = forensicState(0, false);
  if (run !== undefined) {
    actions.push({ click: c('forensic-run') }, { waitFor: forensicState(run) });
    ready = forensicState(run);
  }
  if (diff) {
    actions.push({ click: `${forensicResult(diff)} ${c('forensic-diff')}` });
    ready = `${historyViewer(diff, path)}[data-tab="diff"]`;
  }
  if (select) {
    actions.push({ click: `${forensicResult(select)} ${c('forensic-commit')}` }, { waitFor: `${graphRow(select)}[data-selected="true"]` });
    ready = `${graphRow(select)}[data-selected="true"]`;
  }
  if (file && select) {
    actions.push(
      { expand: c('inspector-toggle') },
      { waitFor: `${commitPanel(select)} ${commitFile(file)}` },
      { click: `${commitPanel(select)} ${commitFile(file)}` },
    );
    ready = `${historyViewer(select, file)}[data-tab="diff"]`;
  }
  return { actions, ready };
}
