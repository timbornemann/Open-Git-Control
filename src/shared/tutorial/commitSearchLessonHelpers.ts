import type { TutorialCompletion, TutorialPreparationAction, TutorialStep, TutorialText } from './types';
import { historyStep, graphRow, c } from './historyLessonHelpers';
export { c, graphRow, hash, element } from './historyLessonHelpers';
export type CommitSearchScope = 'all' | 'subject' | 'author' | 'hash' | 'refs';
export const commitSearchState = (scope: CommitSearchScope, query: TutorialText, count: number): Extract<TutorialCompletion, { kind: 'element' }> => ({
  kind: 'element',
  selector: `${c('commit-search')}[data-search-scope="${scope}"][data-search-count="${count}"]:is(${query.map((value) => `[data-search-query=${JSON.stringify(value)}]`).join(',')})`,
});
export const selectedCommit = (number: number) => `${graphRow(number)}[data-selected="true"]`;
export const commitSearchStep = (id: string, title: TutorialText, description: TutorialText, target: string, extra: Partial<TutorialStep> = {}) =>
  historyStep(id, title, description, target, { inspector: undefined, ...extra });
export function commitSearchRecipe(
  scope: CommitSearchScope = 'all',
  query: TutorialText = ['', ''],
  count = 0,
  options: { selected?: 2 | 4; inspector?: boolean } = {},
): NonNullable<TutorialStep['prepare']> {
  const actions: TutorialPreparationAction[] = [
    { collapse: c('inspector-toggle') },
    { fill: { selector: c('commit-search-scope'), value: [scope, scope] } },
    { fill: { selector: c('commit-search-query'), value: query } },
    { waitFor: commitSearchState(scope, query, count).selector },
  ];
  if (options.selected) {
    actions.push({ click: c('commit-search-next') }, { waitFor: selectedCommit(2) });
    if (options.selected === 4) actions.push({ click: c('commit-search-next') });
    actions.push({ waitFor: selectedCommit(options.selected) });
  }
  if (options.inspector) actions.push({ expand: c('inspector-toggle') });
  return {
    actions,
    ready: options.inspector
      ? `${c('inspector-toggle')}[aria-expanded="true"]`
      : options.selected
        ? selectedCommit(options.selected)
        : commitSearchState(scope, query, count).selector,
  };
}
