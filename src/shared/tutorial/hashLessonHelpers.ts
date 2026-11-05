import type { TutorialStep, TutorialText, TutorialFileContent, TutorialCompletion, HashExample, HashAlgorithm, HashContentVersion } from './types';
import { toolStep, savedTool } from './toolLessonHelpers';
import { textRecipe, tool } from './textLessonHelpers';
export { tool, toolGroup, c, row, viewer, editor, element, toolContent, toolValue } from './toolLessonHelpers';
export { dialog, confirmDialog } from './stagingLessonHelpers';
export const hashStep = (id: string, title: TutorialText, description: TutorialText, target: string, extra: Partial<TutorialStep> = {}) =>
  toolStep(id, title, description, target, { scenario: 'hashes', ...extra });
export const hashRecipe = (saved: HashContentVersion = 'hash-base', options: Parameters<typeof textRecipe>[1] = {}) => textRecipe(saved, options);
export const hashDialog = (saved: HashContentVersion = 'hash-base', draft?: HashContentVersion) => ({
  ...hashRecipe(saved, { draft, group: 'hashes', invoke: 'show-hashes' }),
  ready: '.dialog-modal',
});
export const hashText = (version: HashExample, algorithm: HashAlgorithm): TutorialFileContent => ({ example: 'file-hash', version, algorithm });
export const hashRow = (algorithm: Exclude<HashAlgorithm, 'all'>) =>
  `.dialog-modal .dialog-context-list dd:nth-of-type(${['sha256', 'sha1', 'md5'].indexOf(algorithm) + 1})`;
export const hashShown = (version: HashExample): TutorialCompletion => ({
  kind: 'all',
  conditions: (['sha256', 'sha1', 'md5'] as const).map((algorithm) => ({ kind: 'text', selector: hashRow(algorithm), value: hashText(version, algorithm) })),
});
export const hashCopied = (id: string, version: HashExample, algorithm: HashAlgorithm, trigger = tool(id)): TutorialCompletion => {
  const label = { sha256: 'SHA-256', sha1: 'SHA-1', md5: 'MD5', all: 'Alle Hashwerte' }[algorithm];
  return {
    kind: 'all',
    conditions: [
      { kind: 'clipboard', value: hashText(version, algorithm) },
      { kind: 'feedback', trigger, message: [`${label} kopiert.`, `${algorithm === 'all' ? 'All hashes' : label} copied.`], error: false },
    ],
  };
};
export const hashSaved = (version: HashContentVersion) => savedTool(version, 'utf8', 'lf', 'hash-base');
export const metric = (name: string) => `[data-file-metric="${name}"]`;
