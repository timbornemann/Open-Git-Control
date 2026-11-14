import type { SearchExample, TutorialCompletion, TutorialFileContent, TutorialPreparationAction, TutorialStep, TutorialText } from './types';
import { fileStep, fileControl as c, editor, element, fileTab } from './fileLessonHelpers';
export { fileControl as c, editor, element, dialog, confirmDialog, cancelDialog } from './fileLessonHelpers';
export const searchContent = (version: SearchExample): TutorialFileContent => ({ example: 'search-files', version });
export const searchPaths = { guide: 'guides/Planet.md', notes: 'notes/planet.txt', code: 'src/planet.ts' };
export type SearchState = 'base' | 'one' | 'all';
const original = { [searchPaths.guide]: searchContent('guide'), [searchPaths.notes]: searchContent('notes'), [searchPaths.code]: searchContent('code') };
const edits = (state: SearchState) =>
  state === 'one'
    ? { [searchPaths.guide]: searchContent('guide-one') }
    : state === 'all'
      ? { [searchPaths.guide]: searchContent('guide-all'), [searchPaths.notes]: searchContent('notes-all'), [searchPaths.code]: searchContent('code-all') }
      : {};
export const searchSeed = (state: SearchState = 'base'): NonNullable<TutorialStep['prepare']> => ({
  edits: Object.entries(edits(state)).map(([path, content]) => ({ path, content })),
});
export const searchState = (state: SearchState = 'base'): TutorialCompletion => ({
  kind: 'working-tree',
  staged: [],
  unstaged: Object.keys(edits(state)),
  untracked: [],
  content: [
    ...Object.entries({ ...original, ...edits(state) }).map(([path, value]) => ({ path, value, source: 'worktree' as const })),
    ...Object.entries(original).flatMap(([path, value]) => [
      { path, value, source: 'head' as const },
      { path, value, source: 'index' as const },
    ]),
  ],
});
export const searchStep = (id: string, title: TutorialText, description: TutorialText, target: string, extra: Partial<TutorialStep> = {}) =>
  fileStep(id, title, description, target, { scenario: 'search-files', ...extra });
export const searchResults = (count: number, files?: number) =>
  `.working-search[data-search-settled="true"][data-search-count="${count}"]${files === undefined ? '' : `[data-search-files="${files}"]`}`;
export const searchResult = (path = searchPaths.guide) => `[data-search-path=${JSON.stringify(path)}]`;
export const searchHit = (path = searchPaths.guide, line = 3, column = 1) =>
  `${searchResult(path)} [data-search-line="${line}"][data-search-column="${column}"]`;
export const searchReplace = (path = searchPaths.guide, line = 3, column = 1) => `${searchHit(path, line, column)} .working-search-match__replace`;
export const searchViewer = `.file-viewer[data-path=${JSON.stringify(searchPaths.guide)}]`;
export const searchAll = (...conditions: TutorialCompletion[]): TutorialCompletion => ({ kind: 'all', conditions });
export const searchValue = (selector: string, value: string, count?: number): TutorialCompletion =>
  searchAll({ kind: 'value', selector, value: [value, value] }, ...(count === undefined ? [] : [element(searchResults(count))]));
type Options = {
  mode?: 'filename' | 'content';
  query?: string;
  count?: number;
  matchCase?: boolean;
  replacement?: string;
  file?: boolean;
  draft?: boolean;
  confirm?: boolean;
  diff?: boolean;
};
export const searchRecipe = (state: SearchState = 'base', options: Options = {}): NonNullable<TutorialStep['prepare']> => {
  const { mode = 'content', query = 'planet', matchCase = false } = options;
  const count = options.count ?? (query === '' ? 0 : mode === 'filename' ? 3 : state === 'base' ? 5 : state === 'one' ? 4 : 0);
  const actions: TutorialPreparationAction[] = [
    { click: c('file-search-toggle') },
    ...(mode === 'content' ? [{ click: c('file-search-contents') }] : []),
    ...(matchCase ? [{ click: c('file-search-case') }] : []),
    { fill: { selector: c('file-search-query'), value: [query, query] } },
    { waitFor: searchResults(count) },
    ...(options.replacement === undefined
      ? []
      : [{ fill: { selector: c('file-search-replacement'), value: [options.replacement, options.replacement] as const } }]),
    ...(options.file
      ? [
          { click: mode === 'filename' ? `button${searchResult()}` : `${searchResult()} .working-search-result-group__file` },
          { click: fileTab('text') },
          { waitFor: `${searchViewer}[data-tab="text"] ${editor}` },
        ]
      : []),
    ...(options.draft ? [{ fill: { selector: editor, value: searchContent('draft') } }, { waitFor: `${searchViewer}[data-dirty="true"]` }] : []),
    ...(options.diff ? [{ click: '.file-viewer [data-file-tab="diff"]' }] : []),
    ...(options.confirm ? [{ click: c('file-search-all') }] : []),
  ];
  return {
    ...searchSeed(state),
    actions,
    ready: options.confirm ? '.dialog-modal' : options.diff ? `${searchViewer}[data-tab="diff"]` : options.file ? searchViewer : searchResults(count),
  };
};
