import { describe, expect, it } from 'vitest';
import { normalizeRepoPathKey } from '@/utils/repoPath';

describe('normalizeRepoPathKey', () => {
  it('matches Windows paths returned with different separators and casing', () => {
    expect(normalizeRepoPathKey('C:\\Users\\Tim\\Repo\\')).toBe(normalizeRepoPathKey('c:/Users/Tim/Repo'));
  });

  it('keeps distinct case-sensitive POSIX repositories separate', () => {
    expect(normalizeRepoPathKey('/tmp/Repo')).toBe('/tmp/Repo');
    expect(normalizeRepoPathKey('/tmp/repo')).toBe('/tmp/repo');
    expect(normalizeRepoPathKey('/tmp/Repo')).not.toBe(normalizeRepoPathKey('/tmp/repo'));
  });

  it('does not collapse filesystem roots into an empty cache key', () => {
    expect(normalizeRepoPathKey('/')).toBe('/');
    expect(normalizeRepoPathKey('C:\\')).toBe('c:/');
  });
});
