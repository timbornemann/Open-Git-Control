import { describe, expect, it } from 'vitest';
import { countPorcelainChanges, parsePorcelainStatusZ } from '../porcelainStatus';

describe('repository change counts', () => {
  it('counts paths once across index, worktree, conflicts and untracked files', () => {
    const raw = 'MM both.ts\0A  added.ts\0 D deleted.ts\0?? folder/one.ts\0?? folder/two.ts\0UU conflict.ts\0 M submodule\0';
    expect(countPorcelainChanges(raw)).toBe(7);
    expect(countPorcelainChanges(`${raw} M both.ts\0!! ignored.ts\0`)).toBe(7);
    expect(countPorcelainChanges('')).toBe(0);
  });
  it('consumes rename/copy sources without counting them as additional files', () => {
    const raw = 'RM new -> name.txt\0old.txt\0C  copied.txt\0source.txt\0';
    expect(countPorcelainChanges(raw)).toBe(2);
    expect(parsePorcelainStatusZ(raw)[0]).toEqual({ code: 'RM', path: 'new -> name.txt', originalPath: 'old.txt' });
  });
  it('preserves unicode, whitespace, quotes and newlines inside file names', () => {
    const names = ['ä日本.txt', ' leading space', 'line\nbreak.txt', 'tab\tfile', '"quote"'];
    const raw = names.map((name) => `?? ${name}\0`).join('');
    expect(parsePorcelainStatusZ(raw).map((record) => record.path)).toEqual(names);
    expect(countPorcelainChanges(raw)).toBe(names.length);
  });
});
