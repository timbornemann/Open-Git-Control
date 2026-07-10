import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../../../src/types/ipcContract';
import { registerGitHandlers } from '../../registerGitHandlers';

const { handleMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
  shell: { openPath: vi.fn() },
  dialog: { showMessageBox: vi.fn() },
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

  const register = (gitService: any, commitStatsService: any = {}) => {
    registerGitHandlers({
      gitService,
      secretScanService: { scanPushDiffs: vi.fn() } as any,
      commitStatsService: {
        onUpdate: vi.fn(() => vi.fn()),
        interruptBackgroundWork: vi.fn(),
        getCachedStats: vi.fn(),
        ...commitStatsService,
      } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn() as any,
    });
  };

  it('returns an empty commit page only when HEAD is genuinely unborn', async () => {
    const gitService = {
      getRepoPath: vi.fn(() => 'C:/repo'),
      runCommand: vi.fn().mockRejectedValue(Object.assign(new Error('Command failed'), { name: 'ExpectedNonFatalGitError' })),
      history: { getLog: vi.fn() },
    };
    register(gitService);

    const result = await handlers.get(IpcChannel.GitCommitLogPage)!({}, {});

    expect(gitService.runCommand).toHaveBeenCalledWith(['rev-parse', '--verify', '--quiet', 'HEAD']);
    expect(result).toEqual({ success: true, data: { raw: '', hasMore: false, stats: {}, repoPath: 'C:/repo' } });
    expect(gitService.history.getLog).not.toHaveBeenCalled();
  });

  it('propagates a corrupt HEAD instead of presenting an empty history', async () => {
    const gitService = {
      getRepoPath: vi.fn(() => 'C:/repo'),
      runCommand: vi.fn().mockRejectedValue(new Error('fatal: bad object HEAD')),
      history: { getLog: vi.fn() },
    };
    register(gitService);

    const result = await handlers.get(IpcChannel.GitCommitLogPage)!({}, {});

    expect(result).toEqual({ success: false, error: 'fatal: bad object HEAD' });
    expect(gitService.history.getLog).not.toHaveBeenCalled();
  });
});
