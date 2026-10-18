import type { GitService } from '../GitService';
import type { SecretScanService } from '../SecretScanService';
import type { AppSettings } from '../settings';
import type { RepositorySecretScanAllowlistReader } from './repositorySecretScanAllowlist';
import { physicalPathKey } from '../git/RepositoryCommonDirectory';
import { SECRET_SCAN_HISTORY_ENV } from '../git/SecretScanHistoryCache';
import { createHash } from 'node:crypto';

type Dependencies = {
  gitService: GitService;
  secretScanService: SecretScanService;
  readSettings: () => AppSettings;
  allowlistReader: RepositorySecretScanAllowlistReader;
};
const IDLE_DELAY_MS = 1500;
const OBSERVE_DELAY_MS = 5000;

/** Offline idle work. A failed/preempted preflight never grants permission to push. */
export class PushSecretScanPreflight {
  private repoPath: string | null = null;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | undefined;
  private completedKey = '';
  private paused = 0;

  constructor(private readonly deps: Dependencies) {}

  setActiveRepository(repoPath: string | null): void {
    this.generation++;
    this.controller?.abort();
    clearTimeout(this.timer);
    this.repoPath = repoPath;
    this.completedKey = '';
    if (repoPath) this.schedule(IDLE_DELAY_MS);
  }

  /** Foreground scanning must not compete with an unfinished idle scan. */
  pause(): () => void {
    this.paused++;
    this.controller?.abort();
    clearTimeout(this.timer);
    let resumed = false;
    return () => {
      if (resumed) return;
      resumed = true;
      this.paused--;
      if (this.repoPath) this.schedule(OBSERVE_DELAY_MS);
    };
  }

  private schedule(delay: number): void {
    clearTimeout(this.timer);
    if (this.paused || !this.repoPath) return;
    this.timer = setTimeout(() => void this.run(), delay);
    this.timer.unref?.();
  }

  private async run(): Promise<void> {
    const { gitService, secretScanService, readSettings, allowlistReader } = this.deps;
    const repoPath = this.repoPath;
    if (!repoPath || this.paused || !gitService.runner) return;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const ensureActive = () => {
      controller.signal.throwIfAborted();
      if (generation !== this.generation || physicalPathKey(gitService.getRepoPath() ?? '') !== physicalPathKey(repoPath)) controller.abort();
      controller.signal.throwIfAborted();
    };
    try {
      const settings = readSettings();
      if (!settings.secretScanBeforePushEnabled) return;
      ensureActive();
      const readOptions = { requestedKind: 'background' as const, signal: controller.signal, envOverrides: SECRET_SCAN_HISTORY_ENV };
      const head = (await gitService.runner.run(repoPath, ['rev-parse', '--verify', 'HEAD'], readOptions)).trim();
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)) return;
      const commits = (await gitService.runner.run(repoPath, ['rev-list', '--reverse', '--topo-order', head, '--not', '--remotes'], readOptions))
        .trim()
        .split(/\r?\n/)
        .filter(Boolean);
      ensureActive();
      const policy = await allowlistReader.prepare(repoPath);
      const key = createHash('sha256')
        .update(JSON.stringify([head, commits, settings.secretScanStrictness, policy.version]))
        .digest('hex');
      if (this.completedKey === key) return;
      if (!commits.length) {
        this.completedKey = key;
        return;
      }
      // Tracking refs only prioritize likely outgoing commits for this warm-up.
      // They never authorize exclusions: the push verifies its actual endpoint
      // scope and scans every cache miss normally, even with stale tracking refs.
      const result = await secretScanService.scanPushDiffs({
        repoPath,
        strictness: settings.secretScanStrictness,
        allowlistText: policy.text,
        revisions: [head],
        preflightCommits: commits,
        background: true,
        signal: controller.signal,
      });
      ensureActive();
      allowlistReader.assertVersion(repoPath, policy.version);
      if (!result.historyScanIncomplete) this.completedKey = key;
    } catch {
      // No toast and no approval: foreground pushes use the normal scan when
      // idle work is interrupted, unavailable or incomplete. Completed cache
      // batches remain useful on the next attempt.
    } finally {
      if (this.controller === controller) {
        this.controller = undefined;
        if (generation === this.generation) this.schedule(OBSERVE_DELAY_MS);
      }
    }
  }
}
