import type { TutorialStep, TutorialText, TutorialPreparationAction, TutorialCompletion, TutorialFileContent, TreeExample } from './types';
import { fileStep, fileRow, fileControl, editor, element } from './fileLessonHelpers';
import { treeSeed, treeState, treeContent, treePaths, type TreeLessonState } from './treeLessonStates';
export { fileRow as row, fileControl as c, editor, element, treeSeed as p, treeState as state, treeContent as content, treePaths as paths };
export { dialog, confirmDialog, cancelDialog } from './stagingLessonHelpers';
export const treeMenuSelector = '.working-tree-context-menu';
export const treeAction = (id: string) => `[data-tree-action="${id}"]`;
export const nameField = '[data-dialog-field="name"] input';
export const treeStep = (id: string, title: TutorialText, description: TutorialText, target: string, extra: Partial<TutorialStep> = {}) =>
  fileStep(id, title, description, target, { scenario: 'tree-files', ...extra });
const ancestors = (path: string) =>
  path
    .split('/')
    .slice(0, -1)
    .map((_, index, parts) => parts.slice(0, index + 1).join('/'));
export const treePrepare = (
  state: TreeLessonState,
  actions: readonly TutorialPreparationAction[] = [],
  ready = '.working-directory-tree',
): NonNullable<TutorialStep['prepare']> => ({ ...treeSeed(state), actions, ready });
export const expandTreePath = (path: string): TutorialPreparationAction[] => ancestors(path).map((parent) => ({ expand: fileRow(parent) }));
const openMenu = (path: string): TutorialPreparationAction => (path ? { contextMenu: fileRow(path) } : { click: treeAction('root-menu') });
export const treeContext = (state: TreeLessonState, path: string, action = 'rename') =>
  treePrepare(state, [...expandTreePath(path), openMenu(path)], treeAction(action));
export const treeInput = (state: TreeLessonState, path: string, action: 'create-file' | 'create-folder' | 'rename', name?: string) =>
  treePrepare(
    state,
    [
      ...expandTreePath(path),
      openMenu(path),
      { click: treeAction(action) },
      { waitValue: { selector: nameField, value: action === 'rename' ? [path.split('/').slice(-1)[0], path.split('/').slice(-1)[0]] : ['', ''] } },
      ...(name === undefined ? [] : [{ fill: { selector: nameField, value: [name, name] as const } }]),
    ],
    nameField,
  );
export const treeClipboard = (state: TreeLessonState, destination: string, source = treePaths.note, cut = false, confirm = false) =>
  treePrepare(
    state,
    [
      ...[...new Set([...ancestors(source), ...ancestors(destination)])].map((path) => ({ expand: fileRow(path) })),
      { contextMenu: fileRow(source) },
      { click: treeAction(cut ? 'cut' : 'copy') },
      openMenu(destination),
      ...(confirm ? [{ click: treeAction('paste') }] : []),
    ],
    confirm ? '.dialog-modal' : treeAction('paste'),
  );
export const treeHolding = (state: TreeLessonState, source = treePaths.note, cut = false) =>
  treePrepare(state, [...expandTreePath(source), { contextMenu: fileRow(source) }, { click: treeAction(cut ? 'cut' : 'copy') }]);
export const treeDeleteDialog = (state: TreeLessonState, path: string) =>
  treePrepare(state, [...expandTreePath(path), openMenu(path), { click: treeAction('delete') }], '.dialog-modal');
export const treeViewer = (path: string) => `.file-viewer[data-path=${JSON.stringify(path)}]`;
export const treeFile = (state: TreeLessonState, path: string, draft?: TreeExample) =>
  treePrepare(
    state,
    [
      ...expandTreePath(path),
      { click: fileRow(path) },
      { waitFor: `${treeViewer(path)} ${editor}` },
      ...(draft ? [{ fill: { selector: editor, value: treeContent(draft) } }] : []),
    ],
    treeViewer(path),
  );
export const treeValue = (value: TutorialFileContent): TutorialCompletion => ({ kind: 'value', selector: editor, value });
export const named = (name: string): TutorialCompletion => ({ kind: 'value', selector: nameField, value: [name, name] });
export const treeAll = (...conditions: TutorialCompletion[]): TutorialCompletion => ({ kind: 'all', conditions });
export const treeClosed = (state: TreeLessonState) => treeAll({ kind: 'absent', selector: '.dialog-modal' }, treeState(state));
export const treeContextClosed: TutorialCompletion = { kind: 'absent', selector: treeMenuSelector };
export const treeOpened = (state: TreeLessonState, path: string) => treeAll(element(fileRow(path)), treeState(state));
export const treeContextStep = (id: string, path: string, state: TreeLessonState, action = 'rename') =>
  treeStep(
    id,
    ['Öffne die Dateiaktionen', 'Open file actions'],
    [
      `Öffne das Kontextmenü von ${path} per Rechtsklick oder mit Umschalt+F10 auf dem fokussierten Eintrag.`,
      `Open the context menu for ${path} by right-clicking, or press Shift+F10 while it is focused.`,
    ],
    fileRow(path),
    { prepare: treePrepare(state, expandTreePath(path)), gesture: 'contextmenu', completion: element(treeAction(action)) },
  );
