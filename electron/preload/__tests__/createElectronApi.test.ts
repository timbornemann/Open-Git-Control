import { describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../src/types/ipcContract';
import { createElectronApi } from '../createElectronApi';

describe('createElectronApi', () => {
  it('notifies preload repo-unavailable listeners from Git IPC results', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: false, error: '[REPO_UNAVAILABLE] Repository was deleted.' });
    const ipcRenderer = {
      invoke,
      on: vi.fn(),
      removeListener: vi.fn(),
    } as any;
    const api = createElectronApi(ipcRenderer);
    const listener = vi.fn();
    const unsubscribe = api.git.onRepoUnavailable(listener);

    await api.git.runGitCommand('status');
    await api.git.stagePaths(['README.md']);

    expect(invoke).toHaveBeenNthCalledWith(1, IpcChannel.GitCommand, 'status');
    expect(listener).toHaveBeenNthCalledWith(1, {
      command: 'status',
      error: '[REPO_UNAVAILABLE] Repository was deleted.',
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      command: 'add',
      error: '[REPO_UNAVAILABLE] Repository was deleted.',
    });

    unsubscribe();
    await api.git.runGitCommand('status');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
