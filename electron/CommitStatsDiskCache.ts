import * as fs from 'node:fs';
import * as path from 'node:path';
import { setImmediate } from 'node:timers/promises';
import type { CommitStats } from './GitService';
import { assertManagedPathAsync } from './main-process/storageSafety';
import { cacheFileIdentityAsync } from './main-process/cacheFileIdentity';
import { streamJsonlLines } from './main-process/boundedJsonl';
import { writeTextFileAtomicallyAsync } from './main-process/atomicFile';
import { recordCacheUse } from './main-process/managedStorage';
import { appendOwnedCacheFile } from './main-process/appendOwnedCacheFile';

const CACHE_SCHEMA = 2;
const MAX_CACHE_ENTRIES = 100_000;
const COMPACTED_CACHE_ENTRIES = 75_000;
const MAX_CACHE_BYTES = 25 * 1024 * 1024;
export type StatsCacheEntry = { schema: number; namespace: string; objectFormat: string; hash: string; stats: CommitStats; accessedAt: number };
export type StatsCacheLimits = { maxEntries?: number; compactedEntries?: number; maxBytes?: number };
export const statsCacheKey = (namespace: string, format: string, hash: string) => `${CACHE_SCHEMA}:${namespace}:${format}:${hash}`;
const keyFor = (entry: StatsCacheEntry) => statsCacheKey(entry.namespace, entry.objectFormat, entry.hash);
function valid(entry: StatsCacheEntry) {
  return (
    typeof entry.namespace === 'string' &&
    /^[0-9a-f]{64}$/i.test(entry.namespace) &&
    ['sha1', 'sha256'].includes(entry.objectFormat) &&
    /^[0-9a-f]{7,64}$/i.test(entry.hash) &&
    entry.stats &&
    [entry.stats.files, entry.stats.additions, entry.stats.deletions].every((value) => Number.isSafeInteger(value) && value >= 0) &&
    Number.isFinite(entry.accessedAt)
  );
}

/** An owned JSONL cache: stream reads, serialize writes, and yield during compaction. */
export class CommitStatsDiskCache {
  readonly entries = new Map<string, StatsCacheEntry>();
  private loading?: Promise<void>;
  private pending = Promise.resolve();
  private writable = true;
  private identity: string | null = null;
  private lastAccessedAt = 0;
  private accessVersion = 0;
  private persistedAccessVersion = 0;
  private readonly persistedEntries = new WeakMap<StatsCacheEntry, number>();
  private accessTimer: NodeJS.Timeout | null = null;
  private disposed = false;
  constructor(
    private readonly getPath: () => string,
    private readonly limits: StatsCacheLimits = {},
  ) {}
  load(): Promise<void> {
    return (this.loading ??= this.loadRecords());
  }
  private async loadRecords() {
    const file = this.getPath();
    try {
      await assertManagedPathAsync(path.dirname(file), file);
      this.identity = await cacheFileIdentityAsync(file);
      let processed = 0;
      for await (const line of streamJsonlLines(file)) {
        if (this.disposed) return;
        if (++processed % 128 === 0) await setImmediate();
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as StatsCacheEntry;
          if (entry.schema !== CACHE_SCHEMA) {
            this.writable = false;
            continue;
          }
          if (!valid(entry)) continue;
          const key = keyFor(entry);
          if ((this.entries.get(key)?.accessedAt ?? -1) <= entry.accessedAt) {
            this.entries.set(key, entry);
            this.persistedEntries.set(entry, entry.accessedAt);
          }
          this.lastAccessedAt = Math.max(this.lastAccessedAt, entry.accessedAt);
          if (this.entries.size > MAX_CACHE_ENTRIES) {
            const newest = new Set([...this.entries.values()].sort((a, b) => b.accessedAt - a.accessedAt).slice(0, COMPACTED_CACHE_ENTRIES));
            for (const [key, value] of this.entries) if (!newest.has(value)) this.entries.delete(key);
          }
        } catch {
          /* Invalid supported rows can be omitted at compaction. */
        }
      }
      if ((await cacheFileIdentityAsync(file)) !== this.identity) this.writable = false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.writable = false;
    }
  }
  nextAccessedAt(): number {
    return (this.lastAccessedAt = Math.max(Date.now(), this.lastAccessedAt + 1));
  }
  touch(entry: StatsCacheEntry): void {
    entry.accessedAt = this.nextAccessedAt();
    this.accessVersion++;
    this.scheduleAccessWrite();
  }
  private scheduleAccessWrite() {
    if (this.accessTimer || !this.writable || this.disposed) return;
    this.accessTimer = setTimeout(() => {
      this.accessTimer = null;
      const version = this.accessVersion;
      void this.enqueue(() => this.compact()).then(
        () => {
          this.persistedAccessVersion = version;
          if (this.accessVersion !== version) this.scheduleAccessWrite();
        },
        () => {
          /* Retry dirty access timestamps during shutdown or maintenance. */
        },
      );
    }, 1000);
    this.accessTimer.unref();
  }
  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.pending.then(work);
    this.pending = next.catch(async () => {
      this.writable = false;
      await this.trimReadOnlyMemory();
    });
    return next;
  }
  private async canWrite(): Promise<boolean> {
    if (!this.writable) return false;
    const file = this.getPath();
    await assertManagedPathAsync(path.dirname(file), file);
    if ((await cacheFileIdentityAsync(file)) !== this.identity) this.writable = false;
    return this.writable;
  }
  append(entry: StatsCacheEntry): Promise<void> {
    this.entries.set(keyFor(entry), entry);
    return this.enqueue(async () => {
      if (!(await this.canWrite())) {
        await this.trimReadOnlyMemory();
        return;
      }
      if (this.entries.get(keyFor(entry)) !== entry || this.persistedEntries.get(entry) === entry.accessedAt) return;
      const file = this.getPath();
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      const raw = `\n${JSON.stringify(entry)}\n`;
      const accessedAt = entry.accessedAt;
      const bytes = this.identity === null ? 0 : (await fs.promises.stat(file)).size;
      if (this.entries.size > (this.limits.maxEntries ?? MAX_CACHE_ENTRIES) || bytes + Buffer.byteLength(raw) > (this.limits.maxBytes ?? MAX_CACHE_BYTES))
        await this.compact();
      else {
        if (!(await this.canWrite())) return;
        this.identity = await appendOwnedCacheFile(path.dirname(file), file, raw, this.identity);
        this.persistedEntries.set(entry, accessedAt);
      }
      recordCacheUse(file);
    });
  }
  private async trimReadOnlyMemory(): Promise<void> {
    const limit = this.limits.maxEntries ?? MAX_CACHE_ENTRIES;
    if (this.entries.size <= limit) return;
    const snapshot = [...this.entries.values()].map((entry) => ({ entry, accessedAt: entry.accessedAt }));
    snapshot.sort((a, b) => b.accessedAt - a.accessedAt);
    const retained = new Set(snapshot.slice(0, Math.min(limit, this.limits.compactedEntries ?? COMPACTED_CACHE_ENTRIES)).map(({ entry }) => entry));
    let processed = 0;
    for (const { entry, accessedAt } of snapshot) {
      if (!retained.has(entry) && this.entries.get(keyFor(entry)) === entry && entry.accessedAt === accessedAt) this.entries.delete(keyFor(entry));
      if (++processed % 128 === 0) await setImmediate();
    }
  }
  private async compact(): Promise<void> {
    if (!(await this.canWrite())) return;
    const file = this.getPath();
    const snapshot = [...this.entries.values()].map((entry) => ({ entry, accessedAt: entry.accessedAt }));
    snapshot.sort((a, b) => b.accessedAt - a.accessedAt);
    const retained = new Set<StatsCacheEntry>();
    const lines: string[] = [];
    let bytes = 0,
      processed = 0;
    for (const { entry, accessedAt } of snapshot) {
      if (++processed % 128 === 0) await setImmediate();
      const raw = `${JSON.stringify({ ...entry, accessedAt })}\n`,
        size = Buffer.byteLength(raw);
      if (retained.size >= (this.limits.compactedEntries ?? COMPACTED_CACHE_ENTRIES)) break;
      if (bytes + size > (this.limits.maxBytes ?? MAX_CACHE_BYTES)) continue;
      retained.add(entry);
      lines.push(raw);
      bytes += size;
    }
    await writeTextFileAtomicallyAsync(
      file,
      lines.join(''),
      path.dirname(file),
      () => this.canWrite(),
      (identity) => {
        this.identity = identity;
      },
    );
    // New results and accesses during disk I/O remain available in memory.
    for (const { entry, accessedAt } of snapshot) {
      if (retained.has(entry)) this.persistedEntries.set(entry, accessedAt);
      if (!retained.has(entry) && this.entries.get(keyFor(entry)) === entry && entry.accessedAt === accessedAt) this.entries.delete(keyFor(entry));
      if (++processed % 128 === 0) await setImmediate();
    }
  }
  async maintain(clear: boolean, cutoff: number): Promise<boolean> {
    await this.load();
    let maintained = false;
    await this.enqueue(async () => {
      if (!(await this.canWrite())) return;
      if (clear) {
        if (this.accessTimer) clearTimeout(this.accessTimer);
        this.accessTimer = null;
        this.entries.clear();
        await fs.promises.rm(this.getPath(), { force: true });
        this.identity = null;
        this.persistedAccessVersion = this.accessVersion;
      } else {
        for (const [key, entry] of this.entries) if (entry.accessedAt < cutoff) this.entries.delete(key);
        await this.compact();
      }
      maintained = true;
    });
    return maintained;
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.accessTimer) clearTimeout(this.accessTimer);
    this.accessTimer = null;
    await this.loading;
    await this.pending;
    if (this.accessVersion !== this.persistedAccessVersion && this.writable) await this.enqueue(() => this.compact()).catch(() => undefined);
  }
}
