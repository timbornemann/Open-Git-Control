import type { EditorExample, TutorialFileContent, TutorialStep, TutorialText } from './types';
import { step } from './catalogSteps';
import { stagingControl as c, tree } from './stagingLessonHelpers';
export { stagingControl as fileControl, element, dialog, cancelDialog, confirmDialog } from './stagingLessonHelpers';
export const fileViewer = '.file-viewer[data-path="README.md"]';
export const editor = c('file-editor');
export const fileRow = (path = 'README.md') => `[data-file-path=${JSON.stringify(path)}]`;
export const fileTab = (tab: string) => `.file-viewer [data-file-tab="${tab}"]`;
export const editorText = (version: EditorExample): TutorialFileContent => ({ example: 'editor-readme', version });
export const fileRecipe = (
  work: EditorExample = 'head',
  index: EditorExample = 'head',
  extra: NonNullable<TutorialStep['prepare']> = {},
): TutorialStep['prepare'] => ({
  edits: [{ path: 'README.md', content: editorText(work) }],
  indexEdits: [{ path: 'README.md', content: editorText(index) }],
  click: [fileRow(), fileTab('text')],
  ...extra,
});
export const draftRecipe = (draft: EditorExample = 'draft', work: EditorExample = 'head') =>
  fileRecipe(work, 'head', { fill: [{ selector: editor, value: editorText(draft) }], ready: `${fileViewer}[data-dirty="true"]` });
export const indexRecipe = (draft?: EditorExample) =>
  fileRecipe('work', 'index', {
    diff: { path: 'README.md', source: 'staged' },
    click: [fileTab('text')],
    ...(draft ? { fill: [{ selector: editor, value: editorText(draft) }], ready: `${fileViewer}[data-dirty="true"]` } : {}),
  });
export const fileStep = (id: string, title: TutorialText, description: TutorialText, target = editor, extra: Partial<TutorialStep> = {}) =>
  step(id, title, description, 'repo', target, { scenario: 'editor', inspector: 'files', openView: 'files', continue: true, ...extra });
export const editorValue = (version: EditorExample) => ({ kind: 'value' as const, selector: editor, value: editorText(version) });
export const fileState = (work: EditorExample, index: EditorExample = 'head') =>
  tree(index === 'head' ? [] : ['README.md'], work === index ? [] : ['README.md'], [], {
    content: [
      { path: 'README.md', source: 'worktree', value: editorText(work) },
      { path: 'README.md', source: 'index', value: editorText(index) },
      { path: 'README.md', source: 'head', value: editorText('head') },
    ],
  });
