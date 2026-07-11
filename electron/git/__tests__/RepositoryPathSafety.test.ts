import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { normalizeRepositoryRelativePath, resolveExistingRepositoryPath, resolveRepositoryPathForCreate } from '../RepositoryPathSafety';

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

  it('blocks repository metadata and hooks from renderer file access', () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-path-safety-'));
    fs.mkdirSync(path.join(repoPath, '.git', 'hooks'), { recursive: true });
    fs.mkdirSync(path.join(repoPath, 'vendor', 'nested', '.git', 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(repoPath, '.git', 'config'), '[core]\n', 'utf8');
    fs.writeFileSync(path.join(repoPath, 'vendor', 'nested', '.git', 'config'), '[core]\n', 'utf8');
    try {
      expect(() => resolveExistingRepositoryPath(repoPath, '.git/config')).toThrow(/Git metadata/);
      expect(() => resolveRepositoryPathForCreate(repoPath, '.git/hooks/pre-commit')).toThrow(/Git metadata/);
      expect(() => resolveRepositoryPathForCreate(repoPath, '.GIT/config')).toThrow(/Git metadata/);
      expect(() => resolveRepositoryPathForCreate(repoPath, '.git./hooks/pre-commit')).toThrow(/Git metadata/);
      expect(() => resolveRepositoryPathForCreate(repoPath, '.git::$DATA/hooks/pre-commit')).toThrow(/Git metadata/);
      expect(() => resolveExistingRepositoryPath(repoPath, 'vendor/nested/.git/config')).toThrow(/Git metadata/);
      expect(() => resolveRepositoryPathForCreate(repoPath, 'vendor/nested/.git/hooks/pre-commit')).toThrow(/Git metadata/);
    } finally {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });
});
