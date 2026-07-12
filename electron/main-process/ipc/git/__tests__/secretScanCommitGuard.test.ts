import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RepoJobRegistry } from '../../../repoJobRegistry';
import { registerSecretScanCommitGuard } from '../secretScanCommitGuard';

type CommitState = {
  head: string;
  index: string;
};

const findingsResult = {
  scanned: true,
  strictness: 'medium',
  findings: [{ filePath: 'data.ini', lineNumber: 1, contextLine: '[REDACTED_SECRET]' }],
  notes: [],
  stats: { checkedLines: 1, stagedLines: 1, toPushLines: 0, tagLines: 0 },
};

const createHarness = (scanStagedDiffs: ReturnType<typeof vi.fn>) => {
  const state: CommitState = {
    head: '1111111111111111111111111111111111111111',
    index: 'H 100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 0\tdata.ini\0',
  };
  const runCommandAtPath = vi.fn(async (_repoPath: string, args: string[]) => {
    if (args[0] === 'status') return `# branch.oid ${state.head}\0# branch.head main\0`;
    if (args[0] === 'ls-files') return state.index;
    return '';
  });
  const gitService = {
    getRepoPath: vi.fn(() => 'C:/repo'),
    runCommandAtPath,
  } as any;
  const guard = registerSecretScanCommitGuard({
    gitService,
    secretScanService: { scanStagedDiffs } as any,
    readSettingsWithMigration: vi.fn(() => ({ secretScanBeforeCommitEnabled: true, secretScanStrictness: 'medium', secretScanAllowlist: '' })) as any,
    repoJobRegistry: new RepoJobRegistry(),
  });
  const event = { sender: { id: 7, send: vi.fn() } };
  return { state, runCommandAtPath, guard, event };
};

describe('secret scan commit state binding', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('requires an explicit in-app approval for findings', async () => {
    const harness = createHarness(vi.fn().mockResolvedValue(findingsResult));

    await expect(harness.guard.requireCommitSecretScanApproval(harness.event, 'C:/repo')).resolves.toEqual({
      success: false,
      error: 'Potential secrets were detected. Confirm the in-app dialog before committing.',
    });
  });

  it('rejects an approval if staged index entries changed after the scan', async () => {
    const harness = createHarness(vi.fn().mockResolvedValue(findingsResult));
    await expect(harness.guard.scanCommitSecrets(harness.event, { repoPath: 'C:/repo', recordRendererScan: true })).resolves.toEqual(
      expect.objectContaining({ success: true }),
    );
    harness.state.index = 'H 100644 bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 0\tdata.ini\0';

    await expect(harness.guard.approveSecretScanCommit(harness.event, 'C:/repo')).resolves.toEqual({ success: false });
  });

  it('consumes a matching one-shot approval', async () => {
    const harness = createHarness(vi.fn().mockResolvedValue(findingsResult));
    await harness.guard.scanCommitSecrets(harness.event, { repoPath: 'C:/repo', recordRendererScan: true });
    await expect(harness.guard.approveSecretScanCommit(harness.event, 'C:/repo')).resolves.toEqual({ success: true });

    await expect(harness.guard.requireCommitSecretScanApproval(harness.event, 'C:/repo')).resolves.toBeNull();
    await expect(harness.guard.requireCommitSecretScanApproval(harness.event, 'C:/repo')).resolves.toEqual({
      success: false,
      error: 'Potential secrets were detected. Confirm the in-app dialog before committing.',
    });
  });
});
