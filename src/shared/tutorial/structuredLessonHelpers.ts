import type { TutorialStep, TutorialText, TutorialFileContent, TutorialCompletion, TutorialEditorSelection, StructuredExample } from './types';
import { fileStep, fileRow, fileControl } from './fileLessonHelpers';
export { fileControl as c, editor, element } from './fileLessonHelpers';
export { tool, toolGroup } from './toolLessonHelpers';
export const jsonPath = 'config.json';
export const jsonRow = fileRow(jsonPath);
export const jsonViewer = '.file-viewer[data-path="config.json"]';
export const jsonEditor = '[data-tutorial="file-editor"]';
export const jsonContent = (version: StructuredExample): TutorialFileContent => ({ example: 'structured-files', version });
export const jsonStep = (id: string, title: TutorialText, description: TutorialText, target: string, extra: Partial<TutorialStep> = {}) =>
  fileStep(id, title, description, target, { scenario: 'structured', ...extra });
export const jsonRecipe = (
  saved: StructuredExample = 'base',
  options: { draft?: StructuredExample; menu?: boolean; group?: boolean; selection?: TutorialEditorSelection } = {},
): NonNullable<TutorialStep['prepare']> => ({
  edits: [{ path: jsonPath, content: jsonContent(saved) }],
  click: [jsonRow],
  ...(options.draft ? { fill: [{ selector: jsonEditor, value: jsonContent(options.draft) }] } : {}),
  ...(options.selection ? { selection: options.selection } : {}),
  after: options.menu || options.group ? [fileControl('file-tools'), ...(options.group ? ['[data-file-tool-group="json"]'] : [])] : [],
  ready: options.group ? '[data-file-tool="json-format"]' : `${jsonViewer} ${jsonEditor}`,
});
export const jsonValue = (version: StructuredExample): TutorialCompletion => ({ kind: 'value', selector: jsonEditor, value: jsonContent(version) });
export const jsonSaved = (version: StructuredExample): TutorialCompletion => ({
  kind: 'all',
  conditions: [
    { kind: 'element', selector: `${jsonViewer}[data-dirty="false"]` },
    {
      kind: 'working-tree',
      staged: [],
      unstaged: version === 'base' ? [] : [jsonPath],
      untracked: [],
      content: [
        { path: jsonPath, source: 'worktree', value: jsonContent(version) },
        { path: jsonPath, source: 'index', value: jsonContent('base') },
      ],
    },
  ],
});
export const jsonSelection = (from: number, to: number): TutorialEditorSelection => ({ selector: jsonEditor, from, to });
export const jsonSelectionRule = (from: number, to: number): TutorialCompletion => ({
  kind: 'all',
  conditions: [jsonValue('base'), { kind: 'selection', ...jsonSelection(from, to) }],
});
export const jsonCopied = (path: string): TutorialCompletion => ({
  kind: 'all',
  conditions: [
    { kind: 'clipboard', value: [path, path] },
    { kind: 'feedback', trigger: '[data-file-tool="json-path"]', message: [`JSON-Pfad kopiert: ${path}`, `Copied JSON path: ${path}`], error: false },
  ],
});
