import { describe, expect, it } from 'vitest';
import { normalizeRepoPathKey } from '../repoPath';

describe('normalizeRepoPathKey', () => {
  it('matches Windows paths returned with different separators and casing', () => {
    expect(normalizeRepoPathKey('C:\\Users\\Tim\\Repo\\')).toBe(
      normalizeRepoPathKey('c:/Users/Tim/Repo'),
    );
  });
});
