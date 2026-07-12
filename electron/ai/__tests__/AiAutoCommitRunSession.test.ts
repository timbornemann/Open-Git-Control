import { describe, expect, it, vi } from 'vitest';
import { AiAutoCommitRunSession } from '../AiAutoCommitRunSession';

describe('AiAutoCommitRunSession commit recovery', () => {
  it('routes a failed commit batch through the retry and fallback state machine', async () => {
    const session = new AiAutoCommitRunSession({} as any, {} as any, '/repo', {} as any, () => 'key');
    const internals = session as any;
    vi.spyOn(internals, 'commitBatch').mockRejectedValue(new Error('hook rejected the commit'));
    const groupState = internals.groupRecovery.createState();
    const batch = [{ path: 'src/example.ts' }];

    const committed = await internals.tryCommitBatch(batch, batch, groupState, 0, batch);

    expect(committed).toBe(false);
    expect(groupState).toMatchObject({ groupRetries: 1, stallCycles: 1 });
    expect(internals.state.mode).toBe('retry');
    expect(internals.state.diagnostics).toEqual([expect.stringContaining('hook rejected the commit')]);
  });
});
