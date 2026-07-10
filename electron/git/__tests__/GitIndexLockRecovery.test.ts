import { describe, expect, it } from 'vitest';
import { GitIndexLockRecovery } from '../GitIndexLockRecovery';

describe('GitIndexLockRecovery', () => {
  it('never deletes a lock based on age without verifiable ownership', () => {
    const recovery = new GitIndexLockRecovery();
    expect(recovery.removeStaleIndexLockIfSafe('/tmp/repo', ['commit'])).toBe(false);
  });
});
