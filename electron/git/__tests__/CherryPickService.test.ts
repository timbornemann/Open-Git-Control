import { describe, expect, it, vi } from 'vitest';
import { CherryPickService } from '../CherryPickService';

describe('CherryPickService', () => {
  it('continues cherry-pick with a non-interactive editor', async () => {
    const run = vi.fn().mockResolvedValue('ok');
    const service = new CherryPickService(() => '/repo', { run });

    await expect(service.continueCherryPick()).resolves.toBe('ok');
    expect(run).toHaveBeenCalledWith('/repo', ['cherry-pick', '--continue'], {
      envOverrides: { GIT_EDITOR: 'true' },
    });
  });

  it('aborts cherry-pick', async () => {
    const run = vi.fn().mockResolvedValue('aborted');
    const service = new CherryPickService(() => '/repo', { run });

    await expect(service.abortCherryPick()).resolves.toBe('aborted');
    expect(run).toHaveBeenCalledWith('/repo', ['cherry-pick', '--abort']);
  });
});
