import { describe, expect, it } from 'vitest';
import { isAiAutoCommitDisabled } from './StagingCommitPanel';

describe('isAiAutoCommitDisabled', () => {
  const idleState = {
    aiConfigEnabled: true,
    isMutating: false,
    isCommitting: false,
    isAiCommitting: false,
    isAiJobRunning: false,
    hasStatus: true,
  };

  it('disables AI auto-commit when the feature is not configured', () => {
    expect(isAiAutoCommitDisabled({ ...idleState, aiConfigEnabled: false })).toBe(true);
    expect(isAiAutoCommitDisabled(idleState)).toBe(false);
  });
});
