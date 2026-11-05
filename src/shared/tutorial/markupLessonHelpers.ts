import type { MarkupExample, TutorialCompletion, TutorialFileContent, TutorialStep, TutorialText } from './types';
import { fileStep, fileRow, fileTab, fileControl as c, editor, element } from './fileLessonHelpers';
import { tool, toolGroup } from './toolLessonHelpers';
export { fileRow as row, fileTab as tab, c, editor, element, tool, toolGroup };
export { dialog, confirmDialog, cancelDialog } from './stagingLessonHelpers';
export type MarkupKind = 'html' | 'xml';
export const markupPath = (kind: MarkupKind) => (kind === 'html' ? 'page.html' : 'project.xml');
export const markupViewer = (kind: MarkupKind) => `.file-viewer[data-path="${markupPath(kind)}"]`;
export const markupContent = (version: MarkupExample): TutorialFileContent => ({ example: 'markup-files', version });
export const markupStep = (id: string, title: TutorialText, description: TutorialText, target: string, extra: Partial<TutorialStep> = {}) =>
  fileStep(id, title, description, target, { scenario: 'markup', ...extra });
export const markupRecipe = (
  kind: MarkupKind,
  saved: MarkupExample,
  options: { draft?: MarkupExample; menu?: boolean; group?: boolean; tab?: 'text' | 'diff' | 'preview' } = {},
): NonNullable<TutorialStep['prepare']> => ({
  edits: [{ path: markupPath(kind), content: markupContent(saved) }],
  click: [fileRow(markupPath(kind)), fileTab('text')],
  ...(options.draft ? { fill: [{ selector: editor, value: markupContent(options.draft) }] } : {}),
  after: [
    ...(options.tab && options.tab !== 'text' ? [fileTab(options.tab)] : []),
    ...(options.menu || options.group ? [c('file-tools'), ...(options.group ? [toolGroup('markup')] : [])] : []),
  ],
  ready: options.group ? tool('markup-format') : `${markupViewer(kind)}[data-tab="${options.tab || 'text'}"]`,
});
export const markupValue = (version: MarkupExample): TutorialCompletion => ({ kind: 'value', selector: editor, value: markupContent(version) });
export const markupState = (kind: MarkupKind, version: MarkupExample): TutorialCompletion => ({
  kind: 'working-tree',
  staged: [],
  unstaged: version === kind + '-source' ? [] : [markupPath(kind)],
  untracked: [],
  content: [
    { path: markupPath(kind), source: 'worktree', value: markupContent(version) },
    { path: markupPath(kind), source: 'index', value: markupContent(kind === 'html' ? 'html-source' : 'xml-source') },
  ],
});
export const markupSaved = (kind: MarkupKind, version: MarkupExample): TutorialCompletion => ({
  kind: 'all',
  conditions: [{ kind: 'element', selector: markupViewer(kind) + '[data-dirty="false"]' }, markupState(kind, version)],
});
export const markupFailure = (kind: MarkupKind, id: 'markup-format' | 'markup-minify', saved: MarkupExample): TutorialCompletion => ({
  kind: 'all',
  conditions: [
    markupValue(kind === 'html' ? 'html-invalid' : 'xml-invalid'),
    markupState(kind, saved),
    {
      kind: 'feedback',
      trigger: tool(id),
      message:
        kind === 'xml'
          ? ['Failed to parse XML', 'Failed to parse XML']
          : id === 'markup-format'
            ? ['Unexpected character', 'Unexpected character']
            : ['Parse Error:', 'Parse Error:'],
      error: true,
    },
  ],
});
export const markupMenu = (kind: MarkupKind, prefix: string, saved: MarkupExample, draft?: MarkupExample) => [
  markupStep(
    prefix + '-menu',
    ['Öffne Werkzeuge', 'Open Tools'],
    ['Klicke Werkzeuge oben im Datei-Viewer.', 'Click Tools at the top of the file viewer.'],
    c('file-tools'),
    {
      prepare: markupRecipe(kind, saved, { draft }),
      completion: element(toolGroup('markup')),
    },
  ),
  markupStep(
    prefix + '-group',
    [`Öffne die Gruppe ${kind.toUpperCase()}`, `Open the ${kind.toUpperCase()} group`],
    [
      `Klicke ${kind.toUpperCase()}. Die Dateiendung bestimmt, welche Markup-Werkzeuge angeboten werden.`,
      `Click ${kind.toUpperCase()}. The file extension determines which markup tools are offered.`,
    ],
    toolGroup('markup'),
    {
      prepare: markupRecipe(kind, saved, { draft, menu: true }),
      completion: element(tool('markup-format')),
    },
  ),
];
export const markupDiscard = (kind: MarkupKind, saved: MarkupExample): NonNullable<TutorialStep['prepare']> => ({
  ...markupRecipe(kind, saved, { draft: kind === 'html' ? 'html-invalid' : 'xml-invalid' }),
  actions: [{ waitFor: `${markupViewer(kind)}[data-dirty="true"]` }, { click: c('close-file') }],
  ready: '.dialog-modal',
});
