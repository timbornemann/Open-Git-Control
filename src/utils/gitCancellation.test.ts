import { describe, expect, it } from 'vitest';
import { isGitCancellation } from './gitCancellation';
import { isGitOperationAborted } from '../components/commit-graph/commitGraphRequestUtils';

describe('explicit Git cancellation diagnostics', () => {
  it.each([
    'Git operation was aborted.',
    'Git read was aborted.',
    'Git file read was aborted.',
    'Git command was aborted.',
    'Git diff preview was aborted.',
    'Git stream was aborted.',
    'Git clone was aborted.',
    'The read was cancelled.',
    'This operation was aborted',
    'AbortError: This operation was aborted',
    'Error: Git operation was aborted.',
    'Transfer was cancelled before this endpoint started.',
    Object.assign(new Error('The request ended'), { name: 'AbortError' }),
  ])('recognizes %s as a real cancellation', (value) => {
    expect(isGitCancellation(value)).toBe(true);
    expect(isGitOperationAborted(value)).toBe(true);
  });
  it.each([
    "fatal: cannot lock ref 'refs/heads/abort-release': bad object",
    "fatal: could not read 'operation was aborted.txt': bad object",
    "fatal: cannot read 'src/AbortError.ts': bad object",
    'Remote verification was cancelled by the server.',
    'AI request exceeded its time limit.',
  ])('does not hide an actual error or enter a retry loop: %s', (message) => {
    expect(isGitCancellation(message)).toBe(false);
    expect(isGitOperationAborted(new Error(message))).toBe(false);
  });
});
