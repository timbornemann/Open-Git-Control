import type { TutorialCompletion, TutorialPreparationAction, TutorialStep, TutorialText } from './types';
import { forensicState, forensicResult, c, historyViewer } from './forensicLessonHelpers';
export { forensicStep as s, forensicRecipe, forensicResult as result, c, element, historyViewer as viewer } from './forensicLessonHelpers';
export const lineHistoryState = (count: number, empty = count === 0) => forensicState(count, empty, 'line');
export const lineHistoryValue = (selector: string, value: string): TutorialCompletion => ({
  kind: 'all',
  conditions: [
    { kind: 'value', selector, value: [value, value] },
    { kind: 'element', selector: `${c('forensic-search')}[data-active="true"][data-search-mode="line"]` },
  ],
});
export const invalidLineRange: TutorialText = ['Ungueltiger Zeilenbereich. Bitte Start/Ende pruefen.', 'Invalid line range. Please check start/end.'];
export const invalidLineAttempt: TutorialCompletion = { kind: 'feedback', trigger: c('forensic-run'), message: invalidLineRange, error: true };
export function lineHistoryRecipe(
  options: { path?: string; start?: string; end?: string; run?: number; diff?: number } = {},
): NonNullable<TutorialStep['prepare']> {
  const { path = 'README.md', start = '1', end = '1', run, diff } = options;
  const actions: TutorialPreparationAction[] = [
    { collapse: c('inspector-toggle') },
    { fill: { selector: c('commit-search-mode'), value: ['forensic', 'forensic'] } },
    { waitFor: `${c('forensic-search')}[data-active="true"]` },
    { fill: { selector: c('forensic-kind'), value: ['line', 'line'] } },
    { fill: { selector: c('forensic-path'), value: [path, path] } },
    { fill: { selector: c('forensic-start'), value: [start, start] } },
    { fill: { selector: c('forensic-end'), value: [end, end] } },
  ];
  let ready = lineHistoryState(0, false);
  if (run !== undefined) {
    actions.push({ click: c('forensic-run') }, { waitFor: lineHistoryState(run) });
    ready = lineHistoryState(run);
  }
  if (diff) {
    actions.push({ click: `${forensicResult(diff)} ${c('forensic-diff')}` });
    ready = `${historyViewer(diff, path)}[data-tab="diff"]`;
  }
  return { actions, ready };
}
