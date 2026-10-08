import { describe, expect, it, vi } from 'vitest';
import { ToolExecutableResolver } from '../ToolExecutableResolver';
import { ToolInstallPlans } from '../ToolInstallPlans';
import { SystemToolsService } from '../SystemToolsService';
import type { InstallerRunner } from '../ToolInstaller';
import type { SystemToolInstallEvent } from '../../../src/shared/ipc/systemTools';

function fixture() {
  const installed = new Set<string>();
  const resolver = new ToolExecutableResolver({
    platform: 'win32',
    env: { PATH: 'C:\\tools' },
    exists: (file) => file.includes('winget') || installed.has(file.split('\\').pop()!),
    run: vi.fn(async (file: string) => {
      if (file.endsWith('reg.exe')) throw new Error('key absent');
      return { stdout: file.endsWith('git.exe') ? 'git version 2.52.0' : file.endsWith('git-lfs.exe') ? 'git-lfs/3.7.0' : 'gh version 2.83.0', stderr: '' };
    }),
  });
  const plans = new ToolInstallPlans(resolver);
  const run = vi.fn<InstallerRunner>(async () => {
    installed.add('git.exe');
    installed.add('git-lfs.exe');
    return { exitCode: 0, output: '' };
  });
  const service = new SystemToolsService(resolver, plans, run);
  return { service, resolver, plans, run, installed };
}
describe('system tool lifecycle and installer isolation', () => {
  it('starts in checking state, merges parallel checks, and never starts an installer while probing', async () => {
    const f = fixture();
    expect(f.service.snapshot()).toMatchObject({ checkedAt: null, tools: expect.arrayContaining([expect.objectContaining({ id: 'git', state: 'checking' })]) });
    const first = f.service.recheck();
    expect(f.service.recheck()).toBe(first);
    const status = await first;
    expect(status.tools.every((tool) => tool.state === 'missing')).toBe(true);
    expect(f.run).not.toHaveBeenCalled();
    f.installed.add('git.exe');
    expect((await f.service.recheck()).tools[0]).toMatchObject({ state: 'available' });
  });
  it('serializes installers and verifies Git and bundled LFS before reporting success', async () => {
    const f = fixture();
    const events: SystemToolInstallEvent[] = [];
    const stop = f.service.onInstall((event) => events.push(event));
    let resolve!: (result: { exitCode: number; output: string }) => void;
    f.run.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const install = f.service.install({ toolId: 'git' });
    await vi.waitFor(() => expect(f.run).toHaveBeenCalledTimes(1));
    await expect(f.service.install({ toolId: 'git-lfs' })).rejects.toThrow('already running');
    f.installed.add('git.exe');
    f.installed.add('git-lfs.exe');
    resolve({ exitCode: 0, output: 'installed' });
    expect(await install).toMatchObject({ phase: 'done' });
    expect(events.map((event) => event.phase)).toEqual(['preparing', 'installing', 'verifying', 'done']);
    expect(new Set(events.map((event) => event.operationId)).size).toBe(1);
    expect(f.service.snapshot().tools.find((tool) => tool.id === 'git-lfs')?.state).toBe('available');
    stop();
  });
  it('does not claim success when an installer exits successfully but the tool is unusable', async () => {
    const f = fixture();
    f.run.mockResolvedValue({ exitCode: 0, output: '' });
    expect(await f.service.install({ toolId: 'git' })).toMatchObject({ phase: 'failed', detail: expect.stringContaining('not usable') });
  });
  it('shows package agreements before allowing explicit consent for the same fixed command', async () => {
    const f = fixture();
    expect(await f.service.install({ toolId: 'git', acceptAgreements: true })).toMatchObject({ phase: 'failed', detail: expect.stringContaining('Review') });
    expect(f.run).not.toHaveBeenCalled();
    f.run.mockResolvedValueOnce({ exitCode: 0x8a150041, output: 'Package terms: example license' });
    expect(await f.service.install({ toolId: 'git' })).toMatchObject({ phase: 'agreements-required', agreements: 'Package terms: example license' });
    expect(f.run.mock.calls[0][1]).not.toContain('--accept-package-agreements');
    expect(await f.service.install({ toolId: 'git', acceptAgreements: true })).toMatchObject({ phase: 'done' });
    expect(f.run.mock.calls[1][1]).toEqual(expect.arrayContaining(['--accept-source-agreements', '--accept-package-agreements']));
  });
  it('does not offer blind agreement acceptance when package terms cannot be displayed', async () => {
    const f = fixture();
    f.run.mockResolvedValueOnce({ exitCode: 0x8a150046, output: '' });
    expect(await f.service.install({ toolId: 'git' })).toMatchObject({ phase: 'failed', detail: expect.stringContaining('could not be read') });
    expect(await f.service.install({ toolId: 'git', acceptAgreements: true })).toMatchObject({ phase: 'failed', detail: expect.stringContaining('Review') });
    expect(f.run).toHaveBeenCalledOnce();
  });
  it('reports denied rights/network failures, rejects unknown tools, and permits a later retry', async () => {
    const f = fixture();
    f.run.mockResolvedValueOnce({ exitCode: 1, output: 'Network unavailable' });
    expect(await f.service.install({ toolId: 'git' })).toMatchObject({ phase: 'failed', detail: 'Network unavailable' });
    f.run.mockResolvedValueOnce({ exitCode: 0x8a150005, output: 'Cancelled' });
    expect(await f.service.install({ toolId: 'git' })).toMatchObject({ phase: 'cancelled' });
    await expect(f.service.install({ toolId: 'arbitrary' } as never)).rejects.toThrow('Invalid');
    expect(await f.service.install({ toolId: 'git' })).toMatchObject({ phase: 'done' });
  });
});
