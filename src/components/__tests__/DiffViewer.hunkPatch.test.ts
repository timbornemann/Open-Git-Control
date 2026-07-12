import { describe, expect, it } from 'vitest';
import { buildHunkPatch, parseDiff, sideBySideRows, type ParsedHunk } from '@/utils/diffParser';

describe('DiffViewer hunk patch reconstruction', () => {
  it('preserves file metadata and no-newline markers for new-file hunks', () => {
    const diff = [
      'diff --git a/example.txt b/example.txt',
      'new file mode 100644',
      'index 0000000..f572d39',
      '--- /dev/null',
      '+++ b/example.txt',
      '@@ -0,0 +1 @@',
      '+hello',
      '\\ No newline at end of file',
    ].join('\n');

    const parsed = parseDiff(diff);
    expect(parsed.hunks).toHaveLength(1);

    const patch = buildHunkPatch(parsed.fileHeader, parsed.hunks[0]!);
    expect(patch).toContain('new file mode 100644');
    expect(patch).toContain('--- /dev/null');
    expect(patch).toContain('+++ b/example.txt');
    expect(patch).toContain('\\ No newline at end of file');
  });

  it('keeps rename metadata in single-hunk patches', () => {
    const diff = [
      'diff --git a/old-name.txt b/new-name.txt',
      'similarity index 88%',
      'rename from old-name.txt',
      'rename to new-name.txt',
      'index 1f2a3b4..5c6d7e8 100644',
      '--- a/old-name.txt',
      '+++ b/new-name.txt',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    const parsed = parseDiff(diff);
    expect(parsed.hunks).toHaveLength(1);

    const patch = buildHunkPatch(parsed.fileHeader, parsed.hunks[0]!);
    expect(patch).toContain('similarity index 88%');
    expect(patch).toContain('rename from old-name.txt');
    expect(patch).toContain('rename to new-name.txt');
  });

  it('omits the stale full-file index object IDs while preserving patch paths', () => {
    const parsed = parseDiff(
      [
        'diff --git a/example.ts b/example.ts',
        'index 1111111..2222222 100644',
        '--- a/example.ts',
        '+++ b/example.ts',
        '@@ -1 +1 @@',
        '-before',
        '+after',
      ].join('\n'),
    );

    const patch = buildHunkPatch(parsed.fileHeader, parsed.hunks[0]!);
    expect(patch).not.toContain('index 1111111..2222222 100644');
    expect(patch).toContain('--- a/example.ts');
    expect(patch).toContain('+++ b/example.ts');
  });

  it('parses additions, deletions, context rows, and no-newline markers', () => {
    const parsed = parseDiff(
      [
        'diff --git a/app.ts b/app.ts',
        '--- a/app.ts',
        '+++ b/app.ts',
        '@@ -3,3 +3,4 @@',
        ' keep',
        '-oldCall()',
        '+newCall()',
        '+extraCall()',
        ' trailing',
        '\\ No newline at end of file',
      ].join('\n'),
    );

    expect(parsed.fileHeader).toEqual(['diff --git a/app.ts b/app.ts', '--- a/app.ts', '+++ b/app.ts']);
    expect(parsed.hunks[0]?.rows).toEqual([
      { type: 'context', text: 'keep', leftNo: 3, rightNo: 3 },
      { type: 'del', text: 'oldCall()', leftNo: 4, rightNo: null },
      { type: 'add', text: 'newCall()', leftNo: null, rightNo: 4 },
      { type: 'add', text: 'extraCall()', leftNo: null, rightNo: 5 },
      { type: 'context', text: 'trailing', leftNo: 5, rightNo: 6 },
    ]);
  });

  it('pairs adjacent deletion and addition blocks for side-by-side rendering', () => {
    const parsed = parseDiff(['@@ -1,4 +1,4 @@', ' context', '-old one', '-old two', '+new one', ' unchanged', '+added later'].join('\n'));

    const rows = sideBySideRows(parsed.hunks[0]!.rows);
    expect(rows).toEqual([
      { type: 'context', text: 'context', leftNo: 1, rightNo: 1 },
      { type: 'context', text: 'old one\x1fnew one', leftNo: 2, rightNo: 2 },
      { type: 'del', text: 'old two\x1f', leftNo: 3, rightNo: null },
      { type: 'context', text: 'unchanged', leftNo: 4, rightNo: 3 },
      { type: 'add', text: 'added later', leftNo: null, rightNo: 4 },
    ]);
  });

  it('reconstructs patches from parsed rows when raw hunk lines are unavailable', () => {
    const hunk: ParsedHunk = {
      id: 'hunk-custom',
      header: '@@ -1,2 +1,2 @@',
      rawLines: [],
      rows: [
        { type: 'context', text: 'same', leftNo: 1, rightNo: 1 },
        { type: 'del', text: 'old', leftNo: 2, rightNo: null },
        { type: 'add', text: 'new', leftNo: null, rightNo: 2 },
      ],
    };

    expect(buildHunkPatch(['diff --git a/a b/a', ''], hunk)).toBe(['diff --git a/a b/a', '@@ -1,2 +1,2 @@', ' same', '-old', '+new', ''].join('\n'));
  });

  it('ignores malformed hunk headers without corrupting the following hunk', () => {
    const parsed = parseDiff(['diff --git a/a b/a', '@@ malformed @@', '@@ -1 +1 @@', '-before', '+after'].join('\n'));

    expect(parsed.fileHeader).toEqual(['diff --git a/a b/a']);
    expect(parsed.hunks).toHaveLength(1);
    expect(parsed.hunks[0]?.rows).toEqual([
      { type: 'del', text: 'before', leftNo: 1, rightNo: null },
      { type: 'add', text: 'after', leftNo: null, rightNo: 1 },
    ]);
  });
});
