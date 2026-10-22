import { describe, expect, it } from 'vitest';
import { buildCommitFileTree, commitFileTreeRows } from './commitFileTreeRows';

describe('commit file tree rows', () => {
  it('groups changed files by their full paths and sorts folders before files on each level', () => {
    const files = [
      { status: 'M', path: 'src/z.ts' },
      { status: 'A', path: 'README.md' },
      { status: 'M', path: 'docs/index.ts' },
      { status: 'A', path: 'src/app/index.ts' },
      { status: 'D', path: 'src/a.ts' },
    ];
    const tree = buildCommitFileTree(files);
    const rows = commitFileTreeRows(tree, new Set());
    expect(rows.map(({ node }) => node.path)).toEqual(['docs', 'docs/index.ts', 'src', 'src/app', 'src/app/index.ts', 'src/a.ts', 'src/z.ts', 'README.md']);
    expect(rows.map(({ isLast, ancestorIsLast }) => [isLast, ancestorIsLast])).toEqual([
      [false, []],
      [true, [false]],
      [false, []],
      [false, [false]],
      [true, [false, false]],
      [false, [false]],
      [true, [false]],
      [true, []],
    ]);
    expect(files[0].path).toBe('src/z.ts');
  });

  it('retains nested expansion choices when a parent is closed and reopened', () => {
    const tree = buildCommitFileTree([
      { status: 'M', path: 'src/app/index.ts' },
      { status: 'A', path: 'src/root.ts' },
    ]);
    const paths = (collapsed: string[]) => commitFileTreeRows(tree, new Set(collapsed)).map(({ node }) => node.path);
    expect(paths(['src'])).toEqual(['src']);
    expect(paths(['src', 'src/app'])).toEqual(['src']);
    expect(paths(['src/app'])).toEqual(['src', 'src/app', 'src/root.ts']);
    expect(paths([])).toEqual(['src', 'src/app', 'src/app/index.ts', 'src/root.ts']);
  });

  it('keeps deleted file and added directory nodes with the same path distinct', () => {
    const files = [
      { status: 'D', path: 'src' },
      { status: 'A', path: 'src/app.ts' },
    ];
    const rows = commitFileTreeRows(buildCommitFileTree(files), new Set());
    expect(rows.map(({ node }) => node.key)).toEqual(['directory:src', 'file:src/app.ts', 'file:src']);
    const closed = commitFileTreeRows(buildCommitFileTree(files), new Set(['src']));
    expect(closed.map(({ node }) => node.key)).toEqual(['directory:src', 'file:src']);
  });

  it('uses the destination of renames and preserves special filenames and original objects', () => {
    const files = [
      { status: 'R100', path: 'new/index.ts', oldPath: 'old/index.ts' },
      { status: 'A', path: ' leading space.txt' },
      { status: 'M', path: 'docs/a\tb\nc.md' },
      { status: 'D', path: 'literal\\name.txt' },
      { status: 'C100', path: '__proto__/constructor.ts', oldPath: 'source.ts' },
      { status: 'T', path: 'Daten/Änderungen 😀.txt' },
    ];
    const rows = commitFileTreeRows(buildCommitFileTree(files), new Set());
    for (const file of files) {
      const node = rows.find(({ node }) => node.kind === 'file' && node.path === file.path)!.node;
      expect(node.kind === 'file' && node.file).toBe(file);
      expect(node.name).toBe(file.path.split('/').at(-1));
    }
    expect(rows.some(({ node }) => node.path === 'old')).toBe(false);
    expect(rows.find(({ node }) => node.path === 'literal\\name.txt')!.node.name).toBe('literal\\name.txt');
  });

  it('handles empty commits and deeply nested paths without recursive traversal', () => {
    expect(commitFileTreeRows(buildCommitFileTree([]), new Set())).toEqual([]);
    const path = Array.from({ length: 400 }, (_, index) => `level-${index}`).join('/') + '/file.ts';
    const rows = commitFileTreeRows(buildCommitFileTree([{ status: 'A', path }]), new Set());
    expect(rows).toHaveLength(401);
    expect(rows.at(-1)?.node.path).toBe(path);
  });
});
