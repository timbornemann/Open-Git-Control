import { createHash } from 'crypto';
import type { GitService } from '../../../GitService';
import type { SecretScanResult, SecretScanService } from '../../../SecretScanService';
import type { AppSettings } from '../../../settings';
import { redactGitSensitiveText } from '../../../git/GitErrorFormatter';
import { createJobId } from '../../gitCommandPolicy';
import type { RepoJobRegistry } from '../../repoJobRegistry';
import { repositoryPathKey, requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { emitJobEvent } from '../jobEvents';
import { IpcChannel } from '../../../../src/types/ipcContract';

type SecretScanCommitGuardDeps = {
  gitService: GitService;
  secretScanService: SecretScanService;
  readSettingsWithMigration: () => AppSettings;
  repoJobRegistry: RepoJobRegistry;
};

type CommitScanRecord = {
  repoKey: string;
  stateFingerprint: string;
  senderId: number | null;
  expiresAt: number;
  hasFindings: boolean;
};

type ScanCommitResult = { success: true; data: SecretScanResult } | { success: false; error: string };

export type SecretScanCommitGuard = {
  scanCommitSecrets: (event: any, params: { repoPath?: unknown; recordRendererScan?: boolean }) => Promise<ScanCommitResult>;
  approveSecretScanCommit: (event: any, requestedRepoPath?: unknown) => Promise<{ success: boolean }>;
  requireCommitSecretScanApproval: (event: any, expectedRepoPath: string) => Promise<{ success: false; error: string } | null>;
  clearApprovals: () => void;
};

const senderIdOf = (event: any): number | null => (typeof event?.sender?.id === 'number' ? event.sender.id : null);
const COMMIT_STATE_CHANGED_ERROR = 'Repository state changed after the secret scan. Run the secret scan again before committing.';
const COMMIT_STATE_VERIFICATION_ERROR = 'Repository state could not be verified. Run the secret scan again before committing.';

const readCommitStateFingerprint = async (gitService: GitService, repoPath: string): Promise<string> => {
  try {
    const [head, index] = await Promise.all([
      gitService.runCommandAtPath(repoPath, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=no']),
      gitService.runCommandAtPath(repoPath, ['ls-files', '--stage', '-v', '--full-name', '-z']),
    ]);
    const hash = createHash('sha256');
    hash.update('head', 'utf8');
    hash.update('\0', 'utf8');
    hash.update(head, 'utf8');
    hash.update('\0', 'utf8');
    hash.update('index', 'utf8');
    hash.update('\0', 'utf8');
    hash.update(index, 'utf8');
    return hash.digest('hex');
  } catch {
    throw new Error(COMMIT_STATE_VERIFICATION_ERROR);
  }
};

const emptyScanResult = (strictness: AppSettings['secretScanStrictness']): SecretScanResult => ({
  scanned: false,
  strictness,
  findings: [],
  notes: ['Secret scan before commit is disabled.'],
  stats: { checkedLines: 0, stagedLines: 0, toPushLines: 0, tagLines: 0 },
});

export function registerSecretScanCommitGuard({
  gitService,
  secretScanService,
  readSettingsWithMigration,
  repoJobRegistry,
}: SecretScanCommitGuardDeps): SecretScanCommitGuard {
  let completedRendererScan: CommitScanRecord | null = null;
  let commitApproval: CommitScanRecord | null = null;

  const scanCommitSecrets: SecretScanCommitGuard['scanCommitSecrets'] = async (event, params) => {
    let repoPath: string;
    try {
      repoPath = requireActiveRepositoryPath(params.repoPath, gitService.getRepoPath(), IpcChannel.GitScanCommitSecrets);
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Repository path is required.' };
    }

    const settings = readSettingsWithMigration();
    if (!settings.secretScanBeforeCommitEnabled) {
      return { success: true, data: emptyScanResult(settings.secretScanStrictness) };
    }

    const repoJob = repoJobRegistry.begin(repoPath);
    const jobId = createJobId('security-secret-scan');
    const operation = 'security:secret-scan';
    emitJobEvent(event.sender, {
      id: jobId,
      operation,
      status: 'start',
      message: 'Secret scan started.',
      timestamp: Date.now(),
    });

    try {
      const stateFingerprintBefore = await readCommitStateFingerprint(gitService, repoJob.repoPath);
      const result = await secretScanService.scanStagedDiffs({
        repoPath: repoJob.repoPath,
        strictness: settings.secretScanStrictness,
        allowlistText: settings.secretScanAllowlist,
        signal: repoJob.signal,
        onProgress: (checkedLines) => {
          emitJobEvent(event.sender, {
            id: jobId,
            operation,
            status: 'progress',
            message: `Secret scan checked ${checkedLines} added line(s).`,
            details: { checkedLines },
            timestamp: Date.now(),
          });
        },
      });
      repoJob.ensureActive();
      const stateFingerprintAfter = await readCommitStateFingerprint(gitService, repoJob.repoPath);
      repoJob.ensureActive();
      if (stateFingerprintBefore !== stateFingerprintAfter) {
        throw new Error(COMMIT_STATE_CHANGED_ERROR);
      }

      if (params.recordRendererScan) {
        const record: CommitScanRecord = {
          repoKey: repositoryPathKey(repoJob.repoPath),
          stateFingerprint: stateFingerprintAfter,
          senderId: senderIdOf(event),
          expiresAt: Date.now() + 120_000,
          hasFindings: result.findings.length > 0,
        };
        completedRendererScan = record;
        if (!record.hasFindings) commitApproval = record;
      }

      const fileCount = new Set(result.findings.map((finding) => finding.filePath)).size;
      emitJobEvent(event.sender, {
        id: jobId,
        operation,
        status: 'done',
        message:
          result.findings.length > 0 ? `Secret scan found ${result.findings.length} hit(s) in ${fileCount} file(s).` : 'Secret scan finished with no hits.',
        details: { strictness: result.strictness, findingCount: result.findings.length, filesWithFindings: fileCount, checkedLines: result.stats.checkedLines },
        timestamp: Date.now(),
      });
      return { success: true, data: result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Secret scan failed.';
      const safeError = message === COMMIT_STATE_CHANGED_ERROR || message === COMMIT_STATE_VERIFICATION_ERROR ? message : redactGitSensitiveText(message);
      emitJobEvent(event.sender, { id: jobId, operation, status: 'failed', message: safeError, timestamp: Date.now() });
      return { success: false, error: safeError };
    } finally {
      repoJob.complete();
    }
  };

  const approveSecretScanCommit: SecretScanCommitGuard['approveSecretScanCommit'] = async (event, requestedRepoPath) => {
    let repoPath: string;
    try {
      repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath(), IpcChannel.GitApproveSecretScanCommit);
    } catch {
      return { success: false };
    }
    const scan = completedRendererScan;
    completedRendererScan = null;
    if (!scan || !scan.hasFindings || scan.expiresAt <= Date.now() || scan.senderId !== senderIdOf(event) || scan.repoKey !== repositoryPathKey(repoPath)) {
      return { success: false };
    }
    try {
      const stateFingerprint = await readCommitStateFingerprint(gitService, repoPath);
      requireActiveRepositoryPath(repoPath, gitService.getRepoPath(), IpcChannel.GitApproveSecretScanCommit);
      if (stateFingerprint !== scan.stateFingerprint) return { success: false };
      commitApproval = { ...scan, stateFingerprint };
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  const requireCommitSecretScanApproval: SecretScanCommitGuard['requireCommitSecretScanApproval'] = async (event, expectedRepoPath) => {
    const settings = readSettingsWithMigration();
    if (!settings.secretScanBeforeCommitEnabled) return null;

    const approval = commitApproval;
    commitApproval = null;
    if (approval && approval.expiresAt > Date.now() && approval.senderId === senderIdOf(event) && approval.repoKey === repositoryPathKey(expectedRepoPath)) {
      try {
        const stateFingerprint = await readCommitStateFingerprint(gitService, expectedRepoPath);
        requireActiveRepositoryPath(expectedRepoPath, gitService.getRepoPath(), 'git:commit secret-scan approval');
        if (stateFingerprint === approval.stateFingerprint) return null;
        return { success: false, error: COMMIT_STATE_CHANGED_ERROR };
      } catch {
        return { success: false, error: COMMIT_STATE_VERIFICATION_ERROR };
      }
    }

    const scanResult = await scanCommitSecrets(event, { repoPath: expectedRepoPath, recordRendererScan: false });
    if (!scanResult.success) return scanResult;
    if (scanResult.data.findings.length === 0) return null;
    return { success: false, error: 'Potential secrets were detected. Confirm the in-app dialog before committing.' };
  };

  return {
    scanCommitSecrets,
    approveSecretScanCommit,
    requireCommitSecretScanApproval,
    clearApprovals: () => {
      completedRendererScan = null;
      commitApproval = null;
    },
  };
}
