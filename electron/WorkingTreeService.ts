import { createHash } from 'crypto';
import * as fs from 'fs';
import type { GitService } from './GitService';
import { resolveExistingRepositoryPath, toLiteralPathspec } from './git/RepositoryPathSafety';

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

type StatusSample = {
  statusRaw: string;
  identity: string;
  paths: string[] | null;
  hasStagedChanges: boolean;
  changeCount: number;
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

export const parseStatusPath = (line: string): string | null => {
  if (line.length < 3) return null;
  const statusCode = line.slice(0, 2);
  const payload = line.slice(3);
  if (!payload) return null;
  let rawPath = payload;
  if (statusCode.includes('R') || statusCode.includes('C')) {
    let quoted = false;
    let escaped = false;
    let renameSeparator = -1;
    for (let index = 0; index <= payload.length - 4; index += 1) {
      const char = payload[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (quoted && char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        quoted = !quoted;
        continue;
      }
      if (!quoted && renameSeparator < 0 && payload.slice(index, index + 4) === ' -> ') renameSeparator = index;
    }
    if (renameSeparator >= 0) rawPath = payload.slice(renameSeparator + 4);
  }
  return decodeQuotedGitPath(rawPath);
};

const quoteStatusPath = (filePath: string, force = false): string => {
  const needsQuoting = [...filePath].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 0x20 || codePoint === 0x7f || character === '"' || character === '\\';
  });
  if (!force && !needsQuoting) return filePath;
  const escapes: Record<string, string> = {
    '\x07': '\\a',
    '\b': '\\b',
    '\f': '\\f',
    '\n': '\\n',
    '\r': '\\r',
    '\t': '\\t',
    '\x0b': '\\v',
    '"': '\\"',
    '\\': '\\\\',
  };
  let encoded = '"';
  for (const character of filePath) {
    const escaped = escapes[character];
    if (escaped) {
      encoded += escaped;
    } else if (character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f) {
      for (const byte of Buffer.from(character, 'utf8')) encoded += `\\${byte.toString(8).padStart(3, '0')}`;
    } else {
      encoded += character;
    }
  }
  return `${encoded}"`;
};

const parseNulStatus = (statusOutput: string): StatusSample => {
  const rawRecords = statusOutput.split('\0');
  const displayLines: string[] = [];
  const paths: string[] = [];
  let staged = false;

  for (let index = 0; index < rawRecords.length; index += 1) {
    const record = rawRecords[index];
    if (!record || record.length < 3) continue;
    const code = record.slice(0, 2);
    const targetPath = record.slice(3);
    if (!targetPath) continue;
    const isRenameOrCopy = code.includes('R') || code.includes('C');
    const sourcePath = isRenameOrCopy ? rawRecords[index + 1] : undefined;
    if (isRenameOrCopy && index + 1 < rawRecords.length) index += 1;
    paths.push(targetPath);
    if (code[0] !== ' ' && code[0] !== '?' && code[0] !== '!') staged = true;
    const displayPath = sourcePath ? `${quoteStatusPath(sourcePath, true)} -> ${quoteStatusPath(targetPath, true)}` : quoteStatusPath(targetPath);
    displayLines.push(`${code} ${displayPath}`);
  }

  return {
    statusRaw: displayLines.join('\n'),
    identity: statusOutput,
    paths,
    hasStagedChanges: staged,
    changeCount: displayLines.length,
  };
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
  private repoGeneration = 0;

  constructor(private readonly gitService: GitService) {}

  setActiveRepo(): void {
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
        isBareRepositoryAtPath?: (repoPath: string) => boolean;
        isBareRepository?: () => boolean;
      };
      // Resolve the bare status of THIS snapshot's repository path, not whatever
      // repository happens to be active when the async work runs.
      const isBare =
        typeof bareChecker.isBareRepositoryAtPath === 'function'
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

  async getStats(snapshotId: string, requestedRepoPath?: string): Promise<WorkingTreeStats> {
    const snapshot = this.latestSnapshot;
    if (!snapshot || snapshot.snapshotId !== snapshotId || (requestedRepoPath && snapshot.repoPath !== requestedRepoPath)) {
      throw staleSnapshotError();
    }
    const cached = this.statsCache.get(snapshotId);
    if (cached) return cached;
    const inFlight = this.statsInFlight.get(snapshotId);
    if (inFlight) return inFlight;
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

    const promise = (async () => {
      const [stagedRaw, unstagedRaw] = await Promise.all([
        this.gitService.runPollingCommandAtPath(snapshot.repoPath, ['diff', '--numstat', '--cached'], `working-tree-stats:${snapshotId}:staged`),
        this.gitService.runPollingCommandAtPath(snapshot.repoPath, ['diff', '--numstat'], `working-tree-stats:${snapshotId}:unstaged`),
      ]);
      const currentState = await this.captureStableState(snapshot.repoPath);
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
      if (this.statsInFlight.get(snapshotId) === promise) {
        this.statsInFlight.delete(snapshotId);
      }
    }
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
  private async captureStableState(repoPath: string): Promise<StableWorkingTreeState> {
    for (let attempt = 0; attempt < SNAPSHOT_STABILITY_ATTEMPTS; attempt += 1) {
      const statusBefore = await this.getStatusSample(repoPath);
      const fingerprintBefore = await this.getContentFingerprint(repoPath, statusBefore);
      const statusAfter = await this.getStatusSample(repoPath);
      if (statusAfter.identity !== statusBefore.identity) continue;
      const fingerprintAfter = await this.getContentFingerprint(repoPath, statusAfter);
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

  private async getStatusSample(repoPath: string): Promise<StatusSample> {
    const gitCapabilities = this.gitService as GitService & {
      getStatusPorcelainZAtPath?: (path: string) => Promise<string>;
    };
    if (typeof gitCapabilities.getStatusPorcelainZAtPath === 'function') {
      return parseNulStatus(await gitCapabilities.getStatusPorcelainZAtPath(repoPath));
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

  private async getContentFingerprint(repoPath: string, status: StatusSample): Promise<string> {
    if (!status.paths) return `volatile:${++this.volatileFingerprintGeneration}`;
    const paths = new Set(status.paths);

    const sortedPaths = [...paths].sort();
    const batchSize = 64;
    const hash = createHash('sha1');
    if (status.hasStagedChanges) {
      // `--numstat` is not an index identity: two different staged blobs can
      // have identical line counts. Stage records include the exact blob IDs,
      // modes and conflict stages, and therefore also cover unmerged entries.
      for (let offset = 0; offset < sortedPaths.length; offset += batchSize) {
        const batch = sortedPaths.slice(offset, offset + batchSize);
        const stagedEntries = await this.gitService.runPollingCommandAtPath(
          repoPath,
          ['ls-files', '--stage', '-z', '--', ...batch.map((filePath) => toLiteralPathspec(filePath))],
          `working-tree-snapshot:index:${offset}:${batch.join('\0')}`,
        );
        hash.update('index-stage').update('\0').update(stagedEntries).update('\0');
      }
    }

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
