import { describe, expect, it } from 'vitest';
import { gitWorkflowCommands } from './gitWorkflowCommands';

describe('gitWorkflowCommands', () => {
  it('uses the bounded adoption command for a tracked remote tag', () => {
    expect(gitWorkflowCommands.adoptTrackedRemoteTag('upstream', 'v2.0.3')).toEqual(['adoptRemoteTag', 'upstream', 'v2.0.3']);
  });
});
