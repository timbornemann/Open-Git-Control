import { describe, expect, it } from 'vitest';
import { buildHunkPatch, parseDiff } from '../DiffViewer';

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
});
