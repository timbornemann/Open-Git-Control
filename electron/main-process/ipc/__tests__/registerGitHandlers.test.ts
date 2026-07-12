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
      getRepoPath: vi.fn(() => 'C:/repo'),
      runCommandAtPath: vi.fn().mockRejectedValue(new Error('push failed')),
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
      getRepoPath: vi.fn(() => 'C:/repo'),
      runCommandAtPath: vi.fn().mockResolvedValue('# branch.oid abc'),
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
    expect(gitService.runCommandAtPath).toHaveBeenCalledWith('C:/repo', ['status', '--porcelain=v2', '--branch']);
    expect(gitService.getStatus).not.toHaveBeenCalled();
  });

  it('streams pull progress through job events', async () => {
    const send = vi.fn();
    const gitService = {
      getRepoPath: vi.fn(() => 'C:/repo'),
      streamCommandOutputAtPath: vi.fn(async (_repoPath: string, _args: string[], onLine: (line: string) => void) => {
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
    expect(gitService.streamCommandOutputAtPath).toHaveBeenCalledWith('C:/repo', ['pull', '--progress', '--rebase'], expect.any(Function));

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

  it('commits directly when the pre-commit secret scan is disabled', async () => {
    const commitWithMessageAtPath = vi.fn().mockResolvedValue('commit ok');
    const gitService = {
      getRepoPath: vi.fn(() => 'C:/repo'),
      commits: { commitWithMessageAtPath },
    } as any;

    registerGitHandlers({
      gitService,
      secretScanService: {} as any,
      commitStatsService: { onUpdate: vi.fn(() => vi.fn()), interruptBackgroundWork: vi.fn() } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn(() => ({ secretScanBeforeCommitEnabled: false })) as any,
    });

    const result = await handlers.get('git:createCommit')!({ sender: { send: vi.fn() } }, { title: 'feat: safe change', description: 'Details' });

    expect(result).toEqual({ success: true, data: 'commit ok' });
    expect(commitWithMessageAtPath).toHaveBeenCalledWith('C:/repo', {
      title: 'feat: safe change',
      description: 'Details',
      amend: false,
      signoff: false,
      allowEmpty: false,
    });
  });

  it('requires an in-app approval before committing secret scan findings', async () => {
    const scanStagedDiffs = vi.fn().mockResolvedValue({
      scanned: true,
      strictness: 'medium',
      findings: [{ filePath: '.env', lineNumber: 1, contextLine: '[REDACTED_SECRET]' }],
      notes: [],
      stats: { checkedLines: 1, stagedLines: 1, toPushLines: 0, tagLines: 0 },
    });
    const commitWithMessageAtPath = vi.fn().mockResolvedValue('commit ok');
    const gitService = {
      getRepoPath: vi.fn(() => 'C:/repo'),
      runCommandAtPath: vi.fn((_repoPath: string, args: string[]) => (args[0] === 'status' ? '# branch.oid abc\0' : 'H 100644 abc 0\t.env\0')),
      commits: { commitWithMessageAtPath },
    } as any;

    registerGitHandlers({
      gitService,
      secretScanService: { scanStagedDiffs } as any,
      commitStatsService: { onUpdate: vi.fn(() => vi.fn()), interruptBackgroundWork: vi.fn() } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn(() => ({ secretScanBeforeCommitEnabled: true, secretScanStrictness: 'medium', secretScanAllowlist: '' })) as any,
    });

    const event = { sender: { id: 9, send: vi.fn() } };
    const result = await handlers.get('git:createCommit')!(event, { title: 'feat: unsafe change' });

    expect(result).toEqual({
      success: false,
      error: 'Potential secrets were detected. Confirm the in-app dialog before committing.',
    });
    expect(commitWithMessageAtPath).not.toHaveBeenCalled();
    await expect(handlers.get('git:scanCommitSecrets')!(event, { repoPath: 'C:/repo' })).resolves.toEqual(expect.objectContaining({ success: true }));
    await expect(handlers.get('git:approveSecretScanCommit')!(event, 'C:/repo')).resolves.toEqual({ success: true });
    await expect(handlers.get('git:createCommit')!(event, { title: 'feat: reviewed change' })).resolves.toEqual({
      success: true,
      data: 'commit ok',
    });
    expect(commitWithMessageAtPath).toHaveBeenCalled();
  });

  it('allows opting out of the pre-commit scan without changing the push protection setting', async () => {
    const scanStagedDiffs = vi.fn();
    const commitWithMessageAtPath = vi.fn().mockResolvedValue('commit ok');
    const gitService = {
      getRepoPath: vi.fn(() => 'C:/repo'),
      commits: { commitWithMessageAtPath },
    } as any;

    registerGitHandlers({
      gitService,
      secretScanService: { scanStagedDiffs } as any,
      commitStatsService: { onUpdate: vi.fn(() => vi.fn()), interruptBackgroundWork: vi.fn() } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn(() => ({ secretScanBeforeCommitEnabled: false, secretScanBeforePushEnabled: true })) as any,
    });

    await expect(handlers.get('git:createCommit')!({ sender: { send: vi.fn() } }, { title: 'chore: local change' })).resolves.toEqual({
      success: true,
      data: 'commit ok',
    });
    expect(scanStagedDiffs).not.toHaveBeenCalled();
    expect(commitWithMessageAtPath).toHaveBeenCalled();
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
      runCommandAtPath: vi.fn().mockResolvedValue('push ok'),
      getRepoPath: vi.fn(() => 'C:/repo'),
      resolveRepositoryPathAsync: vi.fn((repoPath: string) => repoPath),
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
    expect(gitService.runCommandAtPath).toHaveBeenCalledWith('C:/repo', ['push', '--tags']);
  });

  it('requires an in-app confirmation for push findings instead of trusting a renderer flag', async () => {
    const scanPushDiffs = vi.fn().mockResolvedValue({
      scanned: true,
      strictness: 'medium',
      findings: [{ filePath: '.env', lineNumber: 1, contextLine: '[REDACTED_SECRET]' }],
      notes: [],
      stats: { checkedLines: 1, stagedLines: 1, toPushLines: 0, tagLines: 0 },
    });
    const gitService = {
      runCommandAtPath: vi.fn().mockResolvedValue('should not push'),
      getRepoPath: vi.fn(() => 'C:/repo'),
      resolveRepositoryPathAsync: vi.fn((repoPath: string) => repoPath),
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

    expect(result).toEqual({ success: false, error: 'Potential secrets were detected. Confirm the in-app dialog before pushing.' });
    expect(gitService.runCommandAtPath.mock.calls.some((call: any[]) => call[1]?.[0] === 'push')).toBe(false);
  });

  it('continues after an in-app approval', async () => {
    const scanPushDiffs = vi.fn().mockResolvedValue({
      scanned: true,
      strictness: 'medium',
      findings: [{ filePath: '.env', lineNumber: 1, contextLine: '[REDACTED_SECRET]' }],
      notes: [],
      stats: { checkedLines: 1, stagedLines: 1, toPushLines: 0, tagLines: 0 },
    });
    const gitService = {
      runCommandAtPath: vi.fn().mockResolvedValue('push ok'),
      getRepoPath: vi.fn(() => 'C:/repo'),
      resolveRepositoryPathAsync: vi.fn((repoPath: string) => repoPath),
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

    await handlers.get('git:scanPushSecrets')!({ sender: { id: 42, send: vi.fn() } }, { repoPath: 'C:/repo', pushArgs: [] });
    const approval = await handlers.get('git:approveSecretScanPush')!({ sender: { id: 42 } }, [], 'C:/repo');
    expect(approval).toEqual({ success: true });
    const result = await handlers.get('git:command')!({ sender: { id: 42, send: vi.fn() } }, 'push');

    expect(result).toEqual({ success: true, data: 'push ok' });
    expect(scanPushDiffs).toHaveBeenCalledTimes(1);
    expect(gitService.runCommandAtPath).toHaveBeenCalledWith('C:/repo', ['push']);
  });

  it('does not honor an approval granted for a different push destination', async () => {
    const scanPushDiffs = vi.fn().mockResolvedValue({
      scanned: true,
      strictness: 'medium',
      findings: [{ filePath: '.env', lineNumber: 1, contextLine: '[REDACTED_SECRET]' }],
      notes: [],
      stats: { checkedLines: 1, stagedLines: 1, toPushLines: 0, tagLines: 0 },
    });
    const gitService = {
      runCommandAtPath: vi.fn().mockResolvedValue('should not push'),
      getRepoPath: vi.fn(() => 'C:/repo'),
      resolveRepositoryPathAsync: vi.fn((repoPath: string) => repoPath),
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

    // Approval is granted for `git push origin feature`, but the actual push
    // targets a different (default) destination, so the scan must still run.
    await handlers.get('git:scanPushSecrets')!({ sender: { id: 7, send: vi.fn() } }, { repoPath: 'C:/repo', pushArgs: ['origin', 'feature'] });
    const approval = await handlers.get('git:approveSecretScanPush')!({ sender: { id: 7 } }, ['origin', 'feature'], 'C:/repo');
    expect(approval).toEqual({ success: true });
    const result = await handlers.get('git:command')!({ sender: { id: 7, send: vi.fn() } }, 'push');

    expect(result).toEqual({ success: false, error: 'Potential secrets were detected. Confirm the in-app dialog before pushing.' });
    expect(scanPushDiffs).toHaveBeenCalled();
    expect(gitService.runCommandAtPath.mock.calls.some((call: any[]) => call[1]?.[0] === 'push')).toBe(false);
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

  it('allows read-only origin lookup for an inactive main-owned workspace repository', async () => {
    const getRepoOriginUrl = vi.fn().mockResolvedValue('https://github.com/acme/repo-b.git');
    const gitService = {
      getRepoPath: vi.fn(() => 'C:/repos/repo-a'),
      getRepoOriginUrl,
    } as any;
    registerGitHandlers({
      gitService,
      secretScanService: {} as any,
      commitStatsService: { onUpdate: vi.fn(() => vi.fn()), interruptBackgroundWork: vi.fn() } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn() as any,
      readStoredRepoPaths: () => ['C:/repos/repo-a', 'C:/repos/repo-b'],
    });

    await expect(handlers.get('git:repoOriginUrl')!({}, 'C:/repos/repo-b')).resolves.toEqual({
      success: true,
      data: 'https://github.com/acme/repo-b.git',
    });
    expect(getRepoOriginUrl).toHaveBeenCalledWith('C:/repos/repo-b');
  });

  it('rejects origin lookup for an arbitrary renderer-supplied repository path', async () => {
    const getRepoOriginUrl = vi.fn();
    const gitService = {
      getRepoPath: vi.fn(() => 'C:/repos/repo-a'),
      getRepoOriginUrl,
    } as any;
    registerGitHandlers({
      gitService,
      secretScanService: {} as any,
      commitStatsService: { onUpdate: vi.fn(() => vi.fn()), interruptBackgroundWork: vi.fn() } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn() as any,
      readStoredRepoPaths: () => ['C:/repos/repo-a', 'C:/repos/repo-b'],
    });

    await expect(handlers.get('git:repoOriginUrl')!({}, 'C:/private/other')).resolves.toEqual({
      success: false,
      error: 'Requested repository is not an open repository.',
    });
    expect(getRepoOriginUrl).not.toHaveBeenCalled();
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

  it('does not let a stale timeout cancel a secret scan in the newly active repository', async () => {
    const gitService = {
      getRepoPath: vi.fn(() => 'C:/repos/current'),
    } as any;
    registerGitHandlers({
      gitService,
      secretScanService: {} as any,
      commitStatsService: { onUpdate: vi.fn(() => vi.fn()), interruptBackgroundWork: vi.fn() } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn() as any,
    });

    await expect(handlers.get('git:cancelSecretScan')!({}, 'C:/repos/previous')).resolves.toEqual({
      success: false,
      cancelled: false,
      error: 'Requested repository is not the active repository.',
    });
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

  it('returns the canonical repository root selected by GitSetRepo', async () => {
    let activeRepo = 'C:/old-repo';
    const gitService = {
      setRepoPath: vi.fn(() => {
        activeRepo = 'C:/work/repo';
      }),
      getRepoPath: vi.fn(() => activeRepo),
    } as any;
    const cancelForRepoChange = vi.fn();
    const setActiveRepo = vi.fn();
    registerGitHandlers({
      gitService,
      secretScanService: {} as any,
      commitStatsService: { onUpdate: vi.fn(() => vi.fn()), interruptBackgroundWork: vi.fn(), setActiveRepo } as any,
      workingTreeService: { setActiveRepo: vi.fn() } as any,
      readSettingsWithMigration: vi.fn() as any,
      repoJobRegistry: { cancelForRepoChange } as any,
    });

    await expect(handlers.get('git:setRepo')!({}, 'C:/work/repo/packages/app')).resolves.toBe('C:/work/repo');
    expect(gitService.setRepoPath).toHaveBeenCalledWith('C:/work/repo/packages/app');
    expect(cancelForRepoChange).toHaveBeenCalledWith('C:/work/repo');
    expect(setActiveRepo).toHaveBeenCalledWith('C:/work/repo');
  });

  it('resolves a stored repository alias without changing the active repository', async () => {
    const gitService = {
      resolveRepositoryPathAsync: vi.fn().mockResolvedValue('C:/work/repo'),
      setRepoPath: vi.fn(),
    } as any;
    registerGitHandlers({
      gitService,
      secretScanService: {} as any,
      commitStatsService: { onUpdate: vi.fn(() => vi.fn()), interruptBackgroundWork: vi.fn() } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn() as any,
    });

    await expect(handlers.get('git:resolveRepoPath')!({}, 'C:/work/repo/packages/app')).resolves.toBe('C:/work/repo');
    expect(gitService.resolveRepositoryPathAsync).toHaveBeenCalledWith('C:/work/repo/packages/app');
    expect(gitService.setRepoPath).not.toHaveBeenCalled();
  });

  it('rejects an empty GitSetRepo request before changing backend state', async () => {
    const gitService = { setRepoPath: vi.fn() } as any;
    registerGitHandlers({
      gitService,
      secretScanService: {} as any,
      commitStatsService: { onUpdate: vi.fn(() => vi.fn()), interruptBackgroundWork: vi.fn() } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn() as any,
    });

    await expect(handlers.get('git:setRepo')!({}, '  ')).rejects.toThrow('Repository path is required.');
    expect(gitService.setRepoPath).not.toHaveBeenCalled();
  });

  it('initializes an explicit target without changing the selected repository', async () => {
    const gitService = {
      runCommandAtPath: vi.fn().mockResolvedValue('initialized'),
      setRepoPath: vi.fn(),
    } as any;
    const cancelForRepoChange = vi.fn();
    registerGitHandlers({
      gitService,
      secretScanService: {} as any,
      commitStatsService: { onUpdate: vi.fn(() => vi.fn()), interruptBackgroundWork: vi.fn(), setActiveRepo: vi.fn() } as any,
      workingTreeService: {} as any,
      readSettingsWithMigration: vi.fn() as any,
      repoJobRegistry: { cancelForRepoChange } as any,
    });

    await expect(handlers.get('git:init')!({}, 'C:/new-repo')).resolves.toEqual({ success: true, data: 'initialized' });
    expect(gitService.setRepoPath).not.toHaveBeenCalled();
    expect(cancelForRepoChange).not.toHaveBeenCalled();
  });
});
