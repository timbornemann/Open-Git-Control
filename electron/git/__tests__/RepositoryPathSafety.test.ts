import { describe, expect, it } from 'vitest';
import { normalizeRepositoryRelativePath } from '../RepositoryPathSafety';

describe('normalizeRepositoryRelativePath', () => {
  it('preserves leading and trailing whitespace in a filename', () => {
    // ` target.txt` and `target.txt` are distinct files in Git; trimming would
    // silently redirect reads/writes to the wrong path.
    expect(normalizeRepositoryRelativePath(' target.txt')).toBe(' target.txt');
    expect(normalizeRepositoryRelativePath('target.txt ')).toBe('target.txt ');
    expect(normalizeRepositoryRelativePath('  spaced name.md  ')).toBe('  spaced name.md  ');
  });

  it('rejects an empty path but not a whitespace-only one', () => {
    expect(() => normalizeRepositoryRelativePath('')).toThrow(/required/);
    expect(() => normalizeRepositoryRelativePath(null)).toThrow(/required/);
    expect(normalizeRepositoryRelativePath(' ')).toBe(' ');
  });

  it('rejects parent-directory traversal and absolute paths', () => {
    expect(() => normalizeRepositoryRelativePath('../secret')).toThrow(/repository-relative/);
    expect(() => normalizeRepositoryRelativePath('a/../../b')).toThrow(/repository-relative/);
    expect(() => normalizeRepositoryRelativePath('/etc/passwd')).toThrow(/repository-relative/);
    expect(() => normalizeRepositoryRelativePath('C:\\Windows')).toThrow(/repository-relative/);
  });

  it('rejects control characters', () => {
    expect(() => normalizeRepositoryRelativePath('a\nb')).toThrow(/repository-relative/);
    expect(() => normalizeRepositoryRelativePath('a\0b')).toThrow(/repository-relative/);
  });

  it('treats backslash as a separator only on Windows', () => {
    const result = normalizeRepositoryRelativePath('dir\\file.txt');
    if (process.platform === 'win32') {
      expect(result).toBe('dir/file.txt');
    } else {
      // On POSIX a backslash is a legal filename character and must be kept.
      expect(result).toBe('dir\\file.txt');
    }
  });
});
