import { describe, expect, it } from 'vitest';
import { commitEditErrorText } from './commitMessageEditText';

const tr = (_de: string, en: string) => en;
describe('commit edit failure reasons', () => {
  it.each([
    "fatal: cannot lock ref 'refs/heads/abort-release': expected a different object",
    "fatal: unable to write 'abort-controller.ts': Permission denied",
    'Remote verification was cancelled by the server.',
    'Git operation was aborted.',
  ])('keeps the failure reason without a confirmed cancellation: %s', (message) => {
    expect(commitEditErrorText(message, tr)).toBe(message);
  });
  it('explains only an explicitly confirmed cancellation', () => {
    expect(commitEditErrorText('Git operation was aborted.', tr, true)).toContain('Your draft has been kept');
  });
});
