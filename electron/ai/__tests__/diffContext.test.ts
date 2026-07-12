import { describe, expect, it } from 'vitest';
import { parseNumstatReport } from '../diffContext';

describe('parseNumstatReport', () => {
  it('assigns renamed-file stats to the destination path used by the snapshot', () => {
    const report = [
      '4\t2\tsrc/{old-name => new-name}.ts',
      '4\t2\t"src/{old name => new name}.ts"',
      '1\t0\t{old-dir => new-dir}/nested/file.ts',
      '3\t1\told.txt => new.txt',
      '2\t1\t"literal -> name.txt"',
      '5\t4\t"literal => name.txt"',
    ].join('\n');

    const stats = parseNumstatReport(report);

    expect(stats.get('src/new-name.ts')).toEqual({ additions: 4, deletions: 2, isBinary: false });
    expect(stats.get('src/new name.ts')).toEqual({ additions: 4, deletions: 2, isBinary: false });
    expect(stats.get('new-dir/nested/file.ts')).toEqual({ additions: 1, deletions: 0, isBinary: false });
    expect(stats.get('new.txt')).toEqual({ additions: 3, deletions: 1, isBinary: false });
    expect(stats.get('literal -> name.txt')).toEqual({ additions: 2, deletions: 1, isBinary: false });
    expect(stats.get('literal => name.txt')).toEqual({ additions: 5, deletions: 4, isBinary: false });
    expect(stats.has('src/{old-name => new-name}.ts')).toBe(false);
  });
});
