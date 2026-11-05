import type { HistoryExample, TutorialFileContent, TutorialPreparationAction, TutorialStep, TutorialText } from './types';
import { step } from './catalogSteps';
import { practiceCommitHash } from './exampleGitIds';
import { fileRow, fileTab, fileControl as c } from './fileLessonHelpers';
export { fileControl as c, fileRow, fileTab, editor, element } from './fileLessonHelpers';
export const historyContent = (version: HistoryExample): TutorialFileContent => ({ example: 'history-readme', version });
export const hash = practiceCommitHash;
export const graphRow = (number: number) => `.commit-row[data-commit-hash="${hash(number)}"]`;
export const commitPanel = (number: number) => `.commit-details-panel[data-commit-hash="${hash(number)}"]`;
export const commitFile = (path = 'README.md') => `[data-commit-file=${JSON.stringify(path)}]`;
export const historyViewer = (source: 'unstaged' | 'staged' | number = 'unstaged', path = 'README.md') =>
  `.file-viewer[data-path=${JSON.stringify(path)}][data-source="${typeof source === 'number' ? 'commit' : source}"]${typeof source === 'number' ? `[data-commit-hash="${hash(source)}"]` : ''}`;
export const historyEntry = (number: number, scope = '.file-viewer') => `${scope} [data-history-hash="${hash(number)}"]`;
export const historyList = (...numbers: number[]) => {
  const entries = numbers.map((number) => `[data-history-hash="${hash(number)}"]`);
  return `.file-viewer .file-history-panel${entries.map((entry) => `:has(${entry})`).join('')}:not(:has([data-history-hash]:not(:is(${entries.join(',')}))))`;
};
export const blameLine = (line: number, number?: number, scope = '.file-viewer') =>
  `${scope} [data-blame-line="${line}"]${number === undefined ? '' : `[data-blame-hash="${number === 0 ? '0'.repeat(40) : hash(number)}"]`}`;
export const historyStep = (id: string, title: TutorialText, description: TutorialText, target: string, extra: Partial<TutorialStep> = {}) =>
  step(id, title, description, 'repo', target, { scenario: 'history', inspector: 'history', continue: true, ...extra });
export const historySeed = (work: HistoryExample = 'latest', index: HistoryExample = 'latest'): NonNullable<TutorialStep['prepare']> => ({
  ...(index === 'latest' ? {} : { indexEdits: [{ path: 'README.md', content: historyContent(index) }] }),
  ...(work === 'latest' ? {} : { edits: [{ path: 'README.md', content: historyContent(work) }] }),
});
export const historyTreeRecipe = (folder?: string): NonNullable<TutorialStep['prepare']> => ({
  actions: [{ click: c('open-files') }, ...(folder ? [{ expand: fileRow(folder) }] : [])],
  ready: folder ? `${fileRow(folder)}[aria-expanded="true"]` : fileRow(),
});
type Options = {
  commit?: number;
  file?: string;
  source?: 'unstaged' | 'staged';
  tab?: 'text' | 'diff' | 'history' | 'blame';
  sideTab?: 'history' | 'blame';
  work?: HistoryExample;
  index?: HistoryExample;
  draft?: HistoryExample;
};
/** Rebuild view navigation through the same controls a learner uses. */
export function historyRecipe(options: Options = {}): NonNullable<TutorialStep['prepare']> {
  const { commit, file, source = 'unstaged', tab, sideTab } = options;
  const actions: TutorialPreparationAction[] = [];
  let ready = graphRow(4);
  if (commit) {
    actions.push({ click: graphRow(commit) }, { waitFor: `${commitPanel(commit)} ${commitFile()}` });
    ready = `${commitPanel(commit)} ${commitFile()}`;
  }
  if (file) {
    if (commit) actions.push({ click: `${commitPanel(commit)} ${commitFile(file)}` });
    else if (source === 'staged') actions.push({ click: `${c('staged-files')} .staging-file-row[aria-label=${JSON.stringify(file)}]` });
    else {
      actions.push({ click: c('open-files') });
      const parts = file.split('/');
      for (let i = 1; i < parts.length; i++) actions.push({ expand: fileRow(parts.slice(0, i).join('/')) });
      actions.push({ click: fileRow(file) });
    }
    const viewer = historyViewer(commit || source, file);
    actions.push({ waitFor: viewer });
    ready = viewer;
    if (tab) {
      actions.push({ click: fileTab(tab) });
      ready = `${viewer}[data-tab="${tab}"]`;
      if (tab === 'history') ready += ' [data-history-hash]';
      if (tab === 'blame') ready += ' [data-blame-line]';
      actions.push({ waitFor: ready });
    }
    if (sideTab) {
      actions.push({ click: `.commit-file-details [data-detail-tab="${sideTab}"]` });
      ready = `.commit-file-details[data-tab="${sideTab}"] ${sideTab === 'blame' ? '[data-blame-line]' : '[data-history-hash]'}`;
      actions.push({ waitFor: ready });
    }
    if (options.draft) {
      actions.push({ fill: { selector: c('file-editor'), value: historyContent(options.draft) } });
      ready = `${viewer}[data-dirty="true"]`;
    }
  }
  return { ...historySeed(options.work, options.index), actions, ready };
}
