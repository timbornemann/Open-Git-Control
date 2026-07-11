import * as fs from 'fs';
import * as path from 'path';

export type GitJobKind = 'write' | 'interactive' | 'polling' | 'background' | 'network';

export type GitSchedulerDiagnostic = {
  repoPath: string;
  kind: GitJobKind;
  command: string;
  durationMs: number;
  resultBytes: number;
  aborted: boolean;
  timestamp: number;
};

type QueueEntry<T> = {
  kind: GitJobKind;
  command: string;
  coalesceKey: string | null;
  controller: AbortController;
  run: (signal: AbortSignal) => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  promise: Promise<T>;
};

type RepoState = {
  queue: QueueEntry<unknown>[];
  activeReads: Set<QueueEntry<unknown>>;
  activeWrite: QueueEntry<unknown> | null;
  activeNetwork: QueueEntry<unknown> | null;
  coalesced: Map<string, Promise<unknown>>;
};

const PRIORITY: Record<GitJobKind, number> = {
  write: 0,
  interactive: 1,
  polling: 2,
  background: 3,
  // Network jobs run in their own lane and are picked by kind, so this value
  // only affects tie-break ordering among queued jobs.
  network: 4,
};

const MAX_CONCURRENT_READS = 4;
const MAX_BACKGROUND_READS = 3;

const abortError = (): Error => {
  const error = new Error('Git operation was aborted.');
  error.name = 'AbortError';
  return error;
};

export class GitScheduler {
  private readonly repos = new Map<string, RepoState>();
  private readonly diagnostics: GitSchedulerDiagnostic[] = [];
  private readonly repoKeyCache = new Map<string, string>();

  schedule<T>(
    repoPath: string,
    kind: GitJobKind,
    command: string,
    run: (signal: AbortSignal) => Promise<T>,
    options: { coalesceKey?: string; signal?: AbortSignal } = {},
  ): Promise<T> {
    const state = this.getState(repoPath);
    const coalesceKey = kind === 'polling' ? options.coalesceKey || command : null;
    if (coalesceKey) {
      const existing = state.coalesced.get(coalesceKey);
      if (existing) return existing as Promise<T>;
    }

    if (kind === 'write' || kind === 'interactive') {
      this.abortBackground(state);
    }

    const controller = new AbortController();
    let resolveEntry!: (value: T) => void;
    let rejectEntry!: (error: unknown) => void;
    const promise = new Promise<T>((resolve, reject) => {
      resolveEntry = resolve;
      rejectEntry = reject;
    });
    const entry: QueueEntry<T> = {
      kind,
      command,
      coalesceKey,
      controller,
      run,
      resolve: resolveEntry,
      reject: rejectEntry,
      promise,
    };

    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener(
          'abort',
          () => {
            controller.abort();
            // Reject a still-queued job immediately instead of waiting for the
            // blocking job to finish and the next pump() to sweep it out.
            this.rejectIfQueued(state, entry as QueueEntry<unknown>);
          },
          { once: true },
        );
      }
    }

    state.queue.push(entry as QueueEntry<unknown>);
    state.queue.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
    if (coalesceKey) state.coalesced.set(coalesceKey, promise);
    this.pump(repoPath, state);
    return promise;
  }

  getDiagnostics(): GitSchedulerDiagnostic[] {
    return [...this.diagnostics];
  }

  private getState(repoPath: string): RepoState {
    const key = this.canonicalRepoKey(repoPath);
    let state = this.repos.get(key);
    if (!state) {
      state = {
        queue: [],
        activeReads: new Set(),
        activeWrite: null,
        activeNetwork: null,
        coalesced: new Map(),
      };
      this.repos.set(key, state);
    }
    return state;
  }

  /**
   * Canonicalizes a repository path so aliases of the same repository share one
   * queue: a trailing separator (`C:\repo` vs `C:\repo\`), and symlinks or
   * Windows junctions are all resolved to the same physical path. Without this,
   * two writes to aliases of one repo could run concurrently.
   */
  private canonicalRepoKey(repoPath: string): string {
    const cached = this.repoKeyCache.get(repoPath);
    if (cached) return cached;

    let resolved: string;
    try {
      resolved = fs.realpathSync.native(repoPath);
    } catch {
      // The path may not exist yet (e.g. clone target); fall back to a
      // lexical normalization which still collapses trailing separators.
      resolved = path.resolve(repoPath);
    }
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    this.repoKeyCache.set(repoPath, key);
    return key;
  }

  private rejectIfQueued(state: RepoState, entry: QueueEntry<unknown>): void {
    const index = state.queue.indexOf(entry);
    if (index < 0) return; // already started (or already removed)
    state.queue.splice(index, 1);
    this.finishCoalesced(state, entry);
    entry.reject(abortError());
  }

  private abortBackground(state: RepoState): void {
    for (const entry of state.activeReads) {
      if (entry.kind === 'background') entry.controller.abort();
    }
    state.queue = state.queue.filter((entry) => {
      if (entry.kind !== 'background') return true;
      entry.controller.abort();
      this.finishCoalesced(state, entry);
      entry.reject(abortError());
      return false;
    });
  }

  private pump(repoPath: string, state: RepoState): void {
    state.queue = state.queue.filter((entry) => {
      if (!entry.controller.signal.aborted) return true;
      this.finishCoalesced(state, entry);
      entry.reject(abortError());
      return false;
    });

    // Network jobs (fetch/push) neither read the working tree nor touch the
    // index, so they run in an independent single-slot lane. A slow or offline
    // remote therefore can never block local reads (log, file tree, diff) or
    // local writes (checkout, commit, ...). This runs before the activeWrite
    // gate so a network job may start even while a local write is in flight.
    if (!state.activeNetwork) {
      const networkIndex = state.queue.findIndex((entry) => entry.kind === 'network');
      if (networkIndex >= 0) {
        const [entry] = state.queue.splice(networkIndex, 1);
        state.activeNetwork = entry;
        void this.execute(repoPath, state, entry, 'network');
      }
    }

    if (state.activeWrite) return;

    const nextWriteIndex = state.queue.findIndex((entry) => entry.kind === 'write');
    if (nextWriteIndex >= 0) {
      if (state.activeReads.size > 0) return;
      const [entry] = state.queue.splice(nextWriteIndex, 1);
      state.activeWrite = entry;
      void this.execute(repoPath, state, entry, 'write');
      return;
    }

    while (state.activeReads.size < MAX_CONCURRENT_READS) {
      const activeBackgroundCount = [...state.activeReads].filter((entry) => entry.kind === 'background').length;
      const hasActiveInteractiveRead = [...state.activeReads].some((entry) => entry.kind === 'interactive');
      const nextIndex = state.queue.findIndex((entry) => {
        if (entry.kind === 'write' || entry.kind === 'network') return false;
        if (entry.kind === 'background') {
          return !hasActiveInteractiveRead && activeBackgroundCount < MAX_BACKGROUND_READS;
        }
        return true;
      });
      if (nextIndex < 0) return;
      const [entry] = state.queue.splice(nextIndex, 1);
      state.activeReads.add(entry);
      void this.execute(repoPath, state, entry, 'read');
    }
  }

  private async execute(repoPath: string, state: RepoState, entry: QueueEntry<unknown>, lane: 'write' | 'read' | 'network'): Promise<void> {
    const startedAt = Date.now();
    let aborted = false;
    let resultBytes = 0;
    try {
      if (entry.controller.signal.aborted) throw abortError();
      const value = await entry.run(entry.controller.signal);
      if (typeof value === 'string') resultBytes = Buffer.byteLength(value);
      entry.resolve(value);
    } catch (error) {
      aborted = entry.controller.signal.aborted || (error as any)?.name === 'AbortError';
      entry.reject(aborted ? abortError() : error);
    } finally {
      if (lane === 'write') {
        state.activeWrite = null;
      } else if (lane === 'network') {
        state.activeNetwork = null;
      } else {
        state.activeReads.delete(entry);
      }
      this.finishCoalesced(state, entry);
      this.diagnostics.push({
        repoPath,
        kind: entry.kind,
        command: entry.command,
        durationMs: Date.now() - startedAt,
        resultBytes,
        aborted,
        timestamp: Date.now(),
      });
      if (this.diagnostics.length > 100) {
        this.diagnostics.splice(0, this.diagnostics.length - 100);
      }
      this.pump(repoPath, state);
    }
  }

  private finishCoalesced(state: RepoState, entry: QueueEntry<unknown>): void {
    if (entry.coalesceKey && state.coalesced.get(entry.coalesceKey) === entry.promise) {
      state.coalesced.delete(entry.coalesceKey);
    }
  }
}
