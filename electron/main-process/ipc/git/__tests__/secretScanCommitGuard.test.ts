import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RepoJobRegistry } from '../../../repoJobRegistry';
import { registerSecretScanCommitGuard } from '../secretScanCommitGuard';

type CommitState = {
  allowlist: string;
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
    allowlist: '',
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
    allowlistReader: {
      read: () => ({ repoPath: 'C:/repo', relativePath: '', exists: Boolean(state.allowlist), text: state.allowlist, version: state.allowlist }),
      prepare: async () => ({ repoPath: 'C:/repo', relativePath: '', exists: Boolean(state.allowlist), text: state.allowlist, version: state.allowlist }),
      assertVersion: (_repo: string, version: string) => {
        if (version !== state.allowlist) throw new Error('Secret-scan allowlist changed.');
      },
    },
    secretScanService: { scanStagedDiffs } as any,
    readSettingsWithMigration: vi.fn(() => ({ secretScanBeforeCommitEnabled: true, secretScanStrictness: 'medium', secretScanAllowlist: '' })) as any,
    repoJobRegistry: new RepoJobRegistry(),
  });
  const event = { sender: { id: 7, send: vi.fn() } };
  return { state, runCommandAtPath, guard, event };
};

describe('secret scan commit state binding', () => {
  it('reads repository policy and rejects changes during a scan', async () => {
    let harness: ReturnType<typeof createHarness>;
    const scan = vi.fn(async ({ allowlistText }) => {
      expect(allowlistText).toBe('path:data.ini');
      harness.state.allowlist = 'path:other.ini';
      return { ...findingsResult, findings: [] };
    });
    harness = createHarness(scan);
    harness.state.allowlist = 'path:data.ini';
    expect(await harness.guard.scanCommitSecrets(harness.event, { repoPath: 'C:/repo', recordRendererScan: true })).toMatchObject({ success: false });
    expect(await harness.guard.approveSecretScanCommit(harness.event, 'C:/repo')).toEqual({ success: false });
  });

  it('invalidates both clean and manually approved scans after policy changes', async () => {
    for (const findings of [[], findingsResult.findings]) {
      const harness = createHarness(vi.fn().mockResolvedValue({ ...findingsResult, findings }));
      await harness.guard.scanCommitSecrets(harness.event, { repoPath: 'C:/repo', recordRendererScan: true });
      if (findings.length) expect(await harness.guard.approveSecretScanCommit(harness.event, 'C:/repo')).toEqual({ success: true });
      harness.state.allowlist = 'path:new.ini';
      expect(await harness.guard.requireCommitSecretScanApproval(harness.event, 'C:/repo')).toMatchObject({
        success: false,
        error: expect.stringContaining('changed'),
      });
    }
  });

  it('rejects a late manual approval after a policy edit', async () => {
    const harness = createHarness(vi.fn().mockResolvedValue(findingsResult));
    await harness.guard.scanCommitSecrets(harness.event, { repoPath: 'C:/repo', recordRendererScan: true });
    harness.state.allowlist = 'path:new.ini';
    expect(await harness.guard.approveSecretScanCommit(harness.event, 'C:/repo')).toEqual({ success: false });
  });
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

  it('does not approve an incomplete LFS scan with no reported findings', async () => {
    const harness = createHarness(
      vi.fn().mockResolvedValue({ ...findingsResult, findings: [], historyScanIncomplete: true, notes: ['LFS content is not available locally.'] }),
    );
    const result = await harness.guard.scanCommitSecrets(harness.event, { repoPath: 'C:/repo', recordRendererScan: true });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('could not be fully scanned') });
    expect(await harness.guard.approveSecretScanCommit(harness.event, 'C:/repo')).toEqual({ success: false });
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
