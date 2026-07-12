import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RepoJobRegistry } from '../../../repoJobRegistry';
import { registerSecretScanPushGuard } from '../secretScanPushGuard';

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => Promise<any>>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, callback: (...args: any[]) => Promise<any>) => handlers.set(channel, callback)),
  },
}));

type PushState = {
  head: string;
  index: string;
  remoteRef: string;
  remoteUrl: string;
};

const findingsResult = {
  scanned: true,
  strictness: 'medium',
  findings: [{ filePath: '.env', lineNumber: 1, contextLine: '[REDACTED_SECRET]' }],
  notes: [],
  stats: { checkedLines: 1, stagedLines: 1, toPushLines: 0, tagLines: 0 },
};

const createHarness = (scanPushDiffs: ReturnType<typeof vi.fn>) => {
  const state: PushState = {
    head: '1111111111111111111111111111111111111111',
    index: 'H 100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 0\tapp.ts\0',
    remoteRef: '1111111111111111111111111111111111111111',
    remoteUrl: 'https://example.test/acme/repo.git',
  };
  const runCommandAtPath = vi.fn(async (_repoPath: string, args: string[]) => {
    switch (args[0]) {
      case 'status':
        return `# branch.oid ${state.head}\0# branch.head main\0`;
      case 'ls-files':
        return state.index;
      case 'for-each-ref':
        return [`refs/heads/main\0${state.head}\0\0`, `refs/remotes/origin/main\0${state.remoteRef}\0\0`].join('\n');
      case 'config':
        return [
          'remote.origin.url',
          state.remoteUrl,
          'remote.origin.fetch',
          '+refs/heads/*:refs/remotes/origin/*',
          'branch.main.remote',
          'origin',
          'branch.main.merge',
          'refs/heads/main',
          'push.default',
          'simple',
          '',
        ].join('\0');
      default:
        return 'push ok';
    }
  });
  const gitService = {
    getRepoPath: vi.fn(() => 'C:/repo'),
    runCommandAtPath,
  } as any;
  const settings = { secretScanBeforePushEnabled: true, secretScanStrictness: 'medium' as const, secretScanAllowlist: '' };
  const guard = registerSecretScanPushGuard({
    gitService,
    secretScanService: { scanPushDiffs } as any,
    readSettingsWithMigration: vi.fn(() => settings as any),
    repoJobRegistry: new RepoJobRegistry(),
  });
  const event = { sender: { id: 7, send: vi.fn() } };

  return { state, runCommandAtPath, guard, event };
};

describe('secret scan push state binding', () => {
  beforeEach(() => {
    handlers.clear();
  });

  it('requires an explicit repository for renderer scans and approvals', async () => {
    const scanPushDiffs = vi.fn().mockResolvedValue(findingsResult);
    const harness = createHarness(scanPushDiffs);

    await expect(handlers.get('git:scanPushSecrets')!(harness.event, { pushArgs: [] })).resolves.toEqual({
      success: false,
      error: 'Repository path is required.',
    });
    await expect(handlers.get('git:approveSecretScanPush')!(harness.event, [], undefined)).resolves.toEqual({ success: false });
    expect(scanPushDiffs).not.toHaveBeenCalled();
    expect(harness.runCommandAtPath).not.toHaveBeenCalled();
  });

  it('rejects a renderer scan when HEAD changes while it is running', async () => {
    let harness!: ReturnType<typeof createHarness>;
    const scanPushDiffs = vi.fn(async () => {
      harness.state.head = '2222222222222222222222222222222222222222';
      return findingsResult;
    });
    harness = createHarness(scanPushDiffs);

    const result = await handlers.get('git:scanPushSecrets')!(harness.event, { repoPath: 'C:/repo', pushArgs: [] });

    expect(result).toEqual({
      success: false,
      error: 'Repository state changed after the secret scan. Run the secret scan again before pushing.',
    });
  });

  it('rejects approval when exact staged index entries changed after the scan', async () => {
    const harness = createHarness(vi.fn().mockResolvedValue(findingsResult));
    await handlers.get('git:scanPushSecrets')!(harness.event, { repoPath: 'C:/repo', pushArgs: ['origin', 'main'] });
    harness.state.index = 'H 100644 bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 0\tapp.ts\0';

    const result = await handlers.get('git:approveSecretScanPush')!(harness.event, ['origin', 'main'], 'C:/repo');

    expect(result).toEqual({ success: false });
  });

  it('invalidates an approved one-shot bypass when remote push configuration changes', async () => {
    const harness = createHarness(vi.fn().mockResolvedValue(findingsResult));
    await handlers.get('git:scanPushSecrets')!(harness.event, { repoPath: 'C:/repo', pushArgs: ['origin', 'main'] });
    await expect(handlers.get('git:approveSecretScanPush')!(harness.event, ['origin', 'main'], 'C:/repo')).resolves.toEqual({ success: true });
    harness.state.remoteUrl = 'https://mirror.example.test/acme/repo.git';

    const result = await harness.guard.requirePushSecretScanApproval(harness.event, ['origin', 'main'], 'C:/repo');

    expect(result).toEqual({
      success: false,
      error: 'Repository state changed after the secret scan. Run the secret scan again before pushing.',
    });
  });

  it('blocks a direct push with findings until the renderer confirms the in-app dialog', async () => {
    const harness = createHarness(vi.fn().mockResolvedValue(findingsResult));

    const result = await harness.guard.requirePushSecretScanApproval(harness.event, [], 'C:/repo');

    expect(result).toEqual({
      success: false,
      error: 'Potential secrets were detected. Confirm the in-app dialog before pushing.',
    });
  });

  it('redacts fingerprint command errors instead of returning embedded credentials', async () => {
    const harness = createHarness(vi.fn().mockResolvedValue(findingsResult));
    harness.runCommandAtPath.mockRejectedValueOnce(new Error('fatal: https://user:plain-secret@example.test/repo.git failed'));

    const result = await harness.guard.requirePushSecretScanApproval(harness.event, [], 'C:/repo');

    expect(result).toEqual({
      success: false,
      error: 'Repository state could not be verified. Run the secret scan again before pushing.',
    });
    expect(JSON.stringify(result)).not.toContain('plain-secret');
  });
});
