import { describe, expect, it } from 'vitest';
import { parseConflictingTagNames, parseTagReferenceStatus, remoteTagTrackingRefPrefix } from '@/utils/tagConflicts';

const local = (name: string, object: string, peeled = '') => `refs/tags/${name}\0${object}\0${peeled}`;
const remote = (name: string, object: string, peeled = '') => `${remoteTagTrackingRefPrefix('origin')}${name}\0${object}\0${peeled}`;

describe('parseConflictingTagNames', () => {
  it('marks only local tags that point to a different remote commit', () => {
    const same = 'a'.repeat(40);
    const localOnly = 'b'.repeat(40);
    const remoteOnly = 'c'.repeat(40);
    const output = [local('v1.0.0', same), remote('v1.0.0', same), local('v2.0.0', localOnly), remote('v2.0.0', remoteOnly)].join('\n');

    expect(parseConflictingTagNames(output, 'origin')).toEqual(['v2.0.0']);
  });

  it('compares peeled commits for annotated tags', () => {
    const localTagObject = 'a'.repeat(40);
    const remoteTagObject = 'b'.repeat(40);
    const sharedCommit = 'c'.repeat(40);
    const output = [local('v1.0.0', localTagObject, sharedCommit), remote('v1.0.0', remoteTagObject, sharedCommit)].join('\n');

    expect(parseConflictingTagNames(output, 'origin')).toEqual([]);
  });

  it('identifies remote tags that can be adopted without overwriting a local tag', () => {
    const output = [local('v1.0.0', 'a'.repeat(40)), remote('v1.0.0', 'a'.repeat(40)), remote('v2.0.0', 'b'.repeat(40))].join('\n');

    expect(parseTagReferenceStatus(output, 'origin')).toEqual({
      conflictingTagNames: [],
      remoteOnlyTagNames: ['v2.0.0'],
    });
  });
});
