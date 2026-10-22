import { describe, expect, it } from 'vitest';
import { resourceKey } from '../clientCache';
import { gitMutationAffects, isImmutableGitRead } from '../mutationEffects';

describe('file history cache scope', () => {
  const hash = 'a'.repeat(40);
  it('keeps complete histories mutable even when their inspected revision is immutable', () => {
    const args = ['old/file.ts', hash, 81, 'C:/repo', { includeFuture: true }];
    expect(isImmutableGitRead('getFileHistory', args)).toBe(false);
    for (const mutation of ['createCommit', 'gitFetch', 'checkout']) {
      expect(gitMutationAffects(mutation, [], resourceKey('git', 'getFileHistory', args))).toBe(true);
    }
  });
  it('retains immutable caching for later pages pinned to a captured newest commit', () => {
    expect(isImmutableGitRead('getFileHistory', ['file.ts', hash, 81, 'C:/repo', { offset: 80 }])).toBe(true);
  });
});
