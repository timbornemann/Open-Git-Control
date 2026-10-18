import { createHash } from 'crypto';
import * as fs from 'fs';
import type { GitService } from './GitService';
import { parseNulStatus, parseStatusPath, hasStagedChanges, type StatusSample } from './WorkingTreeStatus';
export { parseStatusPath } from './WorkingTreeStatus';
import { toLiteralPathspec } from './git/RepositoryPathSafety';
import { createRepositoryPathResolver } from './git/RepositoryPathSafetyAsync';
import { gitArgumentBatches } from './git/GitArgumentBatches';
import { WorkingTreeStatsRead } from './WorkingTreeStatsRead';

export type WorkingTreeSnapshot = {
  snapshotId: string;
  repoPath: string;
  statusRaw: string;
  changeCount: number;
  durationMs: number;
  largeMode: boolean;
  isBare: boolean;
};

export type WorkingTreeStats = {
  snapshotId: string;
  staged: { files: number; additions: number; deletions: number };
  unstaged: { files: number; additions: number; deletions: number };
};

type StableWorkingTreeState = {
  statusRaw: string;
  statusIdentity: string;
  changeCount: number;
  contentFingerprint: string;
};

const SNAPSHOT_STABILITY_ATTEMPTS = 3;
const staleSnapshotError = (): Error => new Error('Working tree snapshot is stale.');

const parseNumstat = (raw: string) => {
  const stats = { files: 0, additions: 0, deletions: 0 };
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
    if (!match) continue;
    stats.files += 1;
    if (match[1] !== '-') stats.additions += Number(match[1]);
    if (match[2] !== '-') stats.deletions += Number(match[2]);
  }
  return stats;
};

export class WorkingTreeService {
  private snapshotInFlight: { repoPath: string; promise: Promise<WorkingTreeSnapshot> } | null = null;
  private latestSnapshot: WorkingTreeSnapshot | null = null;
  private statsCache = new Map<string, WorkingTreeStats>();
  private statsInFlight = new Map<string, WorkingTreeStatsRead>();
  private statsControllers = new Map<string, AbortController>();
  private volatileFingerprintGeneration = 0;
  private repoGeneration = 0;

  constructor(private readonly gitService: GitService) {}

  setActiveRepo(): void {
    for (const controller of this.statsControllers.values()) controller.abort();
    this.statsControllers.clear();
    this.repoGeneration += 1;
    this.snapshotInFlight = null;
    this.latestSnapshot = null;
    this.statsCache.clear();
    this.statsInFlight.clear();
  }

  async getSnapshot(requestedRepoPath?: string): Promise<WorkingTreeSnapshot> {
    const repoPath = requestedRepoPath || this.gitService.getRepoPath();
    if (!repoPath) throw new Error('No repository path set.');
    if (this.snapshotInFlight?.repoPath === repoPath) return this.snapshotInFlight.promise;
    const repoGeneration = this.repoGeneration;

    const promise = (async () => {
      const startedAt = Date.now();
      const bareChecker = this.gitService as {
        isBareRepositoryAtPathAsync?: (repoPath: string) => Promise<boolean>;
        isBareRepositoryAtPath?: (repoPath: string) => boolean;
        isBareRepository?: () => boolean;
      };
      // Resolve the bare status of THIS snapshot's repository path, not whatever
      // repository happens to be active when the async work runs.
      const isBare =
        typeof bareChecker.isBareRepositoryAtPathAsync === 'function'
          ? await bareChecker.isBareRepositoryAtPathAsync(repoPath)
          : typeof bareChecker.isBareRepositoryAtPath === 'function'
            ? Boolean(bareChecker.isBareRepositoryAtPath(repoPath))
            : typeof bareChecker.isBareRepository === 'function'
              ? Boolean(bareChecker.isBareRepository())
              : false;
      const state = isBare ? { statusRaw: '', statusIdentity: '', changeCount: 0, contentFingerprint: 'bare' } : await this.captureStableState(repoPath);
      const { statusRaw, statusIdentity, changeCount, contentFingerprint } = state;
      const durationMs = Date.now() - startedAt;
      const snapshotId = this.buildSnapshotId(repoPath, statusIdentity, contentFingerprint);
      const snapshot: WorkingTreeSnapshot = {
        snapshotId,
        repoPath,
        statusRaw,
        changeCount,
        durationMs,
        largeMode: changeCount >= 250 || durationMs >= 500,
        isBare,
      };
      if (this.repoGeneration === repoGeneration && this.gitService.getRepoPath() === repoPath) {
        for (const [id, controller] of this.statsControllers) if (id !== snapshotId) controller.abort();
        this.latestSnapshot = snapshot;
      }
      return snapshot;
    })();
    this.snapshotInFlight = { repoPath, promise };

    try {
      return await promise;
    } finally {
      if (this.snapshotInFlight?.promise === promise) {
        this.snapshotInFlight = null;
      }
    }
  }

  async getStats(snapshotId: string, requestedRepoPath?: string, signal?: AbortSignal): Promise<WorkingTreeStats> {
    signal?.throwIfAborted();
    const snapshot = this.latestSnapshot;
    if (!snapshot || snapshot.snapshotId !== snapshotId || (requestedRepoPath && snapshot.repoPath !== requestedRepoPath)) {
      throw staleSnapshotError();
    }
    const cached = this.statsCache.get(snapshotId);
    if (cached) return cached;
    const inFlight = this.statsInFlight.get(snapshotId);
    if (inFlight && !inFlight.controller.signal.aborted) return inFlight.observe(signal);
    const repoGeneration = this.repoGeneration;

    // A bare repository has no working tree, so `git diff --numstat` fails on
    // every poll. Return empty stats instead of repeatedly erroring.
    if (snapshot.isBare) {
      const bareStats: WorkingTreeStats = {
        snapshotId,
        staged: { files: 0, additions: 0, deletions: 0 },
        unstaged: { files: 0, additions: 0, deletions: 0 },
      };
      this.statsCache.set(snapshotId, bareStats);
      return bareStats;
    }

    const controller = new AbortController();
    this.statsControllers.set(snapshotId, controller);
    const readStats = (args: string[], side: string) =>
      typeof this.gitService.runCommandAtPathWithSignal === 'function'
        ? this.gitService.runCommandAtPathWithSignal(snapshot.repoPath, args, controller.signal, 'background')
        : this.gitService.runPollingCommandAtPath(snapshot.repoPath, args, `working-tree-stats:${snapshotId}:${side}`);
    const promise = (async () => {
      const [stagedRaw, unstagedRaw] = await Promise.all([
        readStats(['diff', '--numstat', '--cached'], 'staged'),
        readStats(['diff', '--numstat'], 'unstaged'),
      ]);
      if (this.repoGeneration !== repoGeneration) throw staleSnapshotError();
      controller.signal.throwIfAborted();
      const currentState = await this.captureStableState(snapshot.repoPath, controller.signal);
      const currentSnapshotId = this.buildSnapshotId(snapshot.repoPath, currentState.statusIdentity, currentState.contentFingerprint);
      if (
        this.repoGeneration !== repoGeneration ||
        this.gitService.getRepoPath() !== snapshot.repoPath ||
        this.latestSnapshot?.snapshotId !== snapshotId ||
        currentSnapshotId !== snapshotId
      ) {
        if (this.repoGeneration === repoGeneration && this.latestSnapshot?.snapshotId === snapshotId) {
          this.latestSnapshot = null;
        }
        throw staleSnapshotError();
      }
      controller.signal.throwIfAborted();
      const result: WorkingTreeStats = {
        snapshotId,
        staged: parseNumstat(stagedRaw),
        unstaged: parseNumstat(unstagedRaw),
      };
      this.statsCache.set(snapshotId, result);
      if (this.statsCache.size > 16) {
        const oldest = this.statsCache.keys().next().value;
        if (oldest) this.statsCache.delete(oldest);
      }
      return result;
    })();
    const read = new WorkingTreeStatsRead(promise, controller);
    this.statsInFlight.set(snapshotId, read);
    const finished = () => {
      // A preempted count must not leave its sibling diff consuming a read
      // slot. The scheduler aborts background reads before interactive writes.
      controller.abort();
      if (this.statsControllers.get(snapshotId) === controller) this.statsControllers.delete(snapshotId);
      if (this.statsInFlight.get(snapshotId) === read) {
        this.statsInFlight.delete(snapshotId);
      }
    };
    void promise.then(finished, finished);
    return read.observe(signal);
  }

  private buildSnapshotId(repoPath: string, statusIdentity: string, contentFingerprint: string): string {
    return createHash('sha1').update(repoPath).update('\0').update(statusIdentity).update('\0').update(contentFingerprint).digest('hex');
  }

  /**
   * Status, index and working-tree metadata are separate reads. Sample the
   * complete identity twice and only publish it when both samples agree. This
   * prevents a write between `status` and the index/file fingerprint from
   * producing a snapshot that never existed as one repository state.
   */
  private async captureStableState(repoPath: string, signal?: AbortSignal): Promise<StableWorkingTreeState> {
    for (let attempt = 0; attempt < SNAPSHOT_STABILITY_ATTEMPTS; attempt += 1) {
      signal?.throwIfAborted();
      const statusBefore = await this.getStatusSample(repoPath, signal);
      const fingerprintBefore = await this.getContentFingerprint(repoPath, statusBefore, signal);
      const statusAfter = await this.getStatusSample(repoPath, signal);
      if (statusAfter.identity !== statusBefore.identity) continue;
      const fingerprintAfter = await this.getContentFingerprint(repoPath, statusAfter, signal);
      if (fingerprintAfter === fingerprintBefore) {
        return {
          statusRaw: statusAfter.statusRaw,
          statusIdentity: statusAfter.identity,
          changeCount: statusAfter.changeCount,
          contentFingerprint: fingerprintAfter,
        };
      }
    }

    throw new Error('Working tree changed repeatedly while creating a snapshot. Please retry.');
  }

  private async getStatusSample(repoPath: string, signal?: AbortSignal): Promise<StatusSample> {
    signal?.throwIfAborted();
    const gitCapabilities = this.gitService as GitService & {
      getStatusPorcelainZAtPath?: (path: string, signal?: AbortSignal, kind?: 'background') => Promise<string>;
    };
    if (typeof gitCapabilities.getStatusPorcelainZAtPath === 'function') {
      return parseNulStatus(await gitCapabilities.getStatusPorcelainZAtPath(repoPath, signal, signal ? 'background' : undefined));
    }

    const statusRaw = await this.gitService.getStatusPorcelainAtPath(repoPath);
    const paths: string[] = [];
    for (const line of statusRaw.split(/\r?\n/)) {
      if (!line) continue;
      const filePath = parseStatusPath(line);
      if (!filePath) {
        return {
          statusRaw,
          identity: statusRaw,
          paths: null,
          hasStagedChanges: hasStagedChanges(statusRaw),
          changeCount: statusRaw.split(/\r?\n/).filter((value) => value.length >= 3).length,
        };
      }
      paths.push(filePath);
    }
    return {
      statusRaw,
      identity: statusRaw,
      paths,
      hasStagedChanges: hasStagedChanges(statusRaw),
      changeCount: paths.length,
    };
  }

  private async getContentFingerprint(repoPath: string, status: StatusSample, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    if (!status.paths) return `volatile:${++this.volatileFingerprintGeneration}`;
    const paths = new Set(status.paths);

    const sortedPaths = [...paths].sort();
    const batchSize = 64;
    const hash = createHash('sha1');
    // All path probes must yield, including realpath and the Windows metadata
    // alias checks. A synchronous resolver per file freezes the main process.
    const resolver = await createRepositoryPathResolver(repoPath).catch(() => null);
    if (status.hasStagedChanges) {
      // `--numstat` is not an index identity: two different staged blobs can
      // have identical line counts. Stage records include the exact blob IDs,
      // modes and conflict stages, and therefore also cover unmerged entries.
      let batchIndex = 0;
      for (const batch of gitArgumentBatches(sortedPaths.map((filePath) => toLiteralPathspec(filePath)))) {
        signal?.throwIfAborted();
        const args = ['ls-files', '--stage', '-z', '--', ...batch];
        const stagedEntries =
          signal && typeof this.gitService.runCommandAtPathWithSignal === 'function'
            ? await this.gitService.runCommandAtPathWithSignal(repoPath, args, signal, 'background')
            : await this.gitService.runPollingCommandAtPath(repoPath, args, `working-tree-snapshot:index:${batchIndex++}:${batch.join('\0')}`);
        hash.update('index-stage').update('\0').update(stagedEntries).update('\0');
      }
    }

    for (let offset = 0; offset < sortedPaths.length; offset += batchSize) {
      signal?.throwIfAborted();
      const batch = sortedPaths.slice(offset, offset + batchSize);
      const entries = await Promise.all(
        batch.map(async (filePath) => {
          try {
            if (!resolver) return `${filePath}\0missing`;
            const stat = await fs.promises.stat(await resolver.existing(filePath), { bigint: true });
            return `${filePath}\0${stat.size}\0${stat.mtimeNs}\0${stat.ctimeNs}\0${stat.mode}`;
          } catch {
            return `${filePath}\0missing`;
          }
        }),
      );
      for (const entry of entries) hash.update(entry).update('\0');
    }
    signal?.throwIfAborted();
    return hash.digest('hex');
  }
}
