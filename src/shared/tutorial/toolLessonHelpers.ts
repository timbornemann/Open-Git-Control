import type { TutorialCompletion, TutorialFileContent, TutorialStep, TutorialText, ToolExample } from './types';
import type { TextFileEncodingDto } from '../ipc/contracts/git';
import { fileStep, fileRow, fileTab, fileViewer, editor, fileControl } from './fileLessonHelpers';
export { fileRow as row, fileViewer as viewer, editor, fileControl as c, element } from './fileLessonHelpers';
export const tool = (id: string) => `[data-file-tool="${id}"]`;
export const toolGroup = (id: string) => `[data-file-tool-group="${id}"]`;
export const toolContent = (version: ToolExample): TutorialFileContent => ({ example: 'editor-tools', version });
export const toolStep = (id: string, title: TutorialText, description: TutorialText, target = editor, extra: Partial<TutorialStep> = {}) =>
  fileStep(id, title, description, target, { scenario: 'text-tools', ...extra });
export const encodingStep = (id: string, title: TutorialText, description: TutorialText, target = editor, extra: Partial<TutorialStep> = {}) =>
  toolStep(id, title, description, target, { scenario: 'encoding', ...extra });
export const toolRecipe = (
  version: ToolExample = 'lines',
  options: { encoding?: TextFileEncodingDto; group?: string; menu?: boolean; draft?: ToolExample; choose?: string; whitespace?: boolean } = {},
): NonNullable<TutorialStep['prepare']> => ({
  edits: [{ path: 'README.md', content: toolContent(version), encoding: options.encoding }],
  click: [
    fileRow(),
    fileTab('text'),
    ...(options.choose || options.whitespace ? [fileControl('file-tools'), toolGroup('encoding'), tool(options.choose || 'whitespace')] : []),
  ],
  ...(options.draft ? { fill: [{ selector: editor, value: toolContent(options.draft) }] } : {}),
  after: options.menu || options.group ? [fileControl('file-tools'), ...(options.group ? [toolGroup(options.group)] : [])] : [],
  ready: options.group ? toolGroupReady(options.group) : `${fileViewer} ${editor}`,
});
const toolGroupReady = (group: string) => (group === 'encoding' ? tool('utf8') : group === 'lines' ? tool('sort-lines') : `[data-file-tool-back]`);
export const toolValue = (version: ToolExample): TutorialCompletion => ({ kind: 'value', selector: editor, value: toolContent(version) });
export const savedTool = (
  version: ToolExample,
  encoding: TextFileEncodingDto = 'utf8',
  lineEnding?: 'lf' | 'crlf',
  base: ToolExample = version.startsWith('encoding') ? 'encoding' : 'lines',
): TutorialCompletion => ({
  kind: 'all',
  conditions: [
    { kind: 'element', selector: `${fileViewer}[data-dirty="false"]` },
    { kind: 'file-format', path: 'README.md', source: 'worktree', encoding, lineEnding },
    { kind: 'file-format', path: 'README.md', source: 'index', encoding: 'utf8', lineEnding: 'lf' },
    {
      kind: 'working-tree',
      content: [
        { path: 'README.md', source: 'worktree', value: toolContent(version) },
        { path: 'README.md', source: 'index', value: toolContent(base) },
      ],
    },
  ],
});
