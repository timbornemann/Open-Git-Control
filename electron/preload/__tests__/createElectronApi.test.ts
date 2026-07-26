import { describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../src/types/ipcContract';
import { createElectronApi } from '../createElectronApi';

describe('createElectronApi', () => {
  it('resolves a repository path without changing the tracked selection', async () => {
    const invoke = vi.fn((channel: IpcChannel) => {
      if (channel === IpcChannel.GitSetRepo) return Promise.resolve('C:/repo-a');
      if (channel === IpcChannel.GitResolveRepoPath) return Promise.resolve('C:/repo-b');
      return Promise.resolve({ success: false, error: '[REPO_UNAVAILABLE] Repository was deleted.' });
    });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);
    const listener = vi.fn();
    api.git.onRepoUnavailable(listener);

    await api.repos.setRepoPath('C:/repo-a');
    await expect(api.repos.resolveRepoPath('C:/repo-b/packages/app')).resolves.toBe('C:/repo-b');
    await api.git.runGitCommand('status');

    expect(invoke).toHaveBeenCalledWith(IpcChannel.GitResolveRepoPath, 'C:/repo-b/packages/app');
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ repoPath: 'C:/repo-a' }));
  });

  it('returns the canonical path from GitSetRepo and keeps the newest concurrent selection', async () => {
    let resolveFirst!: (value: string) => void;
    const firstSelection = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const invoke = vi.fn((channel: IpcChannel, value?: string) => {
      if (channel === IpcChannel.GitSetRepo && value === 'C:/repo-a/nested') return firstSelection;
      if (channel === IpcChannel.GitSetRepo) return Promise.resolve('C:/repo-b');
      return Promise.resolve({ success: false, error: '[REPO_UNAVAILABLE] Repository was deleted.' });
    });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);
    const listener = vi.fn();
    api.git.onRepoUnavailable(listener);

    const staleSelection = api.repos.setRepoPath('C:/repo-a/nested');
    await expect(api.repos.setRepoPath('C:/repo-b/nested')).resolves.toBe('C:/repo-b');
    resolveFirst('C:/repo-a');
    await expect(staleSelection).resolves.toBe('C:/repo-a');
    await api.git.runGitCommand('status');

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        repoPath: 'C:/repo-b',
        command: 'status',
      }),
    );
  });

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

    await api.repos.setRepoPath('C:/repo-a');
    await api.git.runGitCommand('status');
    await api.git.stagePaths(['README.md']);

    expect(invoke).toHaveBeenNthCalledWith(2, IpcChannel.GitCommand, 'status');
    expect(listener).toHaveBeenNthCalledWith(1, {
      repoPath: 'C:/repo-a',
      command: 'status',
      error: '[REPO_UNAVAILABLE] Repository was deleted.',
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      repoPath: 'C:/repo-a',
      command: 'add',
      error: '[REPO_UNAVAILABLE] Repository was deleted.',
    });

    unsubscribe();
    await api.git.runGitCommand('status');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('subscribes and unsubscribes planner change notifications', () => {
    const handlers = new Map<string, (...args: any[]) => void>();
    const ipcRenderer = {
      invoke: vi.fn(),
      on: vi.fn((channel: string, handler: (...args: any[]) => void) => handlers.set(channel, handler)),
      removeListener: vi.fn(),
    } as any;
    const api = createElectronApi(ipcRenderer);
    const listener = vi.fn();

    const unsubscribe = api.planner.onPlannerDataChanged(listener);
    handlers.get(IpcChannel.PlannerDataChanged)?.({});

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(IpcChannel.PlannerDataChanged, expect.any(Function));
  });

  it('forwards repository run configuration watch changes', async () => {
    const handlers = new Map<string, (...args: any[]) => void>();
    const ipcRenderer = {
      invoke: vi.fn().mockResolvedValue({ success: true, data: true }),
      on: vi.fn((channel: string, handler: (...args: any[]) => void) => handlers.set(channel, handler)),
      removeListener: vi.fn(),
    } as any;
    const api = createElectronApi(ipcRenderer);
    const listener = vi.fn();

    await api.runs.watchRepositoryRunConfig('C:/repo');
    const unsubscribe = api.runs.onRepositoryRunConfigChanged(listener);
    handlers.get(IpcChannel.RepositoryRunConfigChanged)?.({}, 'C:/repo');

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannel.RepositoryRunWatchConfig, 'C:/repo');
    expect(listener).toHaveBeenCalledWith('C:/repo');
    unsubscribe();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(IpcChannel.RepositoryRunConfigChanged, expect.any(Function));
  });

  it('requests sequencer state for the explicitly captured repository', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true, data: { operation: 'rebase' } });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);

    await expect(api.git.getSequencerState('C:/repo-a')).resolves.toEqual({ success: true, data: { operation: 'rebase' } });
    expect(invoke).toHaveBeenCalledWith(IpcChannel.GitSequencerState, 'C:/repo-a');
  });

  it('attributes explicit staging failures to the requested repository', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: false, error: '[REPO_UNAVAILABLE] Repository was deleted.' });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);
    const listener = vi.fn();
    api.git.onRepoUnavailable(listener);

    await api.git.stagePaths(['README.md'], 'C:/captured-repo');

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        repoPath: 'C:/captured-repo',
        command: 'add',
      }),
    );
  });

  it('pins repository path opening to the repository captured by the caller', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);

    await api.git.openRepositoryPath({ path: 'src/app.ts', action: 'reveal', repoPath: 'C:/captured-repo' });

    expect(invoke).toHaveBeenCalledWith(IpcChannel.GitOpenRepositoryPath, {
      path: 'src/app.ts',
      action: 'reveal',
      repoPath: 'C:/captured-repo',
    });
  });

  it('forwards repository initialization scaffolding options', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);
    const options = { createReadme: true, license: 'MIT' as const, copyrightHolder: 'Example Organization' };

    await api.git.gitInit('C:/new-repository', options);

    expect(invoke).toHaveBeenCalledWith(IpcChannel.GitInit, 'C:/new-repository', options);
  });

  it('pins repository-file deletion to the repository captured by the caller', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);

    await api.git.deleteRepoFile('NOTICE', 'C:/captured-repo');

    expect(invoke).toHaveBeenCalledWith(IpcChannel.GitDeleteRepoFile, 'NOTICE', 'C:/captured-repo');
  });

  it('pins working-directory file information to the repository captured by the caller', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);

    await api.git.getWorkingDirectoryFileInfo('src/app.ts', 'C:/captured-repo');

    expect(invoke).toHaveBeenCalledWith(IpcChannel.GitGetWorkingDirectoryFileInfo, 'src/app.ts', 'C:/captured-repo');
  });

  it('pins secret-scan and approval IPC calls to the captured repository', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true, data: { findings: [] } });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);

    await api.git.scanCommitSecrets({ repoPath: 'C:/captured-repo' });
    await api.git.approveSecretScanCommit('C:/captured-repo');
    await api.git.scanPushSecrets({ repoPath: 'C:/captured-repo', includeTags: true, pushArgs: ['origin', 'main'] });
    await api.git.approveSecretScanPush(['origin', 'main'], 'C:/captured-repo');

    expect(invoke).toHaveBeenNthCalledWith(1, IpcChannel.GitScanCommitSecrets, {
      repoPath: 'C:/captured-repo',
    });
    expect(invoke).toHaveBeenNthCalledWith(2, IpcChannel.GitApproveSecretScanCommit, 'C:/captured-repo');
    expect(invoke).toHaveBeenNthCalledWith(3, IpcChannel.GitScanPushSecrets, {
      repoPath: 'C:/captured-repo',
      includeTags: true,
      pushArgs: ['origin', 'main'],
    });
    expect(invoke).toHaveBeenNthCalledWith(4, IpcChannel.GitApproveSecretScanPush, ['origin', 'main'], 'C:/captured-repo');
  });
});
