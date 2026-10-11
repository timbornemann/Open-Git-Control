import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { streamJsonlLines } from '../main-process/boundedJsonl';
import type { RepositoryAnalyticsSnapshot } from '../../src/shared/ipc/repositoryAnalytics';
import type { AnalyticsCacheData, CommitRecord, BlobRecord, BlameRecord } from './AnalyticsTypes';
import { assertManagedPath } from '../main-process/storageSafety';
import { recordCacheUse } from '../main-process/managedStorage';
import { writeTextFileAtomically } from '../main-process/atomicFile';
import { canPersistAnalytics } from './analyticsDiskBudget';
import { mayReplaceCache } from '../main-process/cacheReplacement';
import { STORAGE_BUDGETS } from '../../src/shared/ipc/storageMaintenance';
import { cacheFileIdentity } from '../main-process/cacheFileIdentity';
import { isAnalyticsSnapshot } from './analyticsSnapshotFormat';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const oid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{40,64}$/.test(value);
function validCommit(record: CommitRecord): boolean {
  return (
    oid(record?.hash) &&
    Array.isArray(record.parents) &&
    record.parents.every(oid) &&
    typeof record.author?.name === 'string' &&
    typeof record.author.id === 'string' &&
    typeof record.author.email === 'string' &&
    Number.isFinite(record.date) &&
    typeof record.subject === 'string' &&
    Array.isArray(record.changes) &&
    record.changes.every(
      (change) =>
        typeof change.path === 'string' &&
        typeof change.mode === 'string' &&
        typeof change.status === 'string' &&
        typeof change.binary === 'boolean' &&
        !change.path.includes('\0') &&
        oid(change.before) &&
        oid(change.after) &&
        Number.isSafeInteger(change.additions) &&
        change.additions >= 0 &&
        Number.isSafeInteger(change.deletions) &&
        change.deletions >= 0,
    )
  );
}
export class AnalyticsCache {
  readonly directory: string;
  readonly data: AnalyticsCacheData = { commits: new Map(), blobs: new Map(), blame: new Map(), classified: new Set(), snapshot: null };
  private queued: string[] = [];
  private queuedBytes = 0;
  private writable = true;
  private recordsIdentity: string | null = null;
  constructor(
    private readonly root: string,
    repoPath: string,
    context: string,
  ) {
    const physical = fs.realpathSync.native(repoPath);
    this.directory = path.join(root, 'v1', digest(process.platform === 'win32' ? physical.toLowerCase() : physical), digest(context));
  }
  static snapshotPath(root: string, repoPath: string): string {
    const physical = fs.realpathSync.native(repoPath);
    return path.join(root, 'v1', digest(process.platform === 'win32' ? physical.toLowerCase() : physical), 'snapshot.json');
  }
  static readSnapshot(root: string, repoPath: string): RepositoryAnalyticsSnapshot | null {
    try {
      const file = this.snapshotPath(root, repoPath);
      assertManagedPath(root, file);
      if (fs.statSync(file).size > 8 * 1024 * 1024) return null;
      const snapshot = JSON.parse(fs.readFileSync(file, 'utf8')) as RepositoryAnalyticsSnapshot;
      const valid = isAnalyticsSnapshot(snapshot, repoPath);
      if (valid) recordCacheUse(file);
      return valid ? snapshot : null;
    } catch {
      return null;
    }
  }
  async load(): Promise<void> {
    assertManagedPath(this.root, this.directory);
    fs.mkdirSync(this.directory, { recursive: true });
    const file = path.join(this.directory, 'records.jsonl');
    if (!fs.existsSync(file)) return;
    assertManagedPath(this.root, file);
    const originalIdentity = cacheFileIdentity(file);
    recordCacheUse(file);
    try {
      for await (const line of streamJsonlLines(file)) {
        try {
          const entry = JSON.parse(line) as { type: string; value: CommitRecord & BlobRecord & BlameRecord };
          if (!['commit', 'classified', 'blob', 'blame'].includes(entry.type) || 'version' in entry) {
            this.writable = false;
            continue;
          }
          if (entry.type === 'commit' && validCommit(entry.value)) this.data.commits.set(entry.value.hash, entry.value);
          if (entry.type === 'classified' && oid(entry.value?.oid)) this.data.classified.add(entry.value.oid);
          if (
            entry.type === 'blob' &&
            oid(entry.value?.oid) &&
            ['text', 'binary', 'lfs'].includes(entry.value.kind) &&
            Number.isSafeInteger(entry.value.lines) &&
            entry.value.lines >= 0
          )
            this.data.blobs.set(entry.value.oid, entry.value);
          if (
            entry.type === 'blame' &&
            oid(entry.value?.revision) &&
            oid(entry.value.oid) &&
            typeof entry.value.path === 'string' &&
            Array.isArray(entry.value.authors) &&
            entry.value.authors.every(
              (author) =>
                Number.isSafeInteger(author.lines) &&
                author.lines >= 0 &&
                typeof author.id === 'string' &&
                typeof author.name === 'string' &&
                typeof author.email === 'string',
            )
          )
            this.data.blame.set(`${entry.value.revision}\0${entry.value.path}`, entry.value);
        } catch {
          /* An interrupted final record is not a completed calculation. */
        }
      }
    } catch {
      // Calculations remain available while an unreadable or oversized cache stays untouched.
      this.writable = false;
    }
    if (cacheFileIdentity(file) !== originalIdentity) this.writable = false;
    this.recordsIdentity = originalIdentity;
  }
  private canWriteRecords(): boolean {
    const file = path.join(this.directory, 'records.jsonl');
    assertManagedPath(this.root, file);
    if (cacheFileIdentity(file) !== this.recordsIdentity) this.writable = false;
    return this.writable;
  }
  put(type: 'commit', value: CommitRecord): void;
  put(type: 'blob', value: BlobRecord): void;
  put(type: 'blame', value: BlameRecord): void;
  put(type: 'classified', value: { oid: string }): void;
  put(type: string, value: CommitRecord | BlobRecord | BlameRecord | { oid: string }): void {
    if (type === 'commit') this.data.commits.set((value as CommitRecord).hash, value as CommitRecord);
    if (type === 'blob') this.data.blobs.set((value as BlobRecord).oid, value as BlobRecord);
    if (type === 'classified') this.data.classified.add((value as { oid: string }).oid);
    if (type === 'blame') {
      const blame = value as BlameRecord;
      this.data.blame.set(`${blame.revision}\0${blame.path}`, blame);
    }
    const raw = JSON.stringify({ type, value }),
      bytes = Buffer.byteLength(raw);
    if (bytes > 8 * 1024 ** 2) return;
    this.queued.push(raw);
    this.queuedBytes += bytes;
    if (this.queued.length >= 128 || this.queuedBytes >= 1024 ** 2) this.flush();
  }
  flush(): void {
    if (!this.queued.length) return;
    const file = path.join(this.directory, 'records.jsonl');
    const raw = '\n' + this.queued.join('\n') + '\n';
    this.queued = [];
    this.queuedBytes = 0;
    if (!this.canWriteRecords() || !canPersistAnalytics(this.root, file, Buffer.byteLength(raw))) return;
    // Begin with a delimiter, so an interrupted last record never consumes the next valid record.
    fs.appendFileSync(file, raw, { mode: 0o600 });
    this.recordsIdentity = cacheFileIdentity(file);
    recordCacheUse(file);
  }
  saveSnapshot(root: string, snapshot: RepositoryAnalyticsSnapshot): void {
    this.flush();
    const file = AnalyticsCache.snapshotPath(root, snapshot.repoPath);
    this.data.snapshot = snapshot;
    const raw = JSON.stringify(snapshot);
    if (!mayReplaceCache(root, file, (value) => isAnalyticsSnapshot(value, snapshot.repoPath))) return;
    if (Buffer.byteLength(raw) > 8 * 1024 * 1024 || !canPersistAnalytics(root, file, Buffer.byteLength(raw), true)) return;
    writeTextFileAtomically(file, raw, root);
    recordCacheUse(file);
  }
  compact(): void {
    if (!this.canWriteRecords()) return;
    this.flush();
    const records: string[] = [];
    let bytes = 0;
    for (const [type, values] of [
      ['commit', this.data.commits.values()],
      ['blob', this.data.blobs.values()],
      ['blame', this.data.blame.values()],
      ['classified', [...this.data.classified].map((oid) => ({ oid }))],
    ] as const) {
      for (const value of values) {
        const raw = JSON.stringify({ type, value }),
          size = Buffer.byteLength(raw) + 1;
        if (size > 8 * 1024 ** 2 || bytes + size > STORAGE_BUDGETS.analytics / 2) continue;
        records.push(raw);
        bytes += size;
      }
    }
    const file = path.join(this.directory, 'records.jsonl');
    const raw = records.join('\n') + '\n';
    if (canPersistAnalytics(this.root, file, Buffer.byteLength(raw), true)) {
      writeTextFileAtomically(file, raw, this.root);
      this.recordsIdentity = cacheFileIdentity(file);
    }
  }
  discardRecords(): void {
    this.queued = [];
    this.queuedBytes = 0;
    const file = path.join(this.directory, 'records.jsonl');
    assertManagedPath(this.root, file);
    if (!this.canWriteRecords()) return;
    if (fs.existsSync(file)) fs.unlinkSync(file);
    this.recordsIdentity = null;
  }
}
