import { describe, expect, it } from 'vitest';
import { extractGitObjectId, isFullGitObjectId } from '@/utils/gitObjectId';

describe('gitObjectId', () => {
  it('accepts abbreviated SHA-1 and SHA-256 object ids without truncating them', () => {
    const sha256 = 'a'.repeat(64);

    expect(extractGitObjectId('abcdef1')).toBe('abcdef1');
    expect(extractGitObjectId('commit ' + sha256)).toBe(sha256);
    expect(extractGitObjectId('abcdef')).toBeNull();
    expect(extractGitObjectId('a'.repeat(65))).toBeNull();
  });

  it('accepts full SHA-1 and SHA-256 ids and rejects abbreviated or overlong ids', () => {
    expect(isFullGitObjectId('a'.repeat(40))).toBe(true);
    expect(isFullGitObjectId('B'.repeat(64))).toBe(true);
    expect(isFullGitObjectId('a'.repeat(39))).toBe(false);
    expect(isFullGitObjectId('a'.repeat(41))).toBe(false);
    expect(isFullGitObjectId('a'.repeat(63))).toBe(false);
    expect(isFullGitObjectId('a'.repeat(65))).toBe(false);
  });
});
