import { createHash } from 'crypto';
import * as fs from 'fs';
import type { GitService } from './GitService';
import { resolveExistingRepositoryPath } from './git/RepositoryPathSafety';

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

const decodeQuotedGitPath = (rawToken: string): string | null => {
  if (!(rawToken.startsWith('"') && rawToken.endsWith('"'))) return rawToken;

  const escaped = rawToken.slice(1, -1);
  let output = '';
  let octets: number[] = [];

  const flushOctets = () => {
    if (octets.length === 0) return;
    output += Buffer.from(octets).toString('utf8');
    octets = [];
  };

  for (let i = 0; i < escaped.length; i += 1) {
    const char = escaped[i];
    if (char !== '\\') {
      flushOctets();
      output += char;
      continue;
    }

    const next = escaped[i + 1];
    if (!next) {
      flushOctets();
      output += '\\';
      continue;
    }

    if (/[0-7]/.test(next)) {
      let octal = next;
      let consumedDigits = 1;
      while (consumedDigits < 3 && i + 1 + consumedDigits < escaped.length && /[0-7]/.test(escaped[i + 1 + consumedDigits])) {
        octal += escaped[i + 1 + consumedDigits];
        consumedDigits += 1;
      }
      octets.push(parseInt(octal, 8));
      i += consumedDigits;
      continue;
    }

    flushOctets();
    const unescapedMap: Record<string, string> = {
      a: '\x07',
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
      '\\': '\\',
      '"': '"',
    };
    output += unescapedMap[next] ?? next;
    i += 1;
  }

  flushOctets();
  return output;
};

const parseStatusPath = (line: string): string | null => {
  if (line.length < 3) return null;
  const payload = line.slice(3).trim();
  if (!payload) return null;
  const renameSeparator = payload.lastIndexOf(' -> ');
  const rawPath = renameSeparator >= 0 ? payload.slice(renameSeparator + 4) : payload;
  return decodeQuotedGitPath(rawPath);
};

const hasStagedChanges = (statusRaw: string): boolean => {
  for (const line of statusRaw.split(/\r?\n/)) {
    if (!line || line.length < 2) continue;
    const indexStatus = line[0];
    if (indexStatus !== ' ' && indexStatus !== '?' && indexStatus !== '!') {
      return true;
    }
  }
  return false;
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
      const isBare =
        typeof (this.gitService as { isBareRepository?: () => boolean }).isBareRepository === 'function'
          ? Boolean((this.gitService as { isBareRepository: () => boolean }).isBareRepository())
          : false;
      const statusRaw = isBare ? '' : await this.gitService.getStatusPorcelainAtPath(repoPath);
      const durationMs = Date.now() - startedAt;
      const changeCount = statusRaw ? statusRaw.split(/\r?\n/).filter((line) => line.length >= 3).length : 0;
      const contentFingerprint = isBare ? 'bare' : await this.getContentFingerprint(repoPath, statusRaw);
      const snapshotId = createHash('sha1').update(repoPath).update('\0').update(statusRaw).update('\0').update(contentFingerprint).digest('hex');
      const snapshot: WorkingTreeSnapshot = {
        snapshotId,
        repoPath,
        statusRaw,
        changeCount,
        durationMs,
        largeMode: changeCount >= 250 || durationMs >= 500,
        isBare,
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
        this.gitService.runPollingCommandAtPath(snapshot.repoPath, ['diff', '--numstat', '--cached'], `working-tree-stats:${snapshotId}:staged`),
        this.gitService.runPollingCommandAtPath(snapshot.repoPath, ['diff', '--numstat'], `working-tree-stats:${snapshotId}:unstaged`),
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
    if (hasStagedChanges(statusRaw)) {
      const stagedNumstat = await this.gitService.runPollingCommandAtPath(repoPath, ['diff', '--numstat', '--cached'], 'working-tree-snapshot:staged-numstat');
      hash.update('staged-numstat').update('\0').update(stagedNumstat).update('\0');
    }

    const sortedPaths = [...paths].sort();
    const batchSize = 64;
    for (let offset = 0; offset < sortedPaths.length; offset += batchSize) {
      const batch = sortedPaths.slice(offset, offset + batchSize);
      const entries = await Promise.all(
        batch.map(async (filePath) => {
          try {
            const stat = await fs.promises.stat(resolveExistingRepositoryPath(repoPath, filePath), { bigint: true });
            return `${filePath}\0${stat.size}\0${stat.mtimeNs}\0${stat.ctimeNs}\0${stat.mode}`;
          } catch {
            return `${filePath}\0missing`;
          }
        }),
      );
      for (const entry of entries) hash.update(entry).update('\0');
    }
    return hash.digest('hex');
  }
}
