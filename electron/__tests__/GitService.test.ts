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


describe('GitService forensic history commands', () => {
  it('builds -S search command with path separator', async () => {
    const service = new GitService();
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValue('ok');

    await service.getForensicHistoryByString('needle', 'src/main.ts', 120);

    expect(runCommandSpy).toHaveBeenCalledWith(expect.arrayContaining([
      'log',
      '-S',
      'needle',
      '--',
      'src/main.ts',
      '-120',
    ]));
  });

  it('builds -G regex search command with path separator', async () => {
    const service = new GitService();
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValue('ok');

    await service.getForensicHistoryByRegex('foo.*bar', 'src/App.tsx', 80);

    expect(runCommandSpy).toHaveBeenCalledWith(expect.arrayContaining([
      'log',
      '-G',
      'foo.*bar',
      '--',
      'src/App.tsx',
      '-80',
    ]));
  });

  it('builds -L line range search command', async () => {
    const service = new GitService();
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValue('ok');

    await service.getForensicHistoryByLineRange('src/App.tsx', 10, 30, 60);

    expect(runCommandSpy).toHaveBeenCalledWith(expect.arrayContaining([
      'log',
      '-60',
      '-L10,30:src/App.tsx',
    ]));
  });
});
