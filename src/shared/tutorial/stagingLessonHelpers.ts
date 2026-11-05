import type { TutorialCompletion, TutorialStep, TutorialText } from './types';
import { step } from './catalogSteps';
export const stagingControl = (name: string) => `[data-tutorial="${name}"]`;
export const stagingRow = (section: string, path: string) => `${stagingControl(`${section}-files`)} .staging-file-row[aria-label="${path}"]`;
export const dialog = '.dialog-modal';
export const confirmDialog = `${dialog} [data-dialog-action="confirm"]`;
export const cancelDialog = `${dialog} [data-dialog-action="cancel"]`;
export const readmeHead: TutorialText = ['# OGC-Lernprojekt\n\nHallo Welt!\n', '# OGC-Lernprojekt\n\nHallo Welt!\n'];
export const readmeIndex: TutorialText = [
  '# OGC-Lernprojekt\n\nWillkommen in deinem Lernprojekt!\n',
  '# OGC-Lernprojekt\n\nWillkommen in deinem Lernprojekt!\n',
];
export const readmeLater: TutorialText = [readmeIndex[0] + 'Eine spätere Bearbeitung.\n', readmeIndex[1] + 'A later edit.\n'];
export const newScopeFiles = ['notes.txt', 'docs/ideas.md'];
export const modifiedScopeFiles = ['README.md', 'package.json'];
export const scopeRecipe = (options: NonNullable<TutorialStep['prepare']> = {}, filter = ''): TutorialStep['prepare'] => ({
  ...options,
  fill: [{ selector: stagingControl('staging-search'), value: [filter, filter] }, ...(options.fill || [])],
});
export const scopeStep = (id: string, title: TutorialText, text: TutorialText, target = stagingControl('staging'), extra: Partial<TutorialStep> = {}) =>
  step(id, title, text, 'repo', target, { scenario: 'scope', inspector: 'staging', continue: true, ...extra });
export const tree = (
  staged: readonly string[],
  unstaged: readonly string[],
  untracked: readonly string[],
  extra: Partial<Extract<TutorialCompletion, { kind: 'working-tree' }>> = {},
): TutorialCompletion => ({ kind: 'working-tree', repoPath: '/tutorial/OGC-Lernprojekt', staged, unstaged, untracked, ...extra });
export const element = (selector: string): TutorialCompletion => ({ kind: 'element', selector });
