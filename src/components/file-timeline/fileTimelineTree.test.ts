import { describe, expect, it } from 'vitest';
import { FileTimelineTreeReader } from './fileTimelineTree';
import type { FileTimelineCommit, FileTimelineNode } from './types';
const files = (tree: FileTimelineNode): [string, string][] => (tree.type === 'file' ? [[tree.path, tree.status]] : [...tree.children!.values()].flatMap(files));
const commit = (changes: FileTimelineCommit['changes']): FileTimelineCommit => ({ hash: 'a', author: 'Alice', date: '2026-10-10', subject: '', changes });
describe('timeline tree reconstruction', () => {
  it('retains baseline and intermediate changes even when playback only selects a later filtered commit', () => {
    const commits = [
      { ...commit([{ status: 'added', path: 'src/new.ts' }]), baselineFiles: ['old.ts', 'keep.ts'] },
      commit([{ status: 'renamed', path: 'src/moved.ts', oldPath: 'old.ts' }]),
      commit([
        { status: 'deleted', path: 'src/new.ts' },
        { status: 'modified', path: 'keep.ts' },
      ]),
    ];
    const reader = new FileTimelineTreeReader(commits);
    expect(files(reader.tree(2))).toEqual([
      ['keep.ts', 'modified'],
      ['src/moved.ts', 'unchanged'],
    ]);
    expect(files(reader.tree(0))).toEqual([
      ['old.ts', 'unchanged'],
      ['keep.ts', 'unchanged'],
      ['src/new.ts', 'added'],
    ]);
    expect(files(reader.tree(2, 'src/'))).toEqual([['src/moved.ts', 'unchanged']]);
  });
  it('reconstructs forward and backward jumps across checkpoint boundaries and reuses an unchanged tree', () => {
    const commits = Array.from({ length: 2000 }, (_, index) => commit([{ status: 'added', path: `src/${index}.ts` }]));
    const reader = new FileTimelineTreeReader(commits);
    expect(files(reader.tree(1999))).toHaveLength(2000);
    expect(files(reader.tree(400))).toHaveLength(401);
    expect(files(reader.tree(800))).toHaveLength(801);
    const tree = reader.tree(800);
    expect(reader.tree(800)).toBe(tree);
    expect(files(reader.tree(2))).toHaveLength(3);
    expect(files(reader.tree(1999))).toHaveLength(2000);
  });
});
