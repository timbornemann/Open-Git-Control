import { describe, expect, it } from 'vitest';
import {
  addToLines,
  changeTextCase,
  decodeBase64,
  decodeUrlComponent,
  encodeBase64,
  encodeUrlComponent,
  getTextMetrics,
  removeDuplicateLines,
  removeEmptyLines,
  replaceTextSelection,
  sortLines,
  trimLines,
} from './textContentTransforms';

describe('text content transforms', () => {
  it('sorts, deduplicates, removes empty lines and preserves a final newline', () => {
    expect(sortLines('z\nA\na\n')).toBe('A\na\nz\n');
    expect(removeDuplicateLines('a\nb\na\n')).toBe('a\nb\n');
    expect(removeEmptyLines('a\n \n\nb\n')).toBe('a\nb\n');
  });

  it('trims and adds affixes per line', () => {
    expect(trimLines(' a \n b')).toBe('a\nb');
    expect(addToLines('a\nb\n', '[', ']')).toBe('[a]\n[b]\n');
  });

  it('changes case and replaces only a selection', () => {
    expect(changeTextCase('Äbc', 'upper')).toBe('ÄBC');
    expect(replaceTextSelection('before value after', { from: 7, to: 12 }, 'new')).toBe('before new after');
  });

  it('round-trips Unicode Base64 and URL encoding', () => {
    expect(decodeBase64(encodeBase64('Grüße 👋'))).toBe('Grüße 👋');
    expect(decodeUrlComponent(encodeUrlComponent('a/b? grüße'))).toBe('a/b? grüße');
    expect(() => decodeBase64('%%%')).toThrow('Invalid Base64');
    expect(() => decodeUrlComponent('%ZZ')).toThrow('Invalid URL');
  });

  it('calculates character, word and line counts', () => {
    expect(getTextMetrics('one two\nthree')).toEqual({ characters: 13, words: 3, lines: 2 });
    expect(getTextMetrics('')).toEqual({ characters: 0, words: 0, lines: 0 });
  });
});
