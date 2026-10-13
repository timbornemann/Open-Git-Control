import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { setImmediate } from 'node:timers/promises';
import { streamJsonlLines } from '../main-process/boundedJsonl';
import type { RepositoryAnalyticsSnapshot } from '../../src/shared/ipc/repositoryAnalytics';
import type { AnalyticsCacheData, CommitRecord, BlobRecord, BlameRecord } from './AnalyticsTypes';
import { assertManagedPathAsync, readStorageJsonAsync } from '../main-process/storageSafety';
import { recordCacheUse } from '../main-process/managedStorage';
import { writeTextFileAtomicallyAsync } from '../main-process/atomicFile';
import { appendOwnedCacheFile } from '../main-process/appendOwnedCacheFile';
import { canPersistAnalytics } from './analyticsDiskBudget';
import { mayReplaceCacheAsync } from '../main-process/cacheReplacement';
import { STORAGE_BUDGETS } from '../../src/shared/ipc/storageMaintenance';
import { cacheFileIdentityAsync } from '../main-process/cacheFileIdentity';
import { isAnalyticsSnapshot } from './analyticsSnapshotFormat';
import { serializeAnalyticsCacheWrite } from './analyticsCacheWrites';

const nativeRealpath = promisify(fs.realpath.native);
const snapshotForPhysicalPath = (root: string, physical: string) =>
  path.join(root, 'v1', digest(process.platform === 'win32' ? physical.toLowerCase() : physical), 'snapshot.json');

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
  private pendingWrite = Promise.resolve();
  constructor(
    private readonly root: string,
    repoPath: string,
    context: string,
    physicalRepoPath?: string,
  ) {
    const physical = physicalRepoPath ?? fs.realpathSync.native(repoPath);
    this.directory = path.join(root, 'v1', digest(process.platform === 'win32' ? physical.toLowerCase() : physical), digest(context));
  }
  static async create(root: string, repoPath: string, context: string): Promise<AnalyticsCache> {
    return new AnalyticsCache(root, repoPath, context, await nativeRealpath(repoPath));
  }
  static snapshotPath(root: string, repoPath: string): string {
    const physical = fs.realpathSync.native(repoPath);
    return snapshotForPhysicalPath(root, physical);
  }
  static async readSnapshot(root: string, repoPath: string): Promise<RepositoryAnalyticsSnapshot | null> {
    try {
      const file = snapshotForPhysicalPath(root, await nativeRealpath(repoPath));
      const snapshot = (await readStorageJsonAsync(root, file, 8 * 1024 * 1024)) as RepositoryAnalyticsSnapshot;
      const valid = isAnalyticsSnapshot(snapshot, repoPath);
      if (valid) recordCacheUse(file);
      return valid ? snapshot : null;
    } catch {
      return null;
    }
  }
  async load(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await this.pendingWrite;
    await assertManagedPathAsync(this.root, this.directory);
    await fs.promises.mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, 'records.jsonl');
    await assertManagedPathAsync(this.root, file);
    const originalIdentity = await cacheFileIdentityAsync(file);
    if (!originalIdentity) {
      this.recordsIdentity = null;
      return;
    }
    recordCacheUse(file);
    let processed = 0;
    try {
      for await (const line of streamJsonlLines(file)) {
        if (++processed % 128 === 0) await setImmediate();
        signal?.throwIfAborted();
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
      signal?.throwIfAborted();
      // Calculations remain available while an unreadable or oversized cache stays untouched.
      this.writable = false;
    }
    signal?.throwIfAborted();
    if ((await cacheFileIdentityAsync(file)) !== originalIdentity) this.writable = false;
    this.recordsIdentity = originalIdentity;
  }
  private async canWriteRecords(): Promise<boolean> {
    const file = path.join(this.directory, 'records.jsonl');
    await assertManagedPathAsync(this.root, file);
    if ((await cacheFileIdentityAsync(file)) !== this.recordsIdentity) this.writable = false;
    return this.writable;
  }
  private enqueue(work: () => Promise<void>): Promise<void> {
    this.pendingWrite = serializeAnalyticsCacheWrite(this.root, work).catch(() => {
      this.writable = false;
    });
    return this.pendingWrite;
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
    if (this.queuedBytes >= 1024 ** 2) void this.flush();
  }
  settleWrites(): Promise<void> {
    return this.pendingWrite;
  }
  flush(): Promise<void> {
    if (!this.queued.length) return this.pendingWrite;
    const file = path.join(this.directory, 'records.jsonl');
    const raw = '\n' + this.queued.join('\n') + '\n';
    this.queued = [];
    this.queuedBytes = 0;
    return this.enqueue(async () => {
      if (!(await this.canWriteRecords()) || !(await canPersistAnalytics(this.root, file, Buffer.byteLength(raw)))) return;
      // The quota traversal yields: check ownership again before appending.
      if (!(await this.canWriteRecords())) return;
      // Begin with a delimiter, so an interrupted last record never consumes the next valid record.
      this.recordsIdentity = await appendOwnedCacheFile(this.root, file, raw, this.recordsIdentity);
      recordCacheUse(file);
    });
  }
  async saveSnapshot(root: string, snapshot: RepositoryAnalyticsSnapshot): Promise<void> {
    await this.flush();
    const file = snapshotForPhysicalPath(root, await nativeRealpath(snapshot.repoPath));
    this.data.snapshot = snapshot;
    const raw = JSON.stringify(snapshot);
    await this.enqueue(async () => {
      const identity = await cacheFileIdentityAsync(file);
      if (!(await mayReplaceCacheAsync(root, file, (value) => isAnalyticsSnapshot(value, snapshot.repoPath)))) return;
      if (Buffer.byteLength(raw) > 8 * 1024 * 1024 || !(await canPersistAnalytics(root, file, Buffer.byteLength(raw), true))) return;
      await writeTextFileAtomicallyAsync(file, raw, root, async () => (await cacheFileIdentityAsync(file)) === identity);
      recordCacheUse(file);
    });
  }
  async compact(): Promise<void> {
    await this.flush();
    await this.enqueue(async () => {
      if (!(await this.canWriteRecords())) return;
      const records: string[] = [];
      let bytes = 0;
      let processed = 0;
      for (const [type, values] of [
        ['commit', this.data.commits.values()],
        ['blob', this.data.blobs.values()],
        ['blame', this.data.blame.values()],
        ['classified', [...this.data.classified].map((oid) => ({ oid }))],
      ] as const) {
        for (const value of values) {
          if (++processed % 128 === 0) await setImmediate();
          const raw = JSON.stringify({ type, value }),
            size = Buffer.byteLength(raw) + 1;
          if (size > 8 * 1024 ** 2 || bytes + size > STORAGE_BUDGETS.analytics / 2) continue;
          records.push(raw);
          bytes += size;
        }
      }
      const file = path.join(this.directory, 'records.jsonl');
      const raw = records.join('\n') + '\n';
      if (await canPersistAnalytics(this.root, file, Buffer.byteLength(raw), true)) {
        await writeTextFileAtomicallyAsync(
          file,
          raw,
          this.root,
          () => this.canWriteRecords(),
          (identity) => {
            this.recordsIdentity = identity;
          },
        );
      }
    });
  }
  discardRecords(): Promise<void> {
    this.queued = [];
    this.queuedBytes = 0;
    const file = path.join(this.directory, 'records.jsonl');
    return this.enqueue(async () => {
      if (!(await this.canWriteRecords())) return;
      await fs.promises.rm(file, { force: true });
      this.recordsIdentity = null;
    });
  }
}
