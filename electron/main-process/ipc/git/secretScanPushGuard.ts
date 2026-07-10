import { dialog, ipcMain } from 'electron';
import type { GitService } from '../../../GitService';
import type { SecretScanService } from '../../../SecretScanService';
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

type PushScanScope = {
  destinationRemote: string;
  sourceRevision: string;
  includeTags: boolean;
};

type SecretScanPushApproval = {
  repoKey: string;
  remote: string;
  sourceRevision: string;
  includeTags: boolean;
  senderId: number | null;
  expiresAt: number;
};

export type SecretScanPushGuard = {
  /**
   * For a `push`, returns `null` to allow the push, or an error result to block
   * it. Runs (or bypasses via a bound approval) the secret scan first.
   */
  requirePushSecretScanApproval: (event: any, rawArgs: unknown[]) => Promise<{ success: false; error: string } | null>;
  /** Aborts any in-flight scan, e.g. when the active repository changes. */
  abortActiveScan: () => void;
};

const senderIdOf = (event: any): number | null => {
  const id = event?.sender?.id;
  return typeof id === 'number' ? id : null;
};

/**
 * Derives the push scope (destination remote, the source revision that will be
 * published, and whether tags are pushed) from raw `git push` arguments. The
 * same derivation is used to run the scan and to match a stored approval.
 */
const derivePushScanScope = (rawArgs: unknown[]): PushScanScope => {
  const positionalArgs = rawArgs.filter((arg): arg is string => typeof arg === 'string' && !arg.startsWith('-'));
  const destinationRemote = positionalArgs[0] || '';
  const refspec = positionalArgs.length >= 2 ? positionalArgs[1] : '';
  const sourceRevision = refspec && !refspec.startsWith(':') ? (refspec.split(':', 1)[0] || 'HEAD').replace(/^\+/, '') : destinationRemote ? 'HEAD' : '';
  const includeTags = rawArgs.some((arg) => arg === '--tags');
  return { destinationRemote, sourceRevision, includeTags };
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
   * active repository, destination remote, source revision and tag inclusion)
   * and expires quickly, so an approval for one push cannot silently authorize
   * a different push or a push in another repository.
   */
  let secretScanPushApproval: SecretScanPushApproval | null = null;

  const activeRepoKey = (): string => {
    const activeRepoPath = gitService.getRepoPath();
    return activeRepoPath ? repositoryPathKey(activeRepoPath) : '';
  };

  const scanPushSecrets = async (event: any, params: { includeTags?: unknown; repoPath?: unknown; revisions?: unknown; excludeRemote?: unknown } = {}) => {
    activeSecretScanController?.abort();
    let repoPath: string;
    try {
      repoPath = requireActiveRepositoryPath(params.repoPath, gitService.getRepoPath());
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
      const settings = readSettingsWithMigration();
      const result = await secretScanService.scanPushDiffs({
        repoPath: repoJob.repoPath,
        strictness: settings.secretScanStrictness,
        allowlistText: settings.secretScanAllowlist,
        includeTags: params?.includeTags === true,
        revisions: Array.isArray(params.revisions) ? params.revisions.map((revision) => String(revision || '')).slice(0, 8) : undefined,
        excludeRemote: typeof params.excludeRemote === 'string' ? params.excludeRemote : undefined,
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

      const findingCount = result.findings.length;
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

      return { success: true, data: result };
    } catch (error: any) {
      const cancelled = controller.signal.aborted || error?.name === 'AbortError';
      emitJobEvent(event.sender, {
        id: jobId,
        operation,
        status: cancelled ? 'cancelled' : 'failed',
        message: cancelled ? 'Secret scan cancelled.' : error?.message || 'Secret scan failed.',
        timestamp: Date.now(),
      });
      return { success: false, error: cancelled ? 'Secret scan cancelled.' : error?.message || 'Secret scan failed.' };
    } finally {
      repoJob.complete();
      if (activeSecretScanController === controller) activeSecretScanController = null;
    }
  };

  const requirePushSecretScanApproval: SecretScanPushGuard['requirePushSecretScanApproval'] = async (event, rawArgs) => {
    const settings = readSettingsWithMigration();
    if (!settings?.secretScanBeforePushEnabled) return null;

    const { destinationRemote, sourceRevision, includeTags } = derivePushScanScope(rawArgs);

    // In-app UI already confirmed after its own scan; consume the one-shot
    // bypass only if it was granted for exactly this push (same sender window,
    // active repository, remote, source revision and tag inclusion).
    const approval = secretScanPushApproval;
    secretScanPushApproval = null;
    if (
      approval &&
      Date.now() < approval.expiresAt &&
      approval.senderId === senderIdOf(event) &&
      approval.repoKey === activeRepoKey() &&
      approval.remote === destinationRemote &&
      approval.sourceRevision === sourceRevision &&
      approval.includeTags === includeTags
    ) {
      return null;
    }

    const scanResult = await scanPushSecrets(event, {
      includeTags,
      repoPath: gitService.getRepoPath(),
      revisions: sourceRevision ? [sourceRevision] : undefined,
      excludeRemote: destinationRemote || undefined,
    });
    if (!scanResult.success || !scanResult.data) return scanResult as { success: false; error: string };
    if (scanResult.data.findings.length === 0) return null;

    const findings = scanResult.data.findings;
    const fileCount = new Set(findings.map((finding) => finding.filePath)).size;
    const preview = findings
      .slice(0, 8)
      .map((finding) => `${finding.filePath}:${finding.lineNumber}`)
      .join('\n');
    const confirmation = await dialog.showMessageBox({
      type: 'warning',
      title: 'Potential secrets detected before push',
      message: `${findings.length} potential secret hit(s) were found in ${fileCount} file(s).`,
      detail: `${preview}${findings.length > 8 ? '\n...' : ''}\n\nReview the changes before publishing.`,
      buttons: ['Cancel', 'Push anyway'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (confirmation.response === 1) return null;
    return { success: false, error: 'Push cancelled after secret scan findings.' };
  };

  ipcMain.handle(IpcChannel.GitScanPushSecrets, async (event: any, params: { includeTags?: unknown; repoPath?: unknown } = {}) =>
    scanPushSecrets(event, { includeTags: params.includeTags, repoPath: params.repoPath }),
  );

  ipcMain.handle(IpcChannel.GitApproveSecretScanPush, async (event: any, pushArgs: unknown) => {
    const rawArgs = Array.isArray(pushArgs) ? pushArgs : [];
    const { destinationRemote, sourceRevision, includeTags } = derivePushScanScope(rawArgs);
    secretScanPushApproval = {
      repoKey: activeRepoKey(),
      remote: destinationRemote,
      sourceRevision,
      includeTags,
      senderId: senderIdOf(event),
      expiresAt: Date.now() + 120_000,
    };
    return { success: true };
  });

  ipcMain.handle(IpcChannel.GitCancelSecretScan, async () => {
    const cancelled = Boolean(activeSecretScanController);
    activeSecretScanController?.abort();
    return { success: true, cancelled };
  });

  return {
    requirePushSecretScanApproval,
    abortActiveScan: () => activeSecretScanController?.abort(),
  };
}
