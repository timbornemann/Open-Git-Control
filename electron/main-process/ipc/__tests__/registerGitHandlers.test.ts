import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerGitHandlers } from '../registerGitHandlers';

const { handleMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
}));
const { showMessageBoxMock } = vi.hoisted(() => ({
  showMessageBoxMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock,
  },
  shell: {
    openPath: vi.fn(),
  },
  dialog: {
    showMessageBox: showMessageBoxMock,
  },
}));

describe('registerGitHandlers', () => {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();

  beforeEach(() => {
    handlers.clear();
    handleMock.mockReset();
    showMessageBoxMock.mockReset();
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

    const jobEvents = send.mock.calls.filter((call) => call[0] === 'job:event').map((call) => call[1]);

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
    expect(gitService.streamCommandOutput).toHaveBeenCalledWith(['pull', '--progress', '--rebase'], expect.any(Function));

    const jobEvents = send.mock.calls.filter((call) => call[0] === 'job:event').map((call) => call[1]);

    expect(jobEvents.map((event) => event.status)).toEqual(['start', 'progress', 'progress', 'done']);
    expect(jobEvents[1]).toEqual(
      expect.objectContaining({
        operation: 'git:pull',
        message: 'Receiving objects: 50% (5/10), 1.00 MiB | 2.00 MiB/s',
      }),
    );
    expect(jobEvents[2]).toEqual(
      expect.objectContaining({
        operation: 'git:pull',
        message: 'Resolving deltas: 25% (2/8)',
      }),
    );
    expect(new Set(jobEvents.map((event) => event.id)).size).toBe(1);
  });

  it('runs the secret scan in the main process before a push and only proceeds when it is clean', async () => {
    const send = vi.fn();
    const scanPushDiffs = vi.fn().mockResolvedValue({
      scanned: true,
      strictness: 'medium',
      findings: [],
      notes: [],
      stats: { checkedLines: 0, stagedLines: 0, toPushLines: 0, tagLines: 0 },
    });
    const gitService = {
      runCommand: vi.fn().mockResolvedValue('push ok'),
      getRepoPath: vi.fn(() => 'C:/repo'),
      resolveRepositoryPath: vi.fn((repoPath: string) => repoPath),
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
      secretScanService: { scanPushDiffs } as any,
      commitStatsService: { onUpdate: vi.fn(() => vi.fn()), interruptBackgroundWork: vi.fn() } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn(() => ({ secretScanBeforePushEnabled: true, secretScanStrictness: 'medium', secretScanAllowlist: '' })) as any,
    });

    const commandHandler = handlers.get('git:command');
    const result = await commandHandler!({ sender: { send } }, 'push', '--tags');

    expect(result).toEqual({ success: true, data: 'push ok' });
    expect(scanPushDiffs).toHaveBeenCalledWith(expect.objectContaining({ repoPath: 'C:/repo', includeTags: true, strictness: 'medium' }));
    expect(gitService.runCommand).toHaveBeenCalledWith(['push', '--tags']);
    expect(showMessageBoxMock).not.toHaveBeenCalled();
  });

  it('requires a native confirmation for push findings instead of trusting a renderer flag', async () => {
    const scanPushDiffs = vi.fn().mockResolvedValue({
      scanned: true,
      strictness: 'medium',
      findings: [{ filePath: '.env', lineNumber: 1, contextLine: '[REDACTED_SECRET]' }],
      notes: [],
      stats: { checkedLines: 1, stagedLines: 1, toPushLines: 0, tagLines: 0 },
    });
    showMessageBoxMock.mockResolvedValue({ response: 0 });
    const gitService = {
      runCommand: vi.fn().mockResolvedValue('should not push'),
      getRepoPath: vi.fn(() => 'C:/repo'),
      resolveRepositoryPath: vi.fn((repoPath: string) => repoPath),
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
      secretScanService: { scanPushDiffs } as any,
      commitStatsService: { onUpdate: vi.fn(() => vi.fn()), interruptBackgroundWork: vi.fn() } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn(() => ({ secretScanBeforePushEnabled: true, secretScanStrictness: 'medium', secretScanAllowlist: '' })) as any,
    });

    const commandHandler = handlers.get('git:command');
    const result = await commandHandler!({ sender: { send: vi.fn() } }, 'push');

    expect(result).toEqual({ success: false, error: 'Push cancelled after secret scan findings.' });
    expect(showMessageBoxMock).toHaveBeenCalledWith(expect.objectContaining({ buttons: ['Cancel', 'Push anyway'] }));
    expect(gitService.runCommand).not.toHaveBeenCalled();
  });

  it('skips the native secret-scan dialog after an in-app approval', async () => {
    const scanPushDiffs = vi.fn().mockResolvedValue({
      scanned: true,
      strictness: 'medium',
      findings: [{ filePath: '.env', lineNumber: 1, contextLine: '[REDACTED_SECRET]' }],
      notes: [],
      stats: { checkedLines: 1, stagedLines: 1, toPushLines: 0, tagLines: 0 },
    });
    const gitService = {
      runCommand: vi.fn().mockResolvedValue('push ok'),
      getRepoPath: vi.fn(() => 'C:/repo'),
      resolveRepositoryPath: vi.fn((repoPath: string) => repoPath),
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
      continueCherryPick: vi.fn(),
      abortCherryPick: vi.fn(),
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
      secretScanService: { scanPushDiffs } as any,
      commitStatsService: { onUpdate: vi.fn(() => vi.fn()), interruptBackgroundWork: vi.fn() } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn(() => ({ secretScanBeforePushEnabled: true, secretScanStrictness: 'medium', secretScanAllowlist: '' })) as any,
    });

    await handlers.get('git:approveSecretScanPush')!({});
    const result = await handlers.get('git:command')!({ sender: { send: vi.fn() } }, 'push');

    expect(result).toEqual({ success: true, data: 'push ok' });
    expect(showMessageBoxMock).not.toHaveBeenCalled();
    expect(scanPushDiffs).not.toHaveBeenCalled();
    expect(gitService.runCommand).toHaveBeenCalledWith(['push']);
  });

  it('rejects secret scans for a renderer-selected non-active repository', async () => {
    const scanPushDiffs = vi.fn();
    const gitService = {
      getRepoPath: vi.fn(() => 'C:/active-repo'),
    } as any;

    registerGitHandlers({
      gitService,
      secretScanService: { scanPushDiffs } as any,
      commitStatsService: { onUpdate: vi.fn(() => vi.fn()), interruptBackgroundWork: vi.fn() } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn() as any,
    });

    const result = await handlers.get('git:scanPushSecrets')!({ sender: { send: vi.fn() } }, { repoPath: 'C:/private-other-repo' });

    expect(result).toEqual({ success: false, error: 'Requested repository is not the active repository.' });
    expect(scanPushDiffs).not.toHaveBeenCalled();
  });

  it('rejects staging paths from a repository that is no longer active', async () => {
    const stagePathsAtPath = vi.fn();
    const gitService = {
      getRepoPath: vi.fn(() => 'C:/repos/current'),
      commits: { stagePathsAtPath },
    } as any;
    registerGitHandlers({
      gitService,
      secretScanService: {} as any,
      commitStatsService: { onUpdate: vi.fn(() => vi.fn()), interruptBackgroundWork: vi.fn() } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn() as any,
    });

    const result = await handlers.get('git:stagePaths')!({ sender: { send: vi.fn() } }, ['stale-file.ts'], 'C:/repos/previous');

    expect(result).toEqual({ success: false, error: 'Requested repository is not the active repository.' });
    expect(stagePathsAtPath).not.toHaveBeenCalled();
  });

  it('rejects repo-bound commands from a repository that is no longer active', async () => {
    const runCommand = vi.fn();
    const gitService = {
      getRepoPath: vi.fn(() => 'C:/repos/current'),
      runCommand,
    } as any;
    registerGitHandlers({
      gitService,
      secretScanService: {} as any,
      commitStatsService: { onUpdate: vi.fn(() => vi.fn()), interruptBackgroundWork: vi.fn() } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn() as any,
    });

    const result = await handlers.get('git:commandForRepo')!({ sender: { send: vi.fn() } }, 'C:/repos/previous', 'reset', 'HEAD');

    expect(result).toEqual({ success: false, error: 'Requested repository is not the active repository.' });
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('does not replace the active repository when git init fails', async () => {
    const setRepoPath = vi.fn();
    const gitService = {
      runCommandAtPath: vi.fn().mockRejectedValue(new Error('init failed')),
      setRepoPath,
    } as any;
    registerGitHandlers({
      gitService,
      secretScanService: {} as any,
      commitStatsService: { onUpdate: vi.fn(() => vi.fn()), interruptBackgroundWork: vi.fn() } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn() as any,
    });

    const result = await handlers.get('git:init')!({}, 'C:/new-repo');

    expect(result).toEqual({ success: false, error: 'init failed' });
    expect(setRepoPath).not.toHaveBeenCalled();
  });
});
