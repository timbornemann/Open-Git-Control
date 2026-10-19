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
type Preparation = {
  sources: (repo: string, signal: AbortSignal) => Promise<string[]>;
  warmLfs: (repo: string, sources: string[], signal: AbortSignal) => Promise<unknown>;
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
  private completedAt = 0;
  private preparation: Preparation | undefined;
  private activeWork: Promise<void> | undefined;
  private sources: string[] = [];
  private yieldRequested = false;
  private activeCommits: string[] = [];
  private progressKey = '';
  private cursor = 0;

  constructor(private readonly deps: Dependencies) {}

  configure(preparation: Preparation): void {
    this.preparation = preparation;
  }

  setActiveRepository(repoPath: string | null): void {
    this.generation++;
    this.controller?.abort();
    clearTimeout(this.timer);
    this.repoPath = repoPath;
    this.completedKey = '';
    this.progressKey = '';
    this.cursor = 0;
    if (repoPath) this.schedule(IDLE_DELAY_MS);
  }

  /** Finish the current verified checkpoint instead of throwing its results away. */
  async handoff(sources: string[], signal: AbortSignal, outgoingCommits?: string[]): Promise<() => void> {
    this.paused++;
    clearTimeout(this.timer);
    this.yieldRequested = true;
    const usefulCheckpoint =
      outgoingCommits === undefined || (this.activeCommits.length > 0 && this.activeCommits.every((oid) => outgoingCommits.includes(oid)));
    if (!usefulCheckpoint || !sources.length || sources.some((oid) => !this.sources.includes(oid))) this.controller?.abort();
    const abort = () => this.controller?.abort();
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (signal.aborted) abort();
      await this.activeWork;
      signal.throwIfAborted();
    } catch (error) {
      this.paused--;
      if (this.repoPath) this.schedule(OBSERVE_DELAY_MS);
      throw error;
    } finally {
      signal.removeEventListener('abort', abort);
    }
    let resumed = false;
    return () => {
      if (resumed) return;
      resumed = true;
      this.paused--;
      if (this.repoPath) this.schedule(OBSERVE_DELAY_MS);
    };
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
    this.timer = setTimeout(() => {
      const work = this.run();
      this.activeWork = work;
      void work.finally(() => {
        if (this.activeWork === work) this.activeWork = undefined;
      });
    }, delay);
    this.timer.unref?.();
  }

  private async run(): Promise<void> {
    const { gitService, secretScanService, readSettings, allowlistReader } = this.deps;
    const repoPath = this.repoPath;
    if (!repoPath || this.paused || !gitService.runner) return;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.yieldRequested = false;
    this.activeCommits = [];
    const ensureActive = () => {
      controller.signal.throwIfAborted();
      if (generation !== this.generation || physicalPathKey(gitService.getRepoPath() ?? '') !== physicalPathKey(repoPath)) controller.abort();
      controller.signal.throwIfAborted();
    };
    try {
      const settings = readSettings();
      if (!settings.secretScanBeforePushEnabled && !this.preparation) return;
      ensureActive();
      const readOptions = { requestedKind: 'preflight' as const, signal: controller.signal, envOverrides: SECRET_SCAN_HISTORY_ENV };
      const head = (await gitService.runner.run(repoPath, ['rev-parse', '--verify', 'HEAD'], readOptions)).trim();
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)) return;
      this.sources = [...new Set([head, ...((await this.preparation?.sources(repoPath, controller.signal)) ?? [])])];
      const policy = settings.secretScanBeforePushEnabled ? await allowlistReader.prepare(repoPath) : { text: '', version: '' };
      const key = createHash('sha256')
        .update(JSON.stringify([this.sources, settings.secretScanBeforePushEnabled, settings.secretScanStrictness, policy.version]))
        .digest('hex');
      if (this.progressKey !== key) {
        this.progressKey = key;
        this.cursor = 0;
      }
      // Periodically revalidate attributes/configuration and evicted cache entries,
      // even when HEAD is unchanged. Never use this idle marker to authorize push.
      if (this.completedKey === key && Date.now() - this.completedAt < 30_000) return;
      await this.preparation?.warmLfs(repoPath, this.sources.slice(0, 16), controller.signal);
      ensureActive();
      if (!settings.secretScanBeforePushEnabled) {
        this.completedKey = key;
        this.completedAt = Date.now();
        return;
      }
      const commits = (await gitService.runner.runWithInput(repoPath, ['rev-list', '--topo-order', '--stdin'], `${this.sources.join('\n')}\n`, readOptions))
        .trim()
        .split(/\r?\n/)
        .filter(Boolean);
      ensureActive();
      if (!commits.length) {
        this.completedKey = key;
        this.completedAt = Date.now();
        return;
      }
      // Include old local history too: a different endpoint or a selected tag
      // may need commits already published on another remote. New commits come
      // first so even interrupted warm-ups help the next ordinary push.
      const batch = commits.slice(this.cursor, this.cursor + 128);
      const started = Date.now();
      let processed = 0;
      const result = await secretScanService.scanPushDiffs({
        repoPath,
        strictness: settings.secretScanStrictness,
        allowlistText: policy.text,
        revisions: [head],
        preflightCommits: batch,
        background: true,
        preflight: true,
        // Keep speculative CPU/I/O work short. Progress is committed only by
        // the scanner's verified checkpoint callback, then resumed next idle turn.
        shouldYield: () => this.yieldRequested || (processed > 0 && Date.now() - started >= 1000),
        onHistoryBatch: (commits) => {
          this.activeCommits = commits;
        },
        onHistoryBatchComplete: (count) => {
          processed += count;
        },
        signal: controller.signal,
      });
      ensureActive();
      allowlistReader.assertVersion(repoPath, policy.version);
      this.cursor += result.historyScanIncomplete ? processed : batch.length;
      if (this.cursor >= commits.length && !result.historyScanIncomplete) {
        this.completedKey = key;
        this.completedAt = Date.now();
        this.cursor = 0;
      }
    } catch {
      // No toast and no approval: foreground pushes use the normal scan when
      // idle work is interrupted, unavailable or incomplete. Completed cache
      // batches remain useful on the next attempt.
    } finally {
      if (this.controller === controller) {
        this.controller = undefined;
        this.activeCommits = [];
        if (generation === this.generation) this.schedule(OBSERVE_DELAY_MS);
      }
    }
  }
}
