import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerGitHandlers } from '../registerGitHandlers';

const { handleMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock,
  },
  shell: {
    openPath: vi.fn(),
  },
}));

describe('registerGitHandlers', () => {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();

  beforeEach(() => {
    handlers.clear();
    handleMock.mockReset();
    handleMock.mockImplementation((channel: string, callback: (...args: any[]) => Promise<any>) => {
      handlers.set(channel, callback);
    });
  });

  it('keeps the same job id between start and failed events for long-running git commands', async () => {
    const send = vi.fn();
    const gitService = {
      runCommand: vi.fn().mockRejectedValue(new Error('push failed')),
      getStatus: vi.fn(),
      getStatusPorcelain: vi.fn(),
      getLog: vi.fn(),
      getBranches: vi.fn(),
      getCommitDetails: vi.fn(),
      checkoutConflictVersion: vi.fn(),
      addFile: vi.fn(),
      continueMerge: vi.fn(),
      abortMerge: vi.fn(),
      continueRebase: vi.fn(),
      abortRebase: vi.fn(),
      getSubmoduleStatus: vi.fn(),
      updateSubmodulesInitRecursive: vi.fn(),
      syncSubmodulesRecursive: vi.fn(),
      getReflog: vi.fn(),
      getForensicHistoryByString: vi.fn(),
      getForensicHistoryByRegex: vi.fn(),
      getForensicHistoryByLineRange: vi.fn(),
    } as any;

    registerGitHandlers({
      gitService,
      secretScanService: { scanPushDiffs: vi.fn() } as any,
      commitStatsService: {
        onUpdate: vi.fn(() => vi.fn()),
        interruptBackgroundWork: vi.fn(),
      } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn() as any,
    });

    const commandHandler = handlers.get('git:command');
    expect(commandHandler).toBeTruthy();

    const result = await commandHandler!({ sender: { send } }, 'push');
    expect(result).toEqual({ success: false, error: 'push failed' });

    const jobEvents = send.mock.calls
      .filter((call) => call[0] === 'job:event')
      .map((call) => call[1]);

    expect(jobEvents).toHaveLength(2);
    expect(jobEvents[0].status).toBe('start');
    expect(jobEvents[1].status).toBe('failed');
    expect(jobEvents[0].id).toBe(jobEvents[1].id);
    expect(jobEvents[0].operation).toBe('git:push');
    expect(jobEvents[1].operation).toBe('git:push');
  });

  it('forwards explicit status args to git instead of always using short status', async () => {
    const gitService = {
      runCommand: vi.fn().mockResolvedValue('# branch.oid abc'),
      getStatus: vi.fn().mockResolvedValue('short output'),
      getStatusPorcelain: vi.fn(),
      getLog: vi.fn(),
      getBranches: vi.fn(),
      getCommitDetails: vi.fn(),
      checkoutConflictVersion: vi.fn(),
      addFile: vi.fn(),
      continueMerge: vi.fn(),
      abortMerge: vi.fn(),
      continueRebase: vi.fn(),
      abortRebase: vi.fn(),
      getSubmoduleStatus: vi.fn(),
      updateSubmodulesInitRecursive: vi.fn(),
      syncSubmodulesRecursive: vi.fn(),
      getReflog: vi.fn(),
      getForensicHistoryByString: vi.fn(),
      getForensicHistoryByRegex: vi.fn(),
      getForensicHistoryByLineRange: vi.fn(),
    } as any;

    registerGitHandlers({
      gitService,
      secretScanService: { scanPushDiffs: vi.fn() } as any,
      commitStatsService: {
        onUpdate: vi.fn(() => vi.fn()),
        interruptBackgroundWork: vi.fn(),
      } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn() as any,
    });

    const commandHandler = handlers.get('git:command');
    expect(commandHandler).toBeTruthy();

    const result = await commandHandler!({ sender: { send: vi.fn() } }, 'status', '--porcelain=v2', '--branch');
    expect(result).toEqual({ success: true, data: '# branch.oid abc' });
    expect(gitService.runCommand).toHaveBeenCalledWith(['status', '--porcelain=v2', '--branch']);
    expect(gitService.getStatus).not.toHaveBeenCalled();
  });

  it('streams pull progress through job events', async () => {
    const send = vi.fn();
    const gitService = {
      runCommand: vi.fn(),
      streamCommandOutput: vi.fn(async (_args: string[], onLine: (line: string) => void) => {
        onLine('Receiving objects: 50% (5/10), 1.00 MiB | 2.00 MiB/s');
        onLine('Resolving deltas: 25% (2/8)');
        return 'pull ok';
      }),
      getStatus: vi.fn(),
      getStatusPorcelain: vi.fn(),
      getLog: vi.fn(),
      getBranches: vi.fn(),
      getCommitDetails: vi.fn(),
      checkoutConflictVersion: vi.fn(),
      addFile: vi.fn(),
      continueMerge: vi.fn(),
      abortMerge: vi.fn(),
      continueRebase: vi.fn(),
      abortRebase: vi.fn(),
      getSubmoduleStatus: vi.fn(),
      updateSubmodulesInitRecursive: vi.fn(),
      syncSubmodulesRecursive: vi.fn(),
      getReflog: vi.fn(),
      getForensicHistoryByString: vi.fn(),
      getForensicHistoryByRegex: vi.fn(),
      getForensicHistoryByLineRange: vi.fn(),
    } as any;

    registerGitHandlers({
      gitService,
      secretScanService: { scanPushDiffs: vi.fn() } as any,
      commitStatsService: {
        onUpdate: vi.fn(() => vi.fn()),
        interruptBackgroundWork: vi.fn(),
      } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn() as any,
    });

    const commandHandler = handlers.get('git:command');
    expect(commandHandler).toBeTruthy();

    const result = await commandHandler!({ sender: { send } }, 'pull', '--rebase');
    expect(result).toEqual({ success: true, data: 'pull ok' });
    expect(gitService.streamCommandOutput).toHaveBeenCalledWith(
      ['pull', '--progress', '--rebase'],
      expect.any(Function),
    );

    const jobEvents = send.mock.calls
      .filter((call) => call[0] === 'job:event')
      .map((call) => call[1]);

    expect(jobEvents.map((event) => event.status)).toEqual(['start', 'progress', 'progress', 'done']);
    expect(jobEvents[1]).toEqual(expect.objectContaining({
      operation: 'git:pull',
      message: 'Receiving objects: 50% (5/10), 1.00 MiB | 2.00 MiB/s',
    }));
    expect(jobEvents[2]).toEqual(expect.objectContaining({
      operation: 'git:pull',
      message: 'Resolving deltas: 25% (2/8)',
    }));
    expect(new Set(jobEvents.map((event) => event.id)).size).toBe(1);
  });
});
