import * as fs from 'fs';
import * as path from 'path';
import type { CommitStats, GitService } from './GitService';

const CACHE_SCHEMA = 1;
const MAX_CACHE_ENTRIES = 100_000;
const COMPACTED_CACHE_ENTRIES = 75_000;
const MAX_CACHE_BYTES = 25 * 1024 * 1024;

type CacheEntry = {
  schema: number;
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
  private lastAccessedAt = 0;

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
    const normalized = String(repoPath || '').toLowerCase();
    this.queue = this.queue.filter((entry) => entry.repoPath.toLowerCase() === normalized);
    this.queuedKeys = new Set(this.queue.map((entry) => entry.key));
    for (const active of this.active.values()) {
      if (active.entry.repoPath.toLowerCase() !== normalized) {
        active.controller.abort();
      }
    }
  }

  getDiagnostics(): DiagnosticEntry[] {
    return [...this.diagnostics];
  }

  async requestStats(
    hashes: string[],
    priority: CommitStatsPriority = 'background',
  ): Promise<Record<string, { state: 'ready' | 'queued'; stats: CommitStats | null }>> {
    this.ensureLoaded();
    const repoPath = this.gitService.getRepoPath();
    if (!repoPath) return {};
    const objectFormat = await this.getObjectFormat(repoPath);
    const result: Record<string, { state: 'ready' | 'queued'; stats: CommitStats | null }> = {};
    const requestedKeys = new Set<string>();

    for (const rawHash of hashes) {
      const hash = String(rawHash || '').trim();
      if (!/^[0-9a-f]{7,64}$/i.test(hash)) continue;
      const key = this.cacheKey(objectFormat, hash);
      requestedKeys.add(key);
      const cached = this.cache.get(key);
      if (cached) {
        cached.accessedAt = this.nextAccessedAt();
        result[hash] = { state: 'ready', stats: cached.stats };
        this.recordDiagnostic(0, true, false);
        continue;
      }
      result[hash] = { state: 'queued', stats: null };
      const queued = this.queue.find((entry) => entry.key === key);
      if (queued) {
        if (PRIORITY[priority] < PRIORITY[queued.priority]) queued.priority = priority;
      } else if (!this.active.has(key)) {
        this.queue.push({ repoPath, objectFormat, hash, key, priority });
        this.queuedKeys.add(key);
      }
    }

    this.sortQueue();
    const lowerPriorityActive = [...this.active.values()]
      .filter(({ entry }) => (
        PRIORITY[priority] < PRIORITY[entry.priority]
        && !requestedKeys.has(entry.key)
      ))
      .sort((a, b) => PRIORITY[b.entry.priority] - PRIORITY[a.entry.priority])[0];
    if (
      lowerPriorityActive
      && this.active.size >= this.maxConcurrent()
    ) {
      lowerPriorityActive.controller.abort();
    }
    this.pumpProcessing();
    return result;
  }

  async getCachedStats(hashes: string[]): Promise<Record<string, CommitStats>> {
    this.ensureLoaded();
    const repoPath = this.gitService.getRepoPath();
    if (!repoPath || hashes.length === 0) return {};
    const objectFormat = await this.getObjectFormat(repoPath);
    const result: Record<string, CommitStats> = {};
    for (const hash of hashes) {
      const entry = this.cache.get(this.cacheKey(objectFormat, hash));
      if (!entry) continue;
      entry.accessedAt = this.nextAccessedAt();
      result[hash] = entry.stats;
    }
    return result;
  }

  private async getObjectFormat(repoPath: string): Promise<string> {
    const cached = this.objectFormats.get(repoPath);
    if (cached) return cached;
    try {
      const format = (await this.gitService.runCommandAtPath(repoPath, ['rev-parse', '--show-object-format'])).trim() || 'sha1';
      this.objectFormats.set(repoPath, format);
      return format;
    } catch {
      this.objectFormats.set(repoPath, 'sha1');
      return 'sha1';
    }
  }

  private cacheKey(objectFormat: string, hash: string): string {
    return `${CACHE_SCHEMA}:${objectFormat}:${hash}`;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = fs.readFileSync(this.getCachePath(), 'utf8');
      let malformed = false;
      for (const line of raw.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as CacheEntry;
          if (
            entry.schema !== CACHE_SCHEMA
            || !/^[0-9a-f]{7,64}$/i.test(entry.hash)
            || !entry.stats
          ) {
            malformed = true;
            break;
          }
          this.cache.set(this.cacheKey(entry.objectFormat, entry.hash), entry);
          this.lastAccessedAt = Math.max(this.lastAccessedAt, entry.accessedAt);
        } catch {
          malformed = true;
          break;
        }
      }
      if (malformed) {
        this.cache.clear();
        fs.rmSync(this.getCachePath(), { force: true });
      }
    } catch {
      // A missing or unreadable cache starts empty.
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
      const stats = await this.gitService.getCommitStatsAtPath(
        entry.repoPath,
        entry.hash,
        controller.signal,
      );
      const cacheEntry: CacheEntry = {
        schema: CACHE_SCHEMA,
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
        const isStillActiveRepo = this.gitService.getRepoPath()?.toLowerCase() === entry.repoPath.toLowerCase();
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
    const cachePath = this.getCachePath();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.appendFileSync(cachePath, `${JSON.stringify(entry)}\n`, 'utf8');
    let shouldCompact = this.cache.size > (this.limits.maxEntries ?? MAX_CACHE_ENTRIES);
    try {
      shouldCompact ||= fs.statSync(cachePath).size > (this.limits.maxBytes ?? MAX_CACHE_BYTES);
    } catch {
      // Keep the successful append when stat is unavailable.
    }
    if (shouldCompact) this.compact();
  }

  private compact(): void {
    const cachePath = this.getCachePath();
    const retained = [...this.cache.values()]
      .sort((a, b) => b.accessedAt - a.accessedAt)
      .slice(0, this.limits.compactedEntries ?? COMPACTED_CACHE_ENTRIES);
    const tempPath = `${cachePath}.tmp`;
    const backupPath = `${cachePath}.bak`;
    fs.writeFileSync(tempPath, `${retained.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');
    fs.rmSync(backupPath, { force: true });
    try {
      if (fs.existsSync(cachePath)) fs.renameSync(cachePath, backupPath);
      fs.renameSync(tempPath, cachePath);
      fs.rmSync(backupPath, { force: true });
    } catch (error) {
      fs.rmSync(tempPath, { force: true });
      if (!fs.existsSync(cachePath) && fs.existsSync(backupPath)) {
        fs.renameSync(backupPath, cachePath);
      }
      throw error;
    }
    this.cache = new Map(
      retained.map((entry) => [this.cacheKey(entry.objectFormat, entry.hash), entry]),
    );
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
}
