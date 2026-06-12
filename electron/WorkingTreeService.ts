import { createHash } from 'crypto';
import type { GitService } from './GitService';

export type WorkingTreeSnapshot = {
  snapshotId: string;
  repoPath: string;
  statusRaw: string;
  changeCount: number;
  durationMs: number;
  largeMode: boolean;
};

export type WorkingTreeStats = {
  snapshotId: string;
  staged: { files: number; additions: number; deletions: number };
  unstaged: { files: number; additions: number; deletions: number };
};

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
  private statsInFlight = new Map<string, Promise<WorkingTreeStats>>();

  constructor(private readonly gitService: GitService) {}

  async getSnapshot(): Promise<WorkingTreeSnapshot> {
    const repoPath = this.gitService.getRepoPath();
    if (!repoPath) throw new Error('No repository path set.');
    if (this.snapshotInFlight?.repoPath === repoPath) return this.snapshotInFlight.promise;

    const promise = (async () => {
      const startedAt = Date.now();
      const statusRaw = await this.gitService.getStatusPorcelainAtPath(repoPath);
      const durationMs = Date.now() - startedAt;
      const changeCount = statusRaw
        ? statusRaw.split(/\r?\n/).filter((line) => line.length >= 3).length
        : 0;
      const snapshotId = createHash('sha1')
        .update(repoPath)
        .update('\0')
        .update(statusRaw)
        .digest('hex');
      const snapshot: WorkingTreeSnapshot = {
        snapshotId,
        repoPath,
        statusRaw,
        changeCount,
        durationMs,
        largeMode: changeCount >= 250 || durationMs >= 500,
      };
      if (this.gitService.getRepoPath() === repoPath) {
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

  async getStats(snapshotId: string): Promise<WorkingTreeStats> {
    const cached = this.statsCache.get(snapshotId);
    if (cached) return cached;
    const inFlight = this.statsInFlight.get(snapshotId);
    if (inFlight) return inFlight;
    const snapshot = this.latestSnapshot;
    if (!snapshot || snapshot.snapshotId !== snapshotId) {
      throw new Error('Working tree snapshot is stale.');
    }

    const promise = (async () => {
      const [stagedRaw, unstagedRaw] = await Promise.all([
        this.gitService.runCommandAtPath(snapshot.repoPath, ['diff', '--numstat', '--cached']),
        this.gitService.runCommandAtPath(snapshot.repoPath, ['diff', '--numstat']),
      ]);
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
    this.statsInFlight.set(snapshotId, promise);
    try {
      return await promise;
    } finally {
      this.statsInFlight.delete(snapshotId);
    }
  }
}
