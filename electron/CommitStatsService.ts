import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { CommitStats, GitService } from './GitService';
import { assertManagedPath } from './main-process/storageSafety';
import { recordCacheUse } from './main-process/managedStorage';
import { writeTextFileAtomically } from './main-process/atomicFile';
import { cacheFileIdentity } from './main-process/cacheFileIdentity';
import { readJsonlLines } from './main-process/boundedJsonl';

const CACHE_SCHEMA = 2;
const MAX_CACHE_ENTRIES = 100_000;
const COMPACTED_CACHE_ENTRIES = 75_000;
const MAX_CACHE_BYTES = 25 * 1024 * 1024;

type CacheEntry = {
  schema: number;
  namespace: string;
  objectFormat: string;
  hash: string;
  stats: CommitStats;
  accessedAt: number;
};

export type CommitStatsUpdate = {
  repoPath: string;
  hash: string;
  stats: CommitStats | null;
  state: 'loading' | 'ready' | 'error';
};

type QueueEntry = {
  repoPath: string;
  namespace: string;
  objectFormat: string;
  hash: string;
  key: string;
  priority: CommitStatsPriority;
};

export type CommitStatsPriority = 'selected' | 'visible' | 'background';

const PRIORITY: Record<CommitStatsPriority, number> = {
  selected: 0,
  visible: 1,
  background: 2,
};

type DiagnosticEntry = {
  operation: string;
  durationMs: number;
  cacheHit: boolean;
  aborted: boolean;
  timestamp: number;
};

type ActiveEntry = {
  entry: QueueEntry;
  controller: AbortController;
};

export class CommitStatsService {
  private loaded = false;
  private cache = new Map<string, CacheEntry>();
  private queue: QueueEntry[] = [];
  private queuedKeys = new Set<string>();
  private active = new Map<string, ActiveEntry>();
  private interruptedActiveKeys = new Set<string>();
  private listeners = new Set<(update: CommitStatsUpdate) => void>();
  private diagnostics: DiagnosticEntry[] = [];
  private objectFormats = new Map<string, string>();
  private namespaces = new Map<string, { shallowFingerprint: string; value: string }>();
  private lastAccessedAt = 0;
  private writable = true;
  private fileIdentity: string | null = null;
  private accessTimer: NodeJS.Timeout | null = null;
  private dirtyAccess = false;

  constructor(
    private readonly gitService: GitService,
    private readonly getCachePath: () => string,
    private readonly limits: {
      maxEntries?: number;
      compactedEntries?: number;
      maxBytes?: number;
      maxConcurrent?: number;
    } = {},
  ) {}

  onUpdate(listener: (update: CommitStatsUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  interruptBackgroundWork(): void {
    for (const active of this.active.values()) {
      this.interruptedActiveKeys.add(active.entry.key);
      active.controller.abort();
    }
  }

  setActiveRepo(repoPath: string): void {
    const normalized = this.repoPathKey(repoPath);
    this.queue = this.queue.filter((entry) => this.repoPathKey(entry.repoPath) === normalized);
    this.queuedKeys = new Set(this.queue.map((entry) => entry.key));
    for (const active of this.active.values()) {
      if (this.repoPathKey(active.entry.repoPath) !== normalized) {
        active.controller.abort();
      }
    }
  }

  getDiagnostics(): DiagnosticEntry[] {
    return [...this.diagnostics];
  }
  isRepositoryBusy(repoPath: string): boolean {
    const key = this.repoPathKey(repoPath);
    return (
      [...this.active.values()].some(({ entry }) => this.repoPathKey(entry.repoPath) === key) ||
      this.queue.some((entry) => this.repoPathKey(entry.repoPath) === key)
    );
  }
  maintain(clear: boolean, cutoff: number): boolean {
    if (this.active.size || this.queue.length) return false;
    this.ensureLoaded();
    if (!this.canWrite()) return false;
    if (clear) {
      if (this.accessTimer) clearTimeout(this.accessTimer);
      this.accessTimer = null;
      this.dirtyAccess = false;
      this.cache.clear();
      assertManagedPath(path.dirname(this.getCachePath()), this.getCachePath());
      fs.rmSync(this.getCachePath(), { force: true });
      this.fileIdentity = null;
      return true;
    } else for (const [key, entry] of this.cache) if (entry.accessedAt < cutoff) this.cache.delete(key);
    this.compact();
    return true;
  }
  dispose(): void {
    if (this.accessTimer) clearTimeout(this.accessTimer);
    this.accessTimer = null;
    if (this.dirtyAccess && this.writable)
      try {
        this.compact();
        this.dirtyAccess = false;
      } catch {
        /* Existing cache remains intact. */
      }
  }
  private persistAccessSoon() {
    this.dirtyAccess = true;
    if (this.accessTimer || !this.writable) return;
    this.accessTimer = setTimeout(() => {
      this.accessTimer = null;
      if (this.writable && fs.existsSync(path.dirname(this.getCachePath())))
        try {
          this.compact();
          this.dirtyAccess = false;
        } catch {
          /* Retry on shutdown/maintenance. */
        }
    }, 1000);
    this.accessTimer.unref();
  }

  async requestStats(
    hashes: string[],
    priority: CommitStatsPriority = 'background',
    requestedRepoPath?: string,
  ): Promise<Record<string, { state: 'ready' | 'queued'; stats: CommitStats | null }>> {
    this.ensureLoaded();
    const repoPath = requestedRepoPath || this.gitService.getRepoPath();
    if (!repoPath) return {};
    const objectFormat = await this.getObjectFormat(repoPath);
    const namespace = await this.getNamespace(repoPath);
    const result: Record<string, { state: 'ready' | 'queued'; stats: CommitStats | null }> = {};
    const requestedKeys = new Set<string>();

    for (const rawHash of hashes) {
      const hash = String(rawHash || '').trim();
      if (!/^[0-9a-f]{7,64}$/i.test(hash)) continue;
      const key = this.cacheKey(namespace, objectFormat, hash);
      requestedKeys.add(key);
      const cached = this.cache.get(key);
      if (cached) {
        recordCacheUse(this.getCachePath());
        cached.accessedAt = this.nextAccessedAt();
        this.persistAccessSoon();
        result[hash] = { state: 'ready', stats: cached.stats };
        this.recordDiagnostic(0, true, false);
        continue;
      }
      result[hash] = { state: 'queued', stats: null };
      const queued = this.queue.find((entry) => entry.key === key);
      if (queued) {
        if (PRIORITY[priority] < PRIORITY[queued.priority]) queued.priority = priority;
      } else if (!this.active.has(key)) {
        this.queue.push({ repoPath, namespace, objectFormat, hash, key, priority });
        this.queuedKeys.add(key);
      }
    }

    this.sortQueue();
    const lowerPriorityActive = [...this.active.values()]
      .filter(({ entry }) => PRIORITY[priority] < PRIORITY[entry.priority] && !requestedKeys.has(entry.key))
      .sort((a, b) => PRIORITY[b.entry.priority] - PRIORITY[a.entry.priority])[0];
    if (lowerPriorityActive && this.active.size >= this.maxConcurrent()) {
      lowerPriorityActive.controller.abort();
    }
    this.pumpProcessing();
    return result;
  }

  async getCachedStats(hashes: string[], requestedRepoPath?: string): Promise<Record<string, CommitStats>> {
    this.ensureLoaded();
    const repoPath = requestedRepoPath || this.gitService.getRepoPath();
    if (!repoPath || hashes.length === 0) return {};
    const objectFormat = await this.getObjectFormat(repoPath);
    const namespace = await this.getNamespace(repoPath);
    const result: Record<string, CommitStats> = {};
    for (const hash of hashes) {
      const entry = this.cache.get(this.cacheKey(namespace, objectFormat, hash));
      if (!entry) continue;
      recordCacheUse(this.getCachePath());
      entry.accessedAt = this.nextAccessedAt();
      this.persistAccessSoon();
      result[hash] = entry.stats;
    }
    return result;
  }

  private async getObjectFormat(repoPath: string): Promise<string> {
    const pathKey = this.repoPathKey(repoPath);
    const cached = this.objectFormats.get(pathKey);
    if (cached) return cached;
    try {
      const format = (await this.gitService.runCommandAtPath(repoPath, ['rev-parse', '--show-object-format'])).trim() || 'sha1';
      this.objectFormats.set(pathKey, format);
      return format;
    } catch {
      this.objectFormats.set(pathKey, 'sha1');
      return 'sha1';
    }
  }

  private async getNamespace(repoPath: string): Promise<string> {
    const pathKey = this.repoPathKey(repoPath);
    let commonDir = path.resolve(repoPath, '.git');
    try {
      const rawCommonDir = (await this.gitService.runCommandAtPath(repoPath, ['rev-parse', '--git-common-dir'])).trim();
      if (rawCommonDir) commonDir = path.resolve(repoPath, rawCommonDir);
    } catch {
      // The subsequent stats command will surface repository errors. A stable
      // lexical fallback still prevents cache sharing with another checkout.
    }
    const shallowPath = path.join(commonDir, 'shallow');
    let shallowFingerprint = 'full';
    try {
      shallowFingerprint = createHash('sha256').update(fs.readFileSync(shallowPath)).digest('hex');
    } catch {
      // No shallow boundary means this checkout has full parent information.
    }
    const cached = this.namespaces.get(pathKey);
    if (cached?.shallowFingerprint === shallowFingerprint) return cached.value;
    const value = createHash('sha256').update(this.repoPathKey(commonDir)).update('\0').update(shallowFingerprint).digest('hex');
    this.namespaces.set(pathKey, { shallowFingerprint, value });
    return value;
  }

  private cacheKey(namespace: string, objectFormat: string, hash: string): string {
    return `${CACHE_SCHEMA}:${namespace}:${objectFormat}:${hash}`;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      assertManagedPath(path.dirname(this.getCachePath()), this.getCachePath());
      this.fileIdentity = cacheFileIdentity(this.getCachePath());
      for (const line of readJsonlLines(this.getCachePath())) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as CacheEntry;
          if (entry.schema !== CACHE_SCHEMA) {
            this.writable = false;
            continue;
          }
          if (
            typeof entry.namespace !== 'string' ||
            !/^[0-9a-f]{64}$/i.test(entry.namespace) ||
            !['sha1', 'sha256'].includes(entry.objectFormat) ||
            !/^[0-9a-f]{7,64}$/i.test(entry.hash) ||
            !entry.stats ||
            ![entry.stats.files, entry.stats.additions, entry.stats.deletions].every((value) => Number.isSafeInteger(value) && value >= 0) ||
            !Number.isFinite(entry.accessedAt)
          )
            continue;
          const key = this.cacheKey(entry.namespace, entry.objectFormat, entry.hash);
          if ((this.cache.get(key)?.accessedAt ?? -1) <= entry.accessedAt) this.cache.set(key, entry);
          this.lastAccessedAt = Math.max(this.lastAccessedAt, entry.accessedAt);
          if (this.cache.size > MAX_CACHE_ENTRIES) {
            const newest = [...this.cache.entries()].sort((a, b) => b[1].accessedAt - a[1].accessedAt).slice(0, COMPACTED_CACHE_ENTRIES);
            this.cache = new Map(newest);
          }
        } catch {
          // Invalid records can be omitted when the supported JSONL is compacted.
        }
      }
      if (cacheFileIdentity(this.getCachePath()) !== this.fileIdentity) this.writable = false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.writable = false;
    }
  }

  private maxConcurrent(): number {
    const configured = Math.floor(this.limits.maxConcurrent ?? 3);
    return Math.max(1, Math.min(configured, 3));
  }

  private pumpProcessing(): void {
    while (this.active.size < this.maxConcurrent()) {
      const entry = this.queue.shift();
      if (!entry) return;
      this.queuedKeys.delete(entry.key);
      const controller = new AbortController();
      this.active.set(entry.key, { entry, controller });
      void this.processEntry(entry, controller);
    }
  }

  private async processEntry(entry: QueueEntry, controller: AbortController): Promise<void> {
    const startedAt = Date.now();

    try {
      this.emit({ repoPath: entry.repoPath, hash: entry.hash, stats: null, state: 'loading' });
      const stats = await this.gitService.getCommitStatsAtPath(entry.repoPath, entry.hash, controller.signal);
      const cacheEntry: CacheEntry = {
        schema: CACHE_SCHEMA,
        namespace: entry.namespace,
        objectFormat: entry.objectFormat,
        hash: entry.hash,
        stats,
        accessedAt: this.nextAccessedAt(),
      };
      this.cache.set(entry.key, cacheEntry);
      this.emit({ repoPath: entry.repoPath, hash: entry.hash, stats, state: 'ready' });
      try {
        this.append(cacheEntry);
      } catch (error) {
        console.warn(`Could not persist commit stats for ${entry.hash}:`, error);
      }
      this.recordDiagnostic(Date.now() - startedAt, false, false);
    } catch (error: any) {
      const aborted = controller.signal.aborted || error?.name === 'AbortError';
      this.recordDiagnostic(Date.now() - startedAt, false, aborted);
      if (aborted) {
        const wasInterrupted = this.interruptedActiveKeys.delete(entry.key);
        const activeRepo = this.gitService.getRepoPath();
        const isStillActiveRepo = Boolean(activeRepo && this.repoPathKey(activeRepo) === this.repoPathKey(entry.repoPath));
        if (!wasInterrupted && isStillActiveRepo) {
          this.queue.push(entry);
          this.queuedKeys.add(entry.key);
          this.sortQueue();
        } else if (isStillActiveRepo) {
          this.emit({ repoPath: entry.repoPath, hash: entry.hash, stats: null, state: 'error' });
        }
      } else {
        this.emit({ repoPath: entry.repoPath, hash: entry.hash, stats: null, state: 'error' });
      }
    } finally {
      this.interruptedActiveKeys.delete(entry.key);
      this.active.delete(entry.key);
      this.pumpProcessing();
    }
  }

  private append(entry: CacheEntry): void {
    if (!this.canWrite()) return;
    const cachePath = this.getCachePath();
    assertManagedPath(path.dirname(cachePath), cachePath);
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const raw = `${JSON.stringify(entry)}\n`;
    const bytes = fs.existsSync(cachePath) ? fs.statSync(cachePath).size : 0;
    if (this.cache.size > (this.limits.maxEntries ?? MAX_CACHE_ENTRIES) || bytes + Buffer.byteLength(raw) > (this.limits.maxBytes ?? MAX_CACHE_BYTES))
      this.compact();
    else {
      fs.appendFileSync(cachePath, raw, 'utf8');
      this.fileIdentity = cacheFileIdentity(cachePath);
    }
    recordCacheUse(cachePath);
  }

  private compact(): void {
    if (!this.canWrite()) return;
    const cachePath = this.getCachePath();
    assertManagedPath(path.dirname(cachePath), cachePath);
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const retained: CacheEntry[] = [],
      lines: string[] = [];
    let bytes = 0;
    for (const entry of [...this.cache.values()].sort((a, b) => b.accessedAt - a.accessedAt)) {
      const raw = `${JSON.stringify(entry)}\n`,
        size = Buffer.byteLength(raw);
      if (retained.length >= (this.limits.compactedEntries ?? COMPACTED_CACHE_ENTRIES)) break;
      if (bytes + size > (this.limits.maxBytes ?? MAX_CACHE_BYTES)) continue;
      retained.push(entry);
      lines.push(raw);
      bytes += size;
    }
    writeTextFileAtomically(cachePath, lines.join(''));
    this.fileIdentity = cacheFileIdentity(cachePath);
    this.cache = new Map(retained.map((entry) => [this.cacheKey(entry.namespace, entry.objectFormat, entry.hash), entry]));
  }

  private canWrite(): boolean {
    const file = this.getCachePath();
    assertManagedPath(path.dirname(file), file);
    if (cacheFileIdentity(file) !== this.fileIdentity) this.writable = false;
    return this.writable;
  }
  private emit(update: CommitStatsUpdate): void {
    for (const listener of this.listeners) listener(update);
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority]);
  }

  private nextAccessedAt(): number {
    this.lastAccessedAt = Math.max(Date.now(), this.lastAccessedAt + 1);
    return this.lastAccessedAt;
  }

  private recordDiagnostic(durationMs: number, cacheHit: boolean, aborted: boolean): void {
    this.diagnostics.push({
      operation: 'commit-stats',
      durationMs,
      cacheHit,
      aborted,
      timestamp: Date.now(),
    });
    if (this.diagnostics.length > 100) {
      this.diagnostics.splice(0, this.diagnostics.length - 100);
    }
  }

  private repoPathKey(repoPath: string): string {
    const resolved = path.resolve(String(repoPath || ''));
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }
}
