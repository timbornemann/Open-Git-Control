import { describe, expect, it, vi } from 'vitest';
import { GitService } from '../GitService';

describe('GitService.getLog pagination', () => {
  it('adds --skip for incremental loading and supports head scope', async () => {
    const service = new GitService();
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValue('ok');

    await service.getLog(120, false, 40);

    expect(runCommandSpy).toHaveBeenCalledTimes(1);
    expect(runCommandSpy).toHaveBeenCalledWith(expect.arrayContaining([
      'log',
      '--topo-order',
      '-120',
      '--skip=40',
      '--numstat',
    ]));
    const args = runCommandSpy.mock.calls[0][0];
    expect(args).not.toContain('--all');
  });

  it('clamps invalid offset to 0', async () => {
    const service = new GitService();
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValue('ok');

    await service.getLog(50, true, -100);

    const args = runCommandSpy.mock.calls[0][0];
    expect(args).toContain('--skip=0');
    expect(args).toContain('--all');
  });
});
