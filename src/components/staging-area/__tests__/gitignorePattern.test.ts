import { describe, expect, it } from 'vitest';
import { escapeGitignoreLiteralPath } from '../gitignorePattern';
import { extensionPattern } from '../utils';

describe('escapeGitignoreLiteralPath', () => {
  it('escapes every gitignore metacharacter in exact file and directory names', () => {
    expect(escapeGitignoreLiteralPath('#build/!literal*[draft]?.txt')).toBe('\\#build/\\!literal\\*\\[draft\\]\\?.txt');
    expect(escapeGitignoreLiteralPath(' leading /trailing ')).toBe('\\ leading\\ /trailing\\ ');
  });

  it('keeps directory separators and escapes a literal backslash in a filename', () => {
    expect(escapeGitignoreLiteralPath('dist/exact.txt')).toBe('dist/exact.txt');
    expect(escapeGitignoreLiteralPath('literal\\name.txt')).toBe('literal\\\\name.txt');
  });

  it('escapes metacharacters in extension patterns while retaining the leading wildcard', () => {
    expect(extensionPattern('archive.release*[draft]?.zip')).toBe('*.zip');
    expect(extensionPattern('archive.release*[draft]?')).toBe('*.release\\*\\[draft\\]\\?');
  });
});
