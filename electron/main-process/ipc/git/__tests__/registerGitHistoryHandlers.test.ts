import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../../../src/types/ipcContract';
import { registerGitHandlers } from '../../registerGitHandlers';
import { BranchHeadError, type RepositoryHeadService } from '../../../../git/RepositoryHeadService';

const { handleMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
  shell: { openPath: vi.fn() },
}));

describe('registerGitHistoryHandlers through registerGitHandlers', () => {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();

  beforeEach(() => {
    handlers.clear();
    handleMock.mockReset();
    handleMock.mockImplementation((channel: string, callback: (...args: any[]) => Promise<any>) => {
      handlers.set(channel, callback);
    });
  });

  const register = (gitService: any, heads?: RepositoryHeadService) => {
    registerGitHandlers({
      gitService,
      secretScanService: { scanPushDiffs: vi.fn() } as any,
      commitStatsService: {
        onUpdate: vi.fn(() => vi.fn()),
        interruptBackgroundWork: vi.fn(),
        getCachedStats: vi.fn(),
      } as any,
      workingTreeService: {} as any,
      heads,
      readSettingsWithMigration: vi.fn() as any,
    });
  };

  it('forwards complete history options and preserves historical paths in the response', async () => {
    const hash = 'a'.repeat(40);
    const read = vi.fn().mockResolvedValue(`${hash}\x1faaaaaaaa\x1fAuthor\x1f2026-10-22\x1fchange\0\nM\0old/ file.ts\0`);
    register({ getRepoPath: () => 'C:/repo', history: { getFileHistory: read } });
    const handler = handlers.get(IpcChannel.GitFileHistory)!;
    const result = await handler({}, 'old/ file.ts', hash, 81, 'C:/repo', { includeFuture: true, offset: 80 });
    expect(read).toHaveBeenCalledExactlyOnceWith('old/ file.ts', 81, hash, 'C:/repo', { includeFuture: true, offset: 80 });
    expect(result.data[0]).toMatchObject({ hash, path: 'old/ file.ts' });
    for (const options of [{ offset: -1 }, { offset: Number.NaN }, { includeFuture: 'yes' }, []]) {
      expect(await handler({}, 'file.ts', hash, 81, 'C:/repo', options)).toMatchObject({ success: false });
    }
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('forwards the captured timeline commit and rejects untrusted revision arguments', async () => {
    const gitService = { getRepoPath: vi.fn(() => 'C:/repo'), history: { getFileTimelineData: vi.fn().mockResolvedValue([]) } };
    register(gitService);
    const handler = handlers.get(IpcChannel.GitGetFileTimelineData)!;
    const hash = 'a'.repeat(40);
    expect(await handler({}, 5000, 'C:/repo', hash)).toEqual({ success: true, data: [] });
    expect(gitService.history.getFileTimelineData).toHaveBeenCalledWith(5000, 'C:/repo', hash);
    expect(await handler({}, 5000, 'C:/repo', '--all')).toMatchObject({ success: false });
    expect(await handler({}, 5000, 'C:/repo', { revision: hash })).toMatchObject({ success: false });
    expect(gitService.history.getFileTimelineData).toHaveBeenCalledOnce();
  });

  it('returns an empty commit page only when HEAD is genuinely unborn', async () => {
    const gitService = {
      getRepoPath: vi.fn(() => 'C:/repo'),
      history: { getLog: vi.fn() },
    };
    const read = vi.fn().mockResolvedValue({ kind: 'unborn', ref: 'refs/heads/main' });
    register(gitService, { read } as unknown as RepositoryHeadService);

    const result = await handlers.get(IpcChannel.GitCommitLogPage)!({}, {});

    expect(read).toHaveBeenCalledWith('C:/repo', { signal: expect.any(AbortSignal), requestedKind: 'interactive' });
    expect(result).toEqual({ success: true, data: { raw: '', hasMore: false, stats: {}, repoPath: 'C:/repo' } });
    expect(gitService.history.getLog).not.toHaveBeenCalled();
  });

  it('propagates a corrupt HEAD instead of presenting an empty history', async () => {
    const gitService = {
      getRepoPath: vi.fn(() => 'C:/repo'),
      history: { getLog: vi.fn() },
    };
    const problem = { repoPath: 'C:/repo', ref: 'refs/heads/main', reason: 'broken-ref' as const, repairable: true };
    const read = vi.fn().mockRejectedValue(new BranchHeadError(problem));
    register(gitService, { read } as unknown as RepositoryHeadService);

    const result = await handlers.get(IpcChannel.GitCommitLogPage)!({}, {});

    expect(result).toMatchObject({ success: false, headProblem: problem });
    expect(gitService.history.getLog).not.toHaveBeenCalled();
  });
});
