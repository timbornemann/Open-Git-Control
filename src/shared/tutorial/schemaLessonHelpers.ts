import type { TutorialCompletion, TutorialStep, StructuredExample, TutorialPreparationAction } from './types';
import { jsonRecipe, jsonContent, jsonValue, c, tool, toolGroup } from './structuredLessonHelpers';
export { jsonStep as s, jsonRecipe as p, jsonRow, jsonViewer, jsonValue, jsonContent, c, tool, toolGroup, editor, element } from './structuredLessonHelpers';
export { dialog, confirmDialog, cancelDialog } from './stagingLessonHelpers';
export const schemaField = '[data-dialog-field="schema"] textarea';
const confirm = '.dialog-modal [data-dialog-action="confirm"]';
export const schemaIssue = (index: number) => `.dialog-modal .dialog-context-list dd:nth-of-type(${index})`;
export const schemaIssues = [
  '$: must NOT have additional properties',
  '/name: must be string',
  '/z: must be >= 0',
  '/items/0/id: must be >= 1',
  '/items/0/active: must be boolean',
];
export const schemaDialog = (draft?: StructuredExample, schema?: StructuredExample, result = false): NonNullable<TutorialStep['prepare']> => {
  const actions: TutorialPreparationAction[] = [
    ...(draft ? [{ fill: { selector: c('file-editor'), value: jsonContent(draft) } }, { waitFor: '.file-viewer[data-dirty="true"]' }] : []),
    { click: c('file-tools') },
    { click: toolGroup('json') },
    { click: tool('json-schema') },
    { waitValue: { selector: schemaField, value: ['{\n  "type": "object"\n}', '{\n  "type": "object"\n}'] } },
    ...(schema ? [{ fill: { selector: schemaField, value: jsonContent(schema) } }] : []),
    ...(result ? [{ click: confirm }] : []),
  ];
  return { ...jsonRecipe(), actions, ready: result ? schemaIssue(5) : schemaField };
};
export const schemaResult: TutorialCompletion = {
  kind: 'all',
  conditions: schemaIssues.map((text, index) => ({ kind: 'text', selector: schemaIssue(index + 1), value: [text, text] })),
};
export const schemaSuccess: TutorialCompletion = {
  kind: 'all',
  conditions: [jsonValue('base'), { kind: 'feedback', trigger: confirm, message: ['JSON entspricht dem Schema.', 'JSON matches the schema.'], error: false }],
};
export const schemaSyntaxError: TutorialCompletion = {
  kind: 'all',
  conditions: [jsonValue('base'), { kind: 'feedback', trigger: confirm, message: ['Invalid JSON/JSONC:', 'Invalid JSON/JSONC:'], error: true }],
};
export const schemaClosed = (draft: StructuredExample): TutorialCompletion => ({
  kind: 'all',
  conditions: [{ kind: 'absent', selector: '.dialog-modal' }, jsonValue(draft)],
});
