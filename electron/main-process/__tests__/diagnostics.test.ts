import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getVersionMock } = vi.hoisted(() => ({ getVersionMock: vi.fn() }));

vi.mock('electron', () => ({ app: { getVersion: getVersionMock } }));

import { buildDiagnosticsReportFactory } from '../diagnostics';

describe('diagnostics repository binding', () => {
  beforeEach(() => {
    getVersionMock.mockReset();
    getVersionMock.mockReturnValue('1.2.3');
  });

  it('runs every Git diagnostic against the repository captured at report start', async () => {
    let activeRepo = 'C:/repos/repo-a';
    let resolveStatus: ((value: string) => void) | undefined;
    const runCommandAtPath = vi.fn((repoPath: string, args: string[]) => {
      if (args[0] === 'status') {
        return new Promise<string>((resolve) => {
          resolveStatus = resolve;
        });
      }
      return Promise.resolve(`origin\thttps://example.test/${repoPath}/repo.git (fetch)`);
    });
    const buildReport = buildDiagnosticsReportFactory({
      gitService: {
        getRepoPath: vi.fn(() => activeRepo),
        runCommandAtPath,
        getSchedulerDiagnostics: vi.fn().mockReturnValue([
          { repoPath: 'C:/repos/repo-b', kind: 'write', command: 'commit-b', durationMs: 2, resultBytes: 0, aborted: false, timestamp: 2 },
          { repoPath: 'C:/repos/repo-a', kind: 'polling', command: 'status-a', durationMs: 1, resultBytes: 4, aborted: false, timestamp: 1 },
          { repoPath: 'C:/repos/repo-a', kind: 'write', command: 'commit-a', durationMs: 3, resultBytes: 0, aborted: false, timestamp: 3 },
        ]),
      } as any,
      githubService: {
        isDeviceFlowConfigured: vi.fn().mockReturnValue(false),
      } as any,
      readSettingsWithMigration: vi.fn().mockReturnValue({
        language: 'en',
        theme: 'dark',
        autoFetchIntervalMs: 0,
        confirmDangerousOps: true,
        showSecondaryHistory: false,
        secretScanBeforeCommitEnabled: true,
        secretScanBeforePushEnabled: true,
        secretScanStrictness: 'balanced',
        secretScanAllowlist: '',
        aiProvider: 'gemini',
        githubHost: 'github.com',
        githubOauthClientId: '',
        hasGeminiApiKey: false,
      }),
      getUpdaterStatus: vi.fn().mockReturnValue({ state: 'idle', availableVersion: null, downloaded: false, error: null }),
    });

    const reportPromise = buildReport();
    await vi.waitFor(() => expect(runCommandAtPath).toHaveBeenCalledTimes(1));
    activeRepo = 'C:/repos/repo-b';
    resolveStatus?.('## main');
    const result = await reportPromise;

    expect(result.activeRepo).toBe('C:/repos/repo-a');
    expect(runCommandAtPath).toHaveBeenNthCalledWith(1, 'C:/repos/repo-a', ['status', '-sb']);
    expect(runCommandAtPath).toHaveBeenNthCalledWith(2, 'C:/repos/repo-a', ['remote', '-v']);
    expect(result.report).toContain('Active repo: C:/repos/repo-a');
    expect(result.report).toContain('entries=2');
    expect(result.report).toContain('repoPath="C:/repos/repo-a"');
    expect(result.report).toContain('command=commit-a');
    expect(result.report).not.toContain('command=commit-b');
  });
});
