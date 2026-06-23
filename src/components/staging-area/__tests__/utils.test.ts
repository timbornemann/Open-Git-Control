import { describe, expect, it } from 'vitest';
import { parseConflictEntries } from '../utils';

describe('staging-area utils', () => {
  it('decodes quoted porcelain conflict paths', () => {
    const output = [
      'UU "src/conflict file.ts"',
      'AA "src/\\303\\244 space.txt"',
    ].join('\n');

    expect(parseConflictEntries(output)).toEqual([
      { path: 'src/conflict file.ts', x: 'U', y: 'U', code: 'UU' },
      { path: 'src/ä space.txt', x: 'A', y: 'A', code: 'AA' },
    ]);
  });
});
