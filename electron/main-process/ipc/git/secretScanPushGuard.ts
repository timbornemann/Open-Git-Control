import { createHash } from 'crypto';
import { ipcMain } from 'electron';
import type { GitService } from '../../../GitService';
import type { SecretScanService } from '../../../SecretScanService';
import { redactGitSensitiveText } from '../../../git/GitErrorFormatter';
import type { AppSettings } from '../../../settings';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { createJobId } from '../../gitCommandPolicy';
import type { RepoJobRegistry } from '../../repoJobRegistry';
import { repositoryPathKey, requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { emitJobEvent } from '../jobEvents';

type SecretScanPushGuardDeps = {
  gitService: GitService;
  secretScanService: SecretScanService;
  readSettingsWithMigration: () => AppSettings;
  repoJobRegistry: RepoJobRegistry;
};

type SecretScanPushApproval = {
  repoKey: string;
  argsKey: string;
  stateFingerprint: string;
  senderId: number | null;
  expiresAt: number;
};

type CompletedRendererScan = SecretScanPushApproval & { hasFindings: boolean };

export type SecretScanPushGuard = {
  /**
   * For a `push`, returns `null` to allow the push, or an error result to block
   * it. Runs (or bypasses via a bound approval) the secret scan first.
   */
  requirePushSecretScanApproval: (event: any, rawArgs: unknown[], expectedRepoPath: string) => Promise<{ success: false; error: string } | null>;
  /** Aborts any in-flight scan, e.g. when the active repository changes. */
  abortActiveScan: () => void;
};

const senderIdOf = (event: any): number | null => {
  const id = event?.sender?.id;
  return typeof id === 'number' ? id : null;
};

const normalizePushArgs = (rawArgs: unknown[]): string[] => rawArgs.filter((arg): arg is string => typeof arg === 'string');
const pushArgsKey = (rawArgs: unknown[]): string =>
  createHash('sha256')
    .update(JSON.stringify(normalizePushArgs(rawArgs)), 'utf8')
    .digest('hex');
const PUSH_STATE_CHANGED_ERROR = 'Repository state changed after the secret scan. Run the secret scan again before pushing.';
const PUSH_STATE_VERIFICATION_ERROR = 'Repository state could not be verified. Run the secret scan again before pushing.';

const relevantPushConfig = (rawConfig: string): string => {
  const fields = rawConfig.split('\0');
  const relevant: string[] = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const key = fields[index];
    const value = fields[index + 1];
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.startsWith('push.') || normalizedKey.startsWith('remote.') || normalizedKey.startsWith('branch.') || normalizedKey.startsWith('url.')) {
      relevant.push(key, value);
    }
  }
  return relevant.join('\0');
};

/**
 * Captures everything that can change which objects and destinations a push
 * publishes. Only the SHA-256 digest is retained; remote URLs or other
 * potentially sensitive configuration values never leave this function.
 */
const readPushStateFingerprint = async (gitService: GitService, repoPath: string): Promise<string> => {
  try {
    const head = await gitService.runCommandAtPath(repoPath, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=no']);
    const index = await gitService.runCommandAtPath(repoPath, ['ls-files', '--stage', '-v', '--full-name', '-z']);
    const refs = await gitService.runCommandAtPath(repoPath, ['for-each-ref', '--format=%(refname)%00%(objectname)%00%(symref)%00']);
    const config = relevantPushConfig(await gitService.runCommandAtPath(repoPath, ['config', '--null', '--list']));

    const hash = createHash('sha256');
    for (const [label, value] of [
      ['head', head],
      ['index', index],
      ['refs', refs],
      ['config', config],
    ] as const) {
      hash.update(label, 'utf8');
      hash.update('\0', 'utf8');
      hash.update(value, 'utf8');
      hash.update('\0', 'utf8');
    }
    return hash.digest('hex');
  } catch {
    // Git/config diagnostics can contain credentials. Never echo them here.
    throw new Error(PUSH_STATE_VERIFICATION_ERROR);
  }
};

export function registerSecretScanPushGuard({
  gitService,
  secretScanService,
  readSettingsWithMigration,
  repoJobRegistry,
}: SecretScanPushGuardDeps): SecretScanPushGuard {
  let activeSecretScanController: AbortController | null = null;
  /**
   * One-shot bypass after the in-app secret-scan dialog confirmed "push anyway".
   * The approval is bound to the exact push it was granted for (sender window,
   * active repository, arguments, HEAD, index, refs and push configuration) and
   * expires quickly, so an approval for one push cannot silently authorize a
   * different push or a push in another repository.
   */
  let secretScanPushApproval: SecretScanPushApproval | null = null;
  let completedRendererScan: CompletedRendererScan | null = null;

  const activeRepoKey = (): string => {
    const activeRepoPath = gitService.getRepoPath();
    return activeRepoPath ? repositoryPathKey(activeRepoPath) : '';
  };

  const scanPushSecrets = async (
    event: any,
    params: { includeTags?: unknown; repoPath?: unknown; revisions?: unknown; excludeRemote?: unknown; pushArgs?: unknown; recordRendererScan?: boolean } = {},
  ) => {
    activeSecretScanController?.abort();
    if (params.recordRendererScan) {
      completedRendererScan = null;
      secretScanPushApproval = null;
    }
    let repoPath: string;
    try {
      repoPath = requireActiveRepositoryPath(params.repoPath, gitService.getRepoPath(), IpcChannel.GitScanPushSecrets);
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Repository path is required.' };
    }
    const repoJob = repoJobRegistry.begin(repoPath);
    const controller = new AbortController();
    repoJob.signal.addEventListener('abort', () => controller.abort(), { once: true });
    activeSecretScanController = controller;
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
      const bindsPushState = Array.isArray(params.pushArgs);
      const stateFingerprintBefore = bindsPushState ? await readPushStateFingerprint(gitService, repoJob.repoPath) : null;
      const settings = readSettingsWithMigration();
      const result = await secretScanService.scanPushDiffs({
        repoPath: repoJob.repoPath,
        strictness: settings.secretScanStrictness,
        allowlistText: settings.secretScanAllowlist,
        includeTags: params?.includeTags === true,
        revisions: Array.isArray(params.revisions) ? params.revisions.map((revision) => String(revision || '')).slice(0, 8) : undefined,
        excludeRemote: typeof params.excludeRemote === 'string' ? params.excludeRemote : undefined,
        pushArgs: Array.isArray(params.pushArgs) ? normalizePushArgs(params.pushArgs) : undefined,
        signal: controller.signal,
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

      const stateFingerprintAfter = bindsPushState ? await readPushStateFingerprint(gitService, repoJob.repoPath) : null;
      repoJob.ensureActive();
      if (stateFingerprintBefore !== stateFingerprintAfter) {
        throw new Error(PUSH_STATE_CHANGED_ERROR);
      }

      const findingCount = result.findings.length;
      if (params.recordRendererScan && Array.isArray(params.pushArgs) && stateFingerprintAfter) {
        const scanRecord: CompletedRendererScan = {
          repoKey: repositoryPathKey(repoJob.repoPath),
          argsKey: pushArgsKey(params.pushArgs),
          stateFingerprint: stateFingerprintAfter,
          senderId: senderIdOf(event),
          expiresAt: Date.now() + 120_000,
          hasFindings: findingCount > 0,
        };
        completedRendererScan = scanRecord;
        if (!scanRecord.hasFindings) secretScanPushApproval = scanRecord;
      }
      const filesWithFindings = new Set(result.findings.map((item) => item.filePath)).size;
      emitJobEvent(event.sender, {
        id: jobId,
        operation,
        status: 'done',
        message: findingCount > 0 ? `Secret scan found ${findingCount} hit(s) in ${filesWithFindings} file(s).` : 'Secret scan finished with no hits.',
        details: {
          strictness: result.strictness,
          findingCount,
          filesWithFindings,
          checkedLines: result.stats.checkedLines,
          stagedLines: result.stats.stagedLines,
          toPushLines: result.stats.toPushLines,
          tagLines: result.stats.tagLines,
          notes: result.notes,
        },
        timestamp: Date.now(),
      });

      return { success: true as const, data: result, stateFingerprint: stateFingerprintAfter };
    } catch (error: any) {
      const cancelled = controller.signal.aborted || error?.name === 'AbortError';
      const safeError =
        error?.message === PUSH_STATE_CHANGED_ERROR || error?.message === PUSH_STATE_VERIFICATION_ERROR
          ? error.message
          : cancelled
            ? 'Secret scan cancelled.'
            : redactGitSensitiveText(error?.message || 'Secret scan failed.');
      emitJobEvent(event.sender, {
        id: jobId,
        operation,
        status: cancelled ? 'cancelled' : 'failed',
        message: safeError,
        timestamp: Date.now(),
      });
      return { success: false as const, error: safeError };
    } finally {
      repoJob.complete();
      if (activeSecretScanController === controller) activeSecretScanController = null;
    }
  };

  const requirePushSecretScanApproval: SecretScanPushGuard['requirePushSecretScanApproval'] = async (event, rawArgs, expectedRepoPath) => {
    const settings = readSettingsWithMigration();
    if (!settings?.secretScanBeforePushEnabled) return null;

    const argsKey = pushArgsKey(rawArgs);
    const expectedRepoKey = repositoryPathKey(expectedRepoPath);

    // In-app UI already confirmed after its own scan; consume the one-shot
    // bypass only if it was granted for exactly this push (same sender window,
    // active repository, arguments and repository-state fingerprint).
    const approval = secretScanPushApproval;
    secretScanPushApproval = null;
    if (
      approval &&
      Date.now() < approval.expiresAt &&
      approval.senderId === senderIdOf(event) &&
      approval.repoKey === expectedRepoKey &&
      approval.repoKey === activeRepoKey() &&
      approval.argsKey === argsKey
    ) {
      try {
        const currentFingerprint = await readPushStateFingerprint(gitService, expectedRepoPath);
        requireActiveRepositoryPath(expectedRepoPath, gitService.getRepoPath(), 'git:command push secret-scan approval');
        if (currentFingerprint === approval.stateFingerprint) return null;
        return { success: false, error: PUSH_STATE_CHANGED_ERROR };
      } catch {
        return { success: false, error: PUSH_STATE_VERIFICATION_ERROR };
      }
    }

    const scanResult = await scanPushSecrets(event, {
      includeTags: rawArgs.some((arg) => arg === '--tags' || arg === '--follow-tags'),
      repoPath: expectedRepoPath,
      pushArgs: rawArgs,
    });
    if (!scanResult.success || !scanResult.data) return scanResult as { success: false; error: string };
    if (scanResult.data.findings.length === 0) return null;

    try {
      requireActiveRepositoryPath(expectedRepoPath, gitService.getRepoPath(), 'git:command push secret-scan approval');
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Requested repository is not the active repository.' };
    }

    return { success: false, error: 'Potential secrets were detected. Confirm the in-app dialog before pushing.' };
  };

  ipcMain.handle(IpcChannel.GitScanPushSecrets, async (event: any, params: { includeTags?: unknown; repoPath?: unknown; pushArgs?: unknown } = {}) => {
    if (typeof params.repoPath !== 'string' || !params.repoPath.trim()) {
      return { success: false, error: 'Repository path is required.' };
    }
    const result = await scanPushSecrets(event, {
      includeTags: params.includeTags,
      repoPath: params.repoPath,
      pushArgs: params.pushArgs,
      recordRendererScan: true,
    });
    return result.success ? { success: true, data: result.data } : result;
  });

  ipcMain.handle(IpcChannel.GitApproveSecretScanPush, async (event: any, pushArgs: unknown, requestedRepoPath?: unknown) => {
    if (typeof requestedRepoPath !== 'string' || !requestedRepoPath.trim()) {
      return { success: false };
    }
    let repoPath: string;
    try {
      repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath(), IpcChannel.GitApproveSecretScanPush);
    } catch {
      return { success: false };
    }
    const rawArgs = Array.isArray(pushArgs) ? pushArgs : [];
    const scan = completedRendererScan;
    completedRendererScan = null;
    if (
      !scan ||
      !scan.hasFindings ||
      scan.expiresAt <= Date.now() ||
      scan.senderId !== senderIdOf(event) ||
      scan.repoKey !== repositoryPathKey(repoPath) ||
      scan.argsKey !== pushArgsKey(rawArgs)
    ) {
      return { success: false };
    }
    let stateFingerprint: string;
    try {
      stateFingerprint = await readPushStateFingerprint(gitService, repoPath);
      requireActiveRepositoryPath(repoPath, gitService.getRepoPath(), IpcChannel.GitApproveSecretScanPush);
    } catch {
      return { success: false };
    }
    if (stateFingerprint !== scan.stateFingerprint) return { success: false };
    secretScanPushApproval = {
      repoKey: repositoryPathKey(repoPath),
      argsKey: pushArgsKey(rawArgs),
      stateFingerprint,
      senderId: senderIdOf(event),
      expiresAt: Date.now() + 120_000,
    };
    return { success: true };
  });

  ipcMain.handle(IpcChannel.GitCancelSecretScan, async (_event: unknown, requestedRepoPath?: unknown) => {
    if (typeof requestedRepoPath !== 'string' || !requestedRepoPath.trim()) {
      return { success: false, cancelled: false, error: 'Repository path is required.' };
    }
    try {
      requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath(), IpcChannel.GitCancelSecretScan);
    } catch (error: unknown) {
      return {
        success: false,
        cancelled: false,
        error: error instanceof Error ? error.message : 'Requested repository is not the active repository.',
      };
    }
    const cancelled = Boolean(activeSecretScanController);
    activeSecretScanController?.abort();
    return { success: true, cancelled };
  });

  return {
    requirePushSecretScanApproval,
    abortActiveScan: () => {
      completedRendererScan = null;
      secretScanPushApproval = null;
      activeSecretScanController?.abort();
    },
  };
}
