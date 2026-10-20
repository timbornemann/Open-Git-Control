import { describe, expect, it } from 'vitest';
import { cleanupPatternMatches, normalizeCleanupPreferences } from '../BranchCleanupPreferences';

describe('branch cleanup protection preferences', () => {
  it('always retains built-in protection and deduplicates additional patterns', () => {
    expect(normalizeCleanupPreferences({ protectedPatterns: ['release/*', 'main', 'release/*'] }).protectedPatterns).toEqual([
      'main',
      'master',
      'develop',
      'development',
      'release/*',
    ]);
    expect(() => normalizeCleanupPreferences({ protectedPatterns: ['bad\npattern'] })).toThrow('Invalid');
    expect(() => normalizeCleanupPreferences({ protectedPatterns: [''] })).toThrow('Invalid');
  });
  it('uses literal names and star globs instead of interpreting regex characters', () => {
    expect(cleanupPatternMatches('release/v1/stable', 'release/*')).toBe(true);
    expect(cleanupPatternMatches('release/v1/stable', 'release/*/stable')).toBe(true);
    expect(cleanupPatternMatches('literal[abc].branch', 'literal[abc].branch')).toBe(true);
    expect(cleanupPatternMatches('literalaXbranch', 'literal[abc].branch')).toBe(false);
    expect(cleanupPatternMatches('feature/work', 'release/*')).toBe(false);
    expect(cleanupPatternMatches('MAIN', 'main')).toBe(false);
  });
  it('handles long wildcard patterns without exponential regex backtracking', () => {
    expect(cleanupPatternMatches('a'.repeat(1000), `${'*a'.repeat(200)}b`)).toBe(false);
  });
});
