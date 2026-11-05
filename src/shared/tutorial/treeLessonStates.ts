import type { TutorialFileContent, TutorialStep, TreeExample, TutorialCompletion } from './types';
export const treeContent = (version: TreeExample): TutorialFileContent => ({ example: 'tree-files', version });
export const treePaths = {
  note: 'practice/note.md',
  other: 'practice/other.md',
  keep: 'archive/keep.txt',
  variant: 'variant/note.md',
  created: 'scratch/notes.md',
  renamed: 'practice/updated.md',
  copy: 'archive/note.md',
  both: 'archive/note (copy).md',
};
export const treeOriginal: Readonly<Record<string, TutorialFileContent>> = {
  [treePaths.note]: treeContent('note'),
  [treePaths.other]: treeContent('other'),
  [treePaths.keep]: treeContent('keep'),
  [treePaths.variant]: treeContent('other'),
};
export type TreeLessonState =
  | 'base'
  | 'empty-folder'
  | 'new-empty'
  | 'new-saved'
  | 'renamed-file'
  | 'renamed-folder'
  | 'copied'
  | 'kept-both'
  | 'replaced'
  | 'moved'
  | 'deleted-file'
  | 'deleted-folder';
type Setup = { edits?: Record<string, TutorialFileContent>; deleted?: string[]; directories?: string[]; removedDirectories?: string[] };
export const treeStates: Record<TreeLessonState, Setup> = {
  base: {},
  'empty-folder': { directories: ['scratch'] },
  'new-empty': { directories: ['scratch'], edits: { [treePaths.created]: ['', ''] } },
  'new-saved': { directories: ['scratch'], edits: { [treePaths.created]: treeContent('created') } },
  'renamed-file': { deleted: [treePaths.note], edits: { [treePaths.renamed]: treeContent('note') } },
  'renamed-folder': {
    deleted: [treePaths.note, treePaths.other],
    removedDirectories: ['practice'],
    edits: { 'workbench/updated.md': treeContent('note'), 'workbench/other.md': treeContent('other') },
  },
  copied: { edits: { [treePaths.copy]: treeContent('note') } },
  'kept-both': { edits: { [treePaths.copy]: treeContent('note'), [treePaths.both]: treeContent('note') } },
  replaced: { edits: { [treePaths.copy]: treeContent('other'), [treePaths.both]: treeContent('note') } },
  moved: { deleted: [treePaths.note], edits: { [treePaths.copy]: treeContent('note') } },
  'deleted-file': { deleted: [treePaths.note] },
  'deleted-folder': { deleted: [treePaths.note, treePaths.other], removedDirectories: ['practice'] },
};
export const treeSeed = (state: TreeLessonState): NonNullable<TutorialStep['prepare']> => {
  const setup = treeStates[state];
  return {
    deleted: setup.deleted,
    directories: setup.directories,
    removedDirectories: setup.removedDirectories,
    edits: Object.entries(setup.edits || {}).map(([path, content]) => ({ path, content })),
  };
};
export const treeState = (state: TreeLessonState): TutorialCompletion => {
  const setup = treeStates[state],
    files = { ...treeOriginal, ...setup.edits };
  for (const path of setup.deleted || []) delete files[path];
  return {
    kind: 'working-tree',
    staged: [],
    unstaged: setup.deleted || [],
    untracked: Object.keys(setup.edits || {}).filter((path) => !(path in treeOriginal)),
    absent: setup.deleted,
    content: [
      ...Object.entries(files).map(([path, value]) => ({ path, value, source: 'worktree' as const })),
      ...Object.entries(treeOriginal).flatMap(([path, value]) => [
        { path, value, source: 'index' as const },
        { path, value, source: 'head' as const },
      ]),
    ],
  };
};
