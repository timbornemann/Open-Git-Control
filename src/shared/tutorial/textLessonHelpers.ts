import type { TutorialStep, TutorialText, TutorialEditorSelection, ToolExample, TutorialCompletion } from './types';
import { toolStep, toolRecipe, toolValue, savedTool, tool, toolGroup, c, row, editor } from './toolLessonHelpers';
import { fileTab } from './fileLessonHelpers';
export { tool, toolGroup, c, row, viewer, editor, element, toolContent, toolValue } from './toolLessonHelpers';
export { dialog, cancelDialog, confirmDialog } from './stagingLessonHelpers';
export const textStep = (id: string, title: TutorialText, description: TutorialText, target = editor, extra: Partial<TutorialStep> = {}) =>
  toolStep(id, title, description, target, { scenario: 'affixes', ...extra });
export const codecStep = (id: string, title: TutorialText, description: TutorialText, target = editor, extra: Partial<TutorialStep> = {}) =>
  toolStep(id, title, description, target, { scenario: 'codecs', ...extra });
export const selectionStep = (id: string, title: TutorialText, description: TutorialText, target = editor, extra: Partial<TutorialStep> = {}) =>
  codecStep(id, title, description, target, { scenario: 'selection-codecs', ...extra });
export const textRecipe = (
  saved: ToolExample = 'affix-base',
  options: { draft?: ToolExample; menu?: boolean; group?: string; selection?: TutorialEditorSelection; invoke?: string } = {},
): NonNullable<TutorialStep['prepare']> => {
  const { selection, invoke, ...rest } = options;
  const recipe = toolRecipe(saved, rest);
  return { ...recipe, ...(selection ? { selection } : {}), ...(invoke ? { after: [...(recipe.after || []), tool(invoke)], ready: undefined } : {}) };
};
export const affixField = (id: string) => `[data-dialog-field="${id}"] input`;
export const affixDialog = (saved: ToolExample = 'affix-base', prefix = '', suffix = ''): NonNullable<TutorialStep['prepare']> => ({
  ...toolRecipe(saved),
  click: [row(), fileTab('text'), c('file-tools'), toolGroup('lines'), tool('affixes')],
  fill: [
    { selector: affixField('prefix'), value: [prefix, prefix] },
    { selector: affixField('suffix'), value: [suffix, suffix] },
  ],
  ready: '.dialog-modal',
});
export const compactDialog = (saved: ToolExample = 'affixed') => ({ ...textRecipe(saved, { group: 'lines', invoke: 'compact' }), ready: '.dialog-modal' });
export const textSaved = (version: ToolExample, base: ToolExample = 'affix-base') => savedTool(version, 'utf8', undefined, base);
export const exactSelection = (from: number, to: number): TutorialEditorSelection => ({ selector: editor, from, to });
export const selectRule = (version: ToolExample, from: number, to: number): TutorialCompletion => ({
  kind: 'all',
  conditions: [toolValue(version), { kind: 'selection', ...exactSelection(from, to) }],
});
export const unchangedError = (version: ToolExample, id: string, message: TutorialText): TutorialCompletion => ({
  kind: 'all',
  conditions: [toolValue(version), { kind: 'feedback', trigger: tool(id), message, error: true }],
});
