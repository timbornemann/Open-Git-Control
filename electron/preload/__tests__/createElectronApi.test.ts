import { describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../src/types/ipcContract';
import { createElectronApi } from '../createElectronApi';

describe('createElectronApi', () => {
  it('exposes checked Git identity reads and writes in both namespaces', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);
    const read = { repoPath: 'C:/repo', scope: 'repository' as const };
    const save = { ...read, name: 'Name', email: 'name@example.invalid', expectedRevision: 'revision' };
    await api.git.getGitIdentity(read);
    await api.saveGitIdentity(save);
    expect(invoke.mock.calls).toEqual([
      [IpcChannel.GitGetIdentity, read],
      [IpcChannel.GitSaveIdentity, save],
    ]);
  });
  it('exposes repository-bound LFS inspection and checked conversion through both API namespaces', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);
    const request = { repoPath: 'C:/repo', files: [{ path: 'design.psd', source: 'staged' as const }] };
    const write = { repoPath: request.repoPath, ...request.files[0], scope: 'file' as const, expectedVersion: 'snapshot' };
    await api.git.getGitLfsStatus(request);
    await api.trackWithGitLfs(write);
    expect(invoke.mock.calls).toEqual([
      [IpcChannel.GitGetLfsStatus, request],
      [IpcChannel.GitTrackWithLfs, write],
    ]);
  });
  it('uses explicit hosting accounts and exposes no retired GitHub namespace or flat methods', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true, data: { items: [], nextCursor: null } });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);
    expect(Object.keys(api).filter((name) => name.startsWith('github'))).toEqual([]);
    await api.hosting.hostingRequest('repositories', { connectionId: 'forgejo-account' });
    expect(invoke).toHaveBeenCalledWith(IpcChannel.HostingRequest, 'repositories', { connectionId: 'forgejo-account' });
  });
  it('exposes typed message editing and cancellation in both API namespaces', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);
    const request = {
      repoPath: 'C:/repo',
      commitHash: 'a'.repeat(40),
      expectedHead: 'b'.repeat(40),
      expectedBranch: 'refs/heads/main',
      title: 'Title',
      description: '',
      operationId: 'op',
    };
    await api.git.inspectCommitMessageEdit(request);
    await api.rewordCommitMessage(request);
    await api.git.getCommitMessageEditBackups(request.repoPath);
    await api.cancelCommitMessageEdit(request.operationId);
    expect(invoke.mock.calls).toEqual([
      [IpcChannel.GitInspectCommitMessageEdit, request],
      [IpcChannel.GitRewordCommitMessage, request],
      [IpcChannel.GitCommitMessageEditBackups, request.repoPath],
      [IpcChannel.GitCancelCommitMessageEdit, request.operationId],
    ]);
  });
  it('reads inactive repository summaries without reporting active-workspace failure or changing selection', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: false, error: '[REPO_UNAVAILABLE] Repository was deleted.' });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);
    const listener = vi.fn();
    api.git.onRepoUnavailable(listener);
    const request = { requestId: 'summary-1', priority: 'speculative' as const };
    await api.git.getRepositoryChangeSummary('C:/inactive', request);
    expect(invoke).toHaveBeenCalledExactlyOnceWith(IpcChannel.GitRepositoryChangeSummary, 'C:/inactive', request);
    expect(listener).not.toHaveBeenCalled();
  });
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

  it('passes a requested text encoding through the repository-pinned writer', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);

    await api.git.writeRepoFile('notes.txt', 'café', 'C:/captured-repo', 'latin1');

    expect(invoke).toHaveBeenCalledWith(IpcChannel.GitWriteRepoFile, 'notes.txt', 'café', 'C:/captured-repo', 'latin1');
  });

  it('pins an explicitly requested large-image preview to the captured repository', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);

    await api.git.getWorkingDirectoryPreview('assets/large.png', 'C:/captured-repo', true);

    expect(invoke).toHaveBeenCalledWith(IpcChannel.GitGetWorkingDirectoryPreview, 'assets/large.png', 'C:/captured-repo', true);
  });

  it('passes the full selected source and save version through both file-viewer API surfaces', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);
    const context = { repoPath: 'C:/captured-repo', path: 'notes.txt', source: 'staged' as const };
    await api.git.getRepositoryFilePreview(context);
    await api.getRepositoryFileInfo(context);
    const save = { ...context, expectedVersion: 'snapshot', content: 'draft', encoding: 'utf8' as const };
    await api.git.saveRepositoryFile(save);
    expect(invoke).toHaveBeenCalledWith(IpcChannel.GitGetRepositoryFilePreview, context);
    expect(invoke).toHaveBeenCalledWith(IpcChannel.GitGetRepositoryFileInfo, context);
    expect(invoke).toHaveBeenCalledWith(IpcChannel.GitSaveRepositoryFile, save);
  });

  it('pins working-directory file creation to the repository captured by the caller', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);

    await api.git.createWorkingDirectoryFile('src/new-file.ts', 'C:/captured-repo');

    expect(invoke).toHaveBeenCalledWith(IpcChannel.GitCreateWorkingDirectoryFile, 'src/new-file.ts', 'C:/captured-repo');
  });

  it('pins working-directory folder creation to the repository captured by the caller', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);

    await api.git.createWorkingDirectoryFolder('src/new-folder', 'C:/captured-repo');

    expect(invoke).toHaveBeenCalledWith(IpcChannel.GitCreateWorkingDirectoryFolder, 'src/new-folder', 'C:/captured-repo');
  });

  it('pins working-directory batch tools to the repository captured by the caller', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);
    const moves = [{ sourcePath: 'photo.jpeg', targetPath: 'images/photo.jpeg' }];

    await api.git.applyWorkingDirectoryMoves(moves, true, 'C:/captured-repo');
    await api.git.listWorkingDirectoryFolders('C:/captured-repo', 'src');
    await api.git.findEmptyWorkingDirectoryFolders(['tmp'], 'C:/captured-repo');
    await api.git.deleteEmptyWorkingDirectoryFolders(['tmp'], 'C:/captured-repo');
    await api.git.createWorkingDirectoryArchive(['README.md'], 'README.zip', 'C:/captured-repo');
    await api.git.searchWorkingDirectory({ query: 'app', mode: 'content' }, 'C:/captured-repo');
    await api.git.replaceWorkingDirectory({ query: 'app', replacement: 'tool', all: true }, 'C:/captured-repo');

    expect(invoke).toHaveBeenNthCalledWith(1, IpcChannel.GitApplyWorkingDirectoryMoves, { moves, createParentFolders: true }, 'C:/captured-repo');
    expect(invoke).toHaveBeenNthCalledWith(2, IpcChannel.GitListWorkingDirectoryFolders, 'C:/captured-repo', 'src');
    expect(invoke).toHaveBeenNthCalledWith(3, IpcChannel.GitFindEmptyWorkingDirectoryFolders, ['tmp'], 'C:/captured-repo');
    expect(invoke).toHaveBeenNthCalledWith(4, IpcChannel.GitDeleteEmptyWorkingDirectoryFolders, ['tmp'], 'C:/captured-repo');
    expect(invoke).toHaveBeenNthCalledWith(
      5,
      IpcChannel.GitCreateWorkingDirectoryArchive,
      { sourcePaths: ['README.md'], targetPath: 'README.zip' },
      'C:/captured-repo',
    );
    expect(invoke).toHaveBeenNthCalledWith(6, IpcChannel.GitSearchWorkingDirectory, { query: 'app', mode: 'content' }, 'C:/captured-repo');
    expect(invoke).toHaveBeenNthCalledWith(7, IpcChannel.GitReplaceWorkingDirectory, { query: 'app', replacement: 'tool', all: true }, 'C:/captured-repo');
  });

  it('pins secret-scan and approval IPC calls to the captured repository', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true, data: { findings: [] } });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() } as any);

    await api.git.scanCommitSecrets({ repoPath: 'C:/captured-repo' });
    await api.git.approveSecretScanCommit('C:/captured-repo');
    await api.git.scanPushSecrets({ repoPath: 'C:/captured-repo', includeTags: true, pushArgs: ['origin', 'main'], progressId: 'scan-1' });
    await api.git.approveSecretScanPush(['origin', 'main'], 'C:/captured-repo');

    expect(invoke).toHaveBeenNthCalledWith(1, IpcChannel.GitScanCommitSecrets, {
      repoPath: 'C:/captured-repo',
    });
    expect(invoke).toHaveBeenNthCalledWith(2, IpcChannel.GitApproveSecretScanCommit, 'C:/captured-repo');
    expect(invoke).toHaveBeenNthCalledWith(3, IpcChannel.GitScanPushSecrets, {
      repoPath: 'C:/captured-repo',
      includeTags: true,
      pushArgs: ['origin', 'main'],
      progressId: 'scan-1',
    });
    expect(invoke).toHaveBeenNthCalledWith(4, IpcChannel.GitApproveSecretScanPush, ['origin', 'main'], 'C:/captured-repo');
  });
});
