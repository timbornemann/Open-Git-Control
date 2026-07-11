import { describe, expect, it } from 'vitest';
import {
  buildConflictResolution,
  convertLineEndings,
  countConflictMarkerLines,
  hasConflictMarkerLines,
  parseConflictBlocks,
  parseConflictEntries,
  replaceConflictBlock,
} from '@/components/staging-area/utils';

describe('staging-area utils', () => {
  it('decodes quoted porcelain conflict paths', () => {
    const output = ['UU "src/conflict file.ts"', 'AA "src/\\303\\244 space.txt"'].join('\n');

    expect(parseConflictEntries(output)).toEqual([
      { path: 'src/conflict file.ts', x: 'U', y: 'U', code: 'UU' },
      { path: 'src/ä space.txt', x: 'A', y: 'A', code: 'AA' },
    ]);
  });
});

describe('conflict marker parsing and resolution', () => {
  it('separates diff3 base content from ours and never includes it in a resolution', () => {
    const content = ['before', '<<<<<<< HEAD', 'ours', '||||||| parent', 'base', '=======', 'theirs', '>>>>>>> topic', 'after', ''].join('\r\n');
    const blocks = parseConflictBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ ours: 'ours\r\n', base: 'base\r\n', theirs: 'theirs\r\n', baseLabel: 'parent' });
    expect(buildConflictResolution(blocks[0], 'ours', '\r\n')).toBe('ours\r\n');
    expect(buildConflictResolution(blocks[0], 'theirs', '\r\n')).toBe('theirs\r\n');
    expect(buildConflictResolution(blocks[0], 'both', '\r\n')).toBe('ours\r\ntheirs\r\n');
    expect(replaceConflictBlock(content, blocks[0], buildConflictResolution(blocks[0], 'ours', '\r\n'))).toBe('before\r\nours\r\nafter\r\n');
  });

  it('reports raw malformed markers even when no structured block can be parsed', () => {
    const malformed = '<<<<<<< HEAD\nleft only\n||||||| parent\nbase\n';
    expect(parseConflictBlocks(malformed)).toEqual([]);
    expect(hasConflictMarkerLines(malformed)).toBe(true);
    expect(countConflictMarkerLines(malformed)).toEqual({ starts: 1, bases: 1, separators: 0, ends: 0 });
  });

  it('restores the original newline convention without trimming EOF whitespace', () => {
    expect(convertLineEndings('resolved\n\n\n', '\r\n')).toBe('resolved\r\n\r\n\r\n');
    expect(convertLineEndings('resolved\n\n', '\r')).toBe('resolved\r\r');
  });
});
