import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
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

const parseStatusPath = (line: string): string | null => {
  if (line.length < 3) return null;
  const payload = line.slice(3).trim();
  if (!payload) return null;
  const renameSeparator = payload.lastIndexOf(' -> ');
  const rawPath = renameSeparator >= 0 ? payload.slice(renameSeparator + 4) : payload;
  if (!rawPath.startsWith('"')) return rawPath;
  try {
    return JSON.parse(rawPath) as string;
  } catch {
    return null;
  }
};

export class WorkingTreeService {
  private snapshotInFlight: { repoPath: string; promise: Promise<WorkingTreeSnapshot> } | null = null;
  private latestSnapshot: WorkingTreeSnapshot | null = null;
  private statsCache = new Map<string, WorkingTreeStats>();
  private statsInFlight = new Map<string, Promise<WorkingTreeStats>>();
  private volatileFingerprintGeneration = 0;

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
      const contentFingerprint = await this.getContentFingerprint(repoPath, statusRaw);
      const snapshotId = createHash('sha1')
        .update(repoPath)
        .update('\0')
        .update(statusRaw)
        .update('\0')
        .update(contentFingerprint)
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
        this.gitService.runPollingCommandAtPath(
          snapshot.repoPath,
          ['diff', '--numstat', '--cached'],
          `working-tree-stats:${snapshotId}:staged`,
        ),
        this.gitService.runPollingCommandAtPath(
          snapshot.repoPath,
          ['diff', '--numstat'],
          `working-tree-stats:${snapshotId}:unstaged`,
        ),
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

  private async getContentFingerprint(repoPath: string, statusRaw: string): Promise<string> {
    const paths = new Set<string>();
    for (const line of statusRaw.split(/\r?\n/)) {
      if (!line) continue;
      const filePath = parseStatusPath(line);
      if (!filePath) {
        return `volatile:${++this.volatileFingerprintGeneration}`;
      }
      paths.add(filePath);
    }

    const hash = createHash('sha1');
    const sortedPaths = [...paths].sort();
    const batchSize = 64;
    for (let offset = 0; offset < sortedPaths.length; offset += batchSize) {
      const batch = sortedPaths.slice(offset, offset + batchSize);
      const entries = await Promise.all(batch.map(async (filePath) => {
        try {
          const stat = await fs.promises.stat(path.resolve(repoPath, filePath), { bigint: true });
          return `${filePath}\0${stat.size}\0${stat.mtimeNs}\0${stat.ctimeNs}\0${stat.mode}`;
        } catch {
          return `${filePath}\0missing`;
        }
      }));
      for (const entry of entries) hash.update(entry).update('\0');
    }
    return hash.digest('hex');
  }
}
