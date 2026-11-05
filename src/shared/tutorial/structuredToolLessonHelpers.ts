import type { TutorialCompletion, TutorialStep, TutorialText, StructuredExample } from './types';
import { jsonStep, jsonContent, c, editor, element, tool, toolGroup } from './structuredLessonHelpers';
import { fileRow } from './fileLessonHelpers';
export { jsonStep as s, jsonContent as content, c, editor, element, tool, toolGroup, fileRow };
export const structuredViewer = (path: string) => `.file-viewer[data-path=${JSON.stringify(path)}]`;
export const structuredRecipe = (
  path: string,
  saved: StructuredExample,
  options: { draft?: StructuredExample; menu?: boolean; group?: string } = {},
): NonNullable<TutorialStep['prepare']> => ({
  edits: [{ path, content: jsonContent(saved) }],
  click: [fileRow(path)],
  ...(options.draft ? { fill: [{ selector: editor, value: jsonContent(options.draft) }] } : {}),
  after: options.menu || options.group ? [c('file-tools'), ...(options.group ? [toolGroup(options.group)] : [])] : [],
  ready: options.group ? '[data-file-tool-back]' : structuredViewer(path) + ' ' + editor,
});
export const structuredValue = (version: StructuredExample): TutorialCompletion => ({ kind: 'value', selector: editor, value: jsonContent(version) });
export const structuredSaved = (path: string, version: StructuredExample, original: StructuredExample): TutorialCompletion => ({
  kind: 'all',
  conditions: [
    { kind: 'element', selector: structuredViewer(path) + '[data-dirty="false"]' },
    {
      kind: 'working-tree',
      staged: [],
      unstaged: version === original ? [] : [path],
      untracked: [],
      content: [
        { path, source: 'worktree', value: jsonContent(version) },
        { path, source: 'index', value: jsonContent(original) },
      ],
    },
  ],
});
export const structuredFeedback = (id: string, message: TutorialText, error: boolean, version: StructuredExample): TutorialCompletion => ({
  kind: 'all',
  conditions: [structuredValue(version), { kind: 'feedback', trigger: tool(id), message, error }],
});
export const structuredMenu = (prefix: string, path: string, saved: StructuredExample, group: 'json' | 'yaml', id: string, draft?: StructuredExample) => [
  jsonStep(
    prefix + '-menu',
    ['Öffne Werkzeuge', 'Open Tools'],
    ['Klicke Werkzeuge oben im Datei-Viewer.', 'Click Tools at the top of the file viewer.'],
    c('file-tools'),
    {
      prepare: structuredRecipe(path, saved, { draft }),
      completion: element(toolGroup(group)),
    },
  ),
  jsonStep(
    prefix + '-group',
    [`Öffne die Gruppe ${group.toUpperCase()}`, `Open the ${group.toUpperCase()} group`],
    [
      `Klicke ${group.toUpperCase()}. Die verfügbaren Werkzeuge richten sich nach der Dateiendung.`,
      `Click ${group.toUpperCase()}. The available tools depend on the file extension.`,
    ],
    toolGroup(group),
    {
      prepare: structuredRecipe(path, saved, { draft, menu: true }),
      completion: element(tool(id)),
    },
  ),
];
