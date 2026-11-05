import type { FormatExample, TutorialFileContent, TutorialStep, TutorialText } from './types';
import { fileStep, fileRow, fileTab, editor } from './fileLessonHelpers';
export { fileControl as c, fileRow as row, fileTab as tab, editor, element } from './fileLessonHelpers';
export type FormatKind = 'markdown' | 'html' | 'csv';
export const formatPath = (kind: FormatKind) => ({ markdown: 'docs/guide.md', html: 'site/index.html', csv: 'data/tasks.csv' })[kind];
export const formatViewer = (kind: FormatKind) => `.file-viewer[data-path="${formatPath(kind)}"]`;
export const formatContent = (version: FormatExample): TutorialFileContent => ({ example: 'file-formats', version });
export const formatStep = (id: string, title: TutorialText, description: TutorialText, target: string, extra: Partial<TutorialStep> = {}) =>
  fileStep(id, title, description, target, { scenario: 'formats', ...extra });
export const formatRecipe = (
  kind: FormatKind,
  { saved, draft, tab = 'text' }: { saved?: FormatExample; draft?: FormatExample; tab?: 'text' | 'preview' | 'table' | 'diff' } = {},
): NonNullable<TutorialStep['prepare']> => ({
  ...(saved ? { edits: [{ path: formatPath(kind), content: formatContent(saved) }] } : {}),
  click: [fileRow(formatPath(kind).split('/')[0]), fileRow(formatPath(kind)), ...(!draft && tab !== 'text' ? [fileTab(tab)] : [])],
  ...(draft ? { fill: [{ selector: editor, value: formatContent(draft) }] } : {}),
  ...(draft && tab !== 'text' ? { after: [fileTab(tab)] } : {}),
  ready: `${formatViewer(kind)}[data-tab="${tab}"]${draft ? '[data-dirty="true"]' : ''}`,
});
export const formatValue = (version: FormatExample) => ({ kind: 'value' as const, selector: editor, value: formatContent(version) });
export const formatSaved = (kind: FormatKind, version: FormatExample) => ({
  kind: 'all' as const,
  conditions: [
    { kind: 'element' as const, selector: `${formatViewer(kind)}[data-dirty="false"]` },
    {
      kind: 'working-tree' as const,
      staged: [],
      unstaged: [formatPath(kind)],
      untracked: [],
      content: [
        { path: formatPath(kind), source: 'worktree' as const, value: formatContent(version) },
        { path: formatPath(kind), source: 'index' as const, value: formatContent(kind) },
      ],
    },
  ],
});
