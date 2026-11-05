import type { TutorialCompletion, TutorialPreparationAction, TutorialStep } from './types';
import { forensicState, forensicResult, c, historyViewer } from './forensicLessonHelpers';
export { forensicStep as s, forensicRecipe, forensicResult as result, c, element, historyViewer as viewer } from './forensicLessonHelpers';
export const regexState = (count: number, empty = count === 0) => forensicState(count, empty, 'regex');
export const regexValue = (selector: string, value: string): TutorialCompletion => ({
  kind: 'all',
  conditions: [
    { kind: 'value', selector, value: [value, value] },
    { kind: 'element', selector: `${c('forensic-search')}[data-active="true"][data-search-mode="regex"]` },
  ],
});
export const invalidRegexAttempt: TutorialCompletion = {
  kind: 'feedback',
  trigger: c('forensic-run'),
  message: ['Ungueltiges Regex-Muster. Bitte Ausdruck korrigieren.', 'Invalid regex pattern. Please fix the expression.'],
  error: true,
};
export function regexRecipe(options: { path?: string; pattern?: string; run?: number; diff?: number } = {}): NonNullable<TutorialStep['prepare']> {
  const { path = 'src/app.ts', pattern = 'Hallo', run, diff } = options;
  const actions: TutorialPreparationAction[] = [
    { collapse: c('inspector-toggle') },
    { fill: { selector: c('commit-search-mode'), value: ['forensic', 'forensic'] } },
    { waitFor: `${c('forensic-search')}[data-active="true"]` },
    { fill: { selector: c('forensic-kind'), value: ['regex', 'regex'] } },
    { fill: { selector: c('forensic-path'), value: [path, path] } },
    { fill: { selector: c('forensic-query'), value: [pattern, pattern] } },
  ];
  let ready = regexState(0, false);
  if (run !== undefined) {
    actions.push({ click: c('forensic-run') }, { waitFor: regexState(run) });
    ready = regexState(run);
  }
  if (diff) {
    actions.push({ click: `${forensicResult(diff)} ${c('forensic-diff')}` });
    ready = `${historyViewer(diff, path)}[data-tab="diff"]`;
  }
  return { actions, ready };
}
