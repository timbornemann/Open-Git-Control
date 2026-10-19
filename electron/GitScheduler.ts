import * as fs from 'fs';
import * as path from 'path';
import { repositoryCommonDirectory, physicalPathKey } from './git/RepositoryCommonDirectory';
import { BackgroundFetchPreemptedError } from './git/BackgroundFetchPreemptedError';

export type GitJobKind = 'write' | 'interactive' | 'polling' | 'background' | 'preflight' | 'network' | 'network-read' | 'background-fetch';

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
  preflight: 3,
  // Network jobs run in their own lane and are picked by kind, so this value
  // only affects tie-break ordering among queued jobs.
  network: 4,
  'network-read': 4,
  'background-fetch': 5,
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
    const coalesceKey = kind === 'polling' ? `${physicalPathKey(repoPath)}\0${options.coalesceKey || command}` : null;
    if (coalesceKey) {
      const existing = state.coalesced.get(coalesceKey);
      if (existing) return existing as Promise<T>;
    }

    if (kind === 'write' || kind === 'interactive') {
      this.abortBackground(state, kind === 'write');
    }
    if (kind === 'write' || kind === 'network' || kind === 'network-read') {
      this.preemptBackgroundFetch(state);
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
  isRepositoryBusy(repoPath: string, commonDirectory?: string): boolean {
    // Inspect known queues without touching a potentially disconnected filesystem.
    const resolved = path.resolve(repoPath);
    const lexical = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    const commonKey = commonDirectory && (process.platform === 'win32' ? path.resolve(commonDirectory).toLowerCase() : path.resolve(commonDirectory));
    const state = this.repos.get(this.repoKeyCache.get(lexical) || commonKey || lexical);
    return Boolean(state && (state.queue.length || state.activeReads.size || state.activeWrite || state.activeNetwork));
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
    const resolvedPath = path.resolve(repoPath);
    const lexical = process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
    const cached = this.repoKeyCache.get(lexical);
    if (cached) return cached;

    let resolved: string;
    try {
      resolved = repositoryCommonDirectory(repoPath) || fs.realpathSync.native(repoPath);
    } catch {
      // The path may not exist yet (e.g. clone target); fall back to a
      // lexical normalization which still collapses trailing separators.
      resolved = path.resolve(repoPath);
    }
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    this.repoKeyCache.set(lexical, key);
    return key;
  }

  private rejectIfQueued(state: RepoState, entry: QueueEntry<unknown>): void {
    const index = state.queue.indexOf(entry);
    if (index < 0) return; // already started (or already removed)
    state.queue.splice(index, 1);
    this.finishCoalesced(state, entry);
    entry.reject(abortError());
  }

  private abortBackground(state: RepoState, includePreflight: boolean): void {
    for (const entry of state.activeReads) {
      if (entry.kind === 'background' || (includePreflight && entry.kind === 'preflight')) entry.controller.abort();
    }
    state.queue = state.queue.filter((entry) => {
      if (entry.kind !== 'background' && !(includePreflight && entry.kind === 'preflight')) return true;
      entry.controller.abort();
      this.finishCoalesced(state, entry);
      entry.reject(abortError());
      return false;
    });
  }

  private preemptBackgroundFetch(state: RepoState): void {
    if (state.activeNetwork?.kind === 'background-fetch') {
      state.activeNetwork.controller.abort(new BackgroundFetchPreemptedError());
    }
    state.queue = state.queue.filter((entry) => {
      if (entry.kind !== 'background-fetch') return true;
      const reason = new BackgroundFetchPreemptedError();
      entry.controller.abort(reason);
      entry.reject(reason);
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

    // Pure remote reads (`ls-remote`) remain fully independent. Fetch and push
    // use the same lane, but are ref/config mutators and therefore must not
    // overlap a local write. Local reads may still run while a remote is slow.
    if (!state.activeNetwork) {
      const pureNetworkReadIndex = state.queue.findIndex((entry) => entry.kind === 'network-read');
      const hasQueuedWrite = state.queue.some((entry) => entry.kind === 'write');
      const mutatingNetworkIndex =
        state.activeWrite || hasQueuedWrite ? -1 : state.queue.findIndex((entry) => entry.kind === 'network' || entry.kind === 'background-fetch');
      const networkIndex = pureNetworkReadIndex >= 0 ? pureNetworkReadIndex : mutatingNetworkIndex;
      if (networkIndex >= 0) {
        const [entry] = state.queue.splice(networkIndex, 1);
        state.activeNetwork = entry;
        void this.execute(repoPath, state, entry, 'network');
      }
    }

    if (state.activeWrite) return;

    const nextWriteIndex = state.queue.findIndex((entry) => entry.kind === 'write');
    if (nextWriteIndex >= 0) {
      // A preempted fetch owns this lane until its complete process tree has
      // exited. Never release a write merely because abort() was requested.
      const mutatingNetworkActive = state.activeNetwork && state.activeNetwork.kind !== 'network-read';
      if (!mutatingNetworkActive) {
        if (state.activeReads.size > 0) return;
        const [entry] = state.queue.splice(nextWriteIndex, 1);
        state.activeWrite = entry;
        void this.execute(repoPath, state, entry, 'write');
        return;
      }
    }

    while (state.activeReads.size < MAX_CONCURRENT_READS) {
      const activeBackgroundCount = [...state.activeReads].filter((entry) => entry.kind === 'background' || entry.kind === 'preflight').length;
      const hasActiveInteractiveRead = [...state.activeReads].some((entry) => entry.kind === 'interactive');
      const nextIndex = state.queue.findIndex((entry) => {
        if (entry.kind === 'write' || entry.kind === 'network' || entry.kind === 'network-read' || entry.kind === 'background-fetch') return false;
        if (entry.kind === 'background' || entry.kind === 'preflight') {
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
      if (entry.kind === 'background-fetch') entry.controller.signal.throwIfAborted();
      if (typeof value === 'string') resultBytes = Buffer.byteLength(value);
      entry.resolve(value);
    } catch (error) {
      aborted = entry.controller.signal.aborted || (error as any)?.name === 'AbortError';
      const reason = entry.controller.signal.reason;
      entry.reject(aborted ? (reason instanceof BackgroundFetchPreemptedError ? reason : abortError()) : error);
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
