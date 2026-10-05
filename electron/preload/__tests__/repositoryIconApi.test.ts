import { describe, expect, it, vi } from 'vitest';
import { createElectronApi } from '../createElectronApi';
import { IpcChannel } from '../../../src/types/ipcContract';
describe('repository icon preload API', () => {
  it('exposes icon operations in flat and repos APIs without changing active repository', async () => {
    const ipc = { invoke: vi.fn().mockResolvedValue({ success: true }), on: vi.fn(), removeListener: vi.fn() };
    const api = createElectronApi(ipc);
    const choice = { mode: 'initials' as const, expectedSelectionVersion: 'current' };
    for (const surface of [api, api.repos]) {
      await surface.getRepositoryIcon('/repo', true);
      await surface.readRepositoryIconSource('/repo', 'logo.svg');
      await surface.saveRepositoryIconChoice('/repo', choice);
      await surface.selectRepositoryIconFile('/repo');
    }
    expect(ipc.invoke).toHaveBeenCalledWith(IpcChannel.RepositoryIconChoice, '/repo', choice);
    expect(ipc.invoke).not.toHaveBeenCalledWith(IpcChannel.GitSetRepo, expect.anything());
    const callback = vi.fn(),
      stop = api.repos.onRepositoryIconChanged(callback);
    const handler = ipc.on.mock.calls[0][1];
    handler({}, { repoPath: '/repo' });
    expect(callback).toHaveBeenCalledWith({ repoPath: '/repo' });
    stop();
    expect(ipc.removeListener).toHaveBeenCalledWith(IpcChannel.RepositoryIconChanged, handler);
  });
});
