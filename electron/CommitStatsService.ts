import * as path from 'path';
import { createHash } from 'crypto';
import type { CommitStats, GitService } from './GitService';
import { recordCacheUse } from './main-process/managedStorage';
import { CommitStatsDiskCache, statsCacheKey, type StatsCacheEntry } from './CommitStatsDiskCache';
import { indexFileHash } from './git/IndexFileIO';

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
  private readonly diskCache: CommitStatsDiskCache;
  private disposed = false;
  private maintenance: Promise<boolean> | null = null;
  private repoGeneration = 0;
  private get cache() {
    return this.diskCache.entries;
  }
  private queue: QueueEntry[] = [];
  private queuedEntries = new Map<string, QueueEntry>();
  private active = new Map<string, ActiveEntry>();
  private interruptedActiveKeys = new Set<string>();
  private listeners = new Set<(update: CommitStatsUpdate) => void>();
  private diagnostics: DiagnosticEntry[] = [];
  private objectFormats = new Map<string, string>();
  private namespaces = new Map<string, { shallowFingerprint: string; value: string }>();

  constructor(
    private readonly gitService: GitService,
    private readonly getCachePath: () => string,
    private readonly limits: {
      maxEntries?: number;
      compactedEntries?: number;
      maxBytes?: number;
      maxConcurrent?: number;
    } = {},
  ) {
    this.diskCache = new CommitStatsDiskCache(getCachePath, limits);
  }

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
    this.repoGeneration++;
    const normalized = this.repoPathKey(repoPath);
    this.queue = this.queue.filter((entry) => this.repoPathKey(entry.repoPath) === normalized);
    this.queuedEntries = new Map(this.queue.map((entry) => [entry.key, entry]));
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
  async maintain(clear: boolean, cutoff: number): Promise<boolean> {
    if (this.active.size || this.queue.length || this.maintenance) return false;
    const maintenance = (async () => {
      await this.diskCache.load();
      if (this.active.size || this.queue.length) return false;
      return this.diskCache.maintain(clear, cutoff);
    })();
    this.maintenance = maintenance;
    try {
      return await maintenance;
    } finally {
      if (this.maintenance === maintenance) this.maintenance = null;
    }
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    this.queue = [];
    this.queuedEntries.clear();
    for (const active of this.active.values()) active.controller.abort();
    await this.maintenance;
    await this.diskCache.dispose();
  }

  async requestStats(
    hashes: string[],
    priority: CommitStatsPriority = 'background',
    requestedRepoPath?: string,
  ): Promise<Record<string, { state: 'ready' | 'queued'; stats: CommitStats | null }>> {
    const generation = this.repoGeneration;
    await this.maintenance;
    await this.diskCache.load();
    if (this.disposed || generation !== this.repoGeneration) return {};
    const repoPath = requestedRepoPath || this.gitService.getRepoPath();
    if (!repoPath) return {};
    const objectFormat = await this.getObjectFormat(repoPath);
    const namespace = await this.getNamespace(repoPath);
    await this.maintenance;
    if (this.disposed || generation !== this.repoGeneration) return {};
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
        this.diskCache.touch(cached);
        result[hash] = { state: 'ready', stats: cached.stats };
        this.recordDiagnostic(0, true, false);
        continue;
      }
      result[hash] = { state: 'queued', stats: null };
      const queued = this.queuedEntries.get(key);
      if (queued) {
        if (PRIORITY[priority] < PRIORITY[queued.priority]) queued.priority = priority;
      } else if (!this.active.has(key)) {
        const entry = { repoPath, namespace, objectFormat, hash, key, priority };
        this.queue.push(entry);
        this.queuedEntries.set(key, entry);
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
    await this.maintenance;
    await this.diskCache.load();
    if (this.disposed) return {};
    const repoPath = requestedRepoPath || this.gitService.getRepoPath();
    if (!repoPath || hashes.length === 0) return {};
    const objectFormat = await this.getObjectFormat(repoPath);
    const namespace = await this.getNamespace(repoPath);
    const result: Record<string, CommitStats> = {};
    for (const hash of hashes) {
      const entry = this.cache.get(this.cacheKey(namespace, objectFormat, hash));
      if (!entry) continue;
      recordCacheUse(this.getCachePath());
      this.diskCache.touch(entry);
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
      shallowFingerprint = (await indexFileHash(shallowPath)) ?? 'full';
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
    return statsCacheKey(namespace, objectFormat, hash);
  }

  private maxConcurrent(): number {
    const configured = Math.floor(this.limits.maxConcurrent ?? 3);
    return Math.max(1, Math.min(configured, 3));
  }

  private pumpProcessing(): void {
    while (!this.disposed && this.active.size < this.maxConcurrent()) {
      const entry = this.queue.shift();
      if (!entry) return;
      this.queuedEntries.delete(entry.key);
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
      controller.signal.throwIfAborted();
      if (this.disposed) return;
      const cacheEntry: StatsCacheEntry = {
        schema: 2,
        namespace: entry.namespace,
        objectFormat: entry.objectFormat,
        hash: entry.hash,
        stats,
        accessedAt: this.diskCache.nextAccessedAt(),
      };
      this.cache.set(entry.key, cacheEntry);
      this.emit({ repoPath: entry.repoPath, hash: entry.hash, stats, state: 'ready' });
      try {
        await this.diskCache.append(cacheEntry);
      } catch (error) {
        console.warn(`Could not persist commit stats for ${entry.hash}:`, error);
      }
      this.recordDiagnostic(Date.now() - startedAt, false, false);
    } catch (error: any) {
      if (this.disposed) return;
      const aborted = controller.signal.aborted || error?.name === 'AbortError';
      this.recordDiagnostic(Date.now() - startedAt, false, aborted);
      if (aborted) {
        const wasInterrupted = this.interruptedActiveKeys.delete(entry.key);
        const activeRepo = this.gitService.getRepoPath();
        const isStillActiveRepo = Boolean(activeRepo && this.repoPathKey(activeRepo) === this.repoPathKey(entry.repoPath));
        if (!this.disposed && !wasInterrupted && isStillActiveRepo) {
          this.queue.push(entry);
          this.queuedEntries.set(entry.key, entry);
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

  private emit(update: CommitStatsUpdate): void {
    for (const listener of this.listeners) listener(update);
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority]);
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
