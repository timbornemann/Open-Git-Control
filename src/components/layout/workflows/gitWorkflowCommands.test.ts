import { describe, expect, it } from 'vitest';
import { gitWorkflowCommands } from './gitWorkflowCommands';

describe('gitWorkflowCommands', () => {
  it('builds the explicit fetch refspec used to adopt a deleted conflicting local tag', () => {
    expect(gitWorkflowCommands.adoptRemoteTag('upstream', 'v2.0.3')).toEqual([
      'fetch',
      'upstream',
      '--no-tags',
      '--quiet',
      '+refs/tags/v2.0.3:refs/tags/v2.0.3',
    ]);
  });
});
