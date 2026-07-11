import { describe, expect, it } from 'vitest';
import { getRefKind, sortRefs } from '../commitGraphRefs';
import { countUniqueWorkingTreeChanges, summarizeWorkingTreeChanges } from '../commitGraphWorkingTree';

describe('commit graph ref classification', () => {
  it('keeps slash-containing local branches local when branch metadata is available', () => {
    const locals = new Set(['main', 'feature/nested']);
    expect(getRefKind('feature/nested', locals)).toBe('local');
    expect(getRefKind('origin/feature/nested', locals)).toBe('remote');
    expect(sortRefs(['origin/feature/nested', 'feature/nested'], locals)).toEqual(['feature/nested', 'origin/feature/nested']);
  });
});

describe('working-tree graph count', () => {
  it('counts a conflicted path only once when porcelain places it in both buckets', () => {
    const status = {
      staged: [
        { path: 'conflicted.ts', x: 'U', y: 'U' },
        { path: 'staged.ts', x: 'M', y: ' ' },
      ],
      unstaged: [
        { path: 'conflicted.ts', x: 'U', y: 'U' },
        { path: 'modified.ts', x: ' ', y: 'M' },
      ],
      untracked: [{ path: 'new.ts', x: '?', y: '?' }],
    };
    expect(countUniqueWorkingTreeChanges(status)).toBe(4);
    expect(summarizeWorkingTreeChanges(status)).toEqual({ total: 4, conflicts: 1, staged: 1, unstaged: 1, untracked: 1 });
  });
});
