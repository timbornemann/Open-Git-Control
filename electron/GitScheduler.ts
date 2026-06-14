export type GitJobKind = 'write' | 'interactive' | 'polling' | 'background';

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
  coalesced: Map<string, Promise<unknown>>;
};

const PRIORITY: Record<GitJobKind, number> = {
  write: 0,
  interactive: 1,
  polling: 2,
  background: 3,
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
        options.signal.addEventListener('abort', () => controller.abort(), { once: true });
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
    const key = process.platform === 'win32' ? repoPath.toLowerCase() : repoPath;
    let state = this.repos.get(key);
    if (!state) {
      state = {
        queue: [],
        activeReads: new Set(),
        activeWrite: null,
        coalesced: new Map(),
      };
      this.repos.set(key, state);
    }
    return state;
  }

  private abortBackground(state: RepoState): void {
    for (const entry of state.activeReads) {
      if (entry.kind === 'background') entry.controller.abort();
    }
  }

  private pump(repoPath: string, state: RepoState): void {
    if (state.activeWrite) return;

    state.queue = state.queue.filter((entry) => {
      if (!entry.controller.signal.aborted) return true;
      this.finishCoalesced(state, entry);
      entry.reject(abortError());
      return false;
    });

    const nextWriteIndex = state.queue.findIndex((entry) => entry.kind === 'write');
    if (nextWriteIndex >= 0) {
      if (state.activeReads.size > 0) return;
      const [entry] = state.queue.splice(nextWriteIndex, 1);
      state.activeWrite = entry;
      void this.execute(repoPath, state, entry, true);
      return;
    }

    while (state.activeReads.size < MAX_CONCURRENT_READS) {
      const activeBackgroundCount = [...state.activeReads]
        .filter((entry) => entry.kind === 'background')
        .length;
      const hasActiveInteractiveRead = [...state.activeReads]
        .some((entry) => entry.kind === 'interactive');
      const nextIndex = state.queue.findIndex((entry) => {
        if (entry.kind === 'write') return false;
        if (entry.kind === 'background') {
          return !hasActiveInteractiveRead && activeBackgroundCount < MAX_BACKGROUND_READS;
        }
        return true;
      });
      if (nextIndex < 0) return;
      const [entry] = state.queue.splice(nextIndex, 1);
      state.activeReads.add(entry);
      void this.execute(repoPath, state, entry, false);
    }
  }

  private async execute(
    repoPath: string,
    state: RepoState,
    entry: QueueEntry<unknown>,
    isWrite: boolean,
  ): Promise<void> {
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
      if (isWrite) {
        state.activeWrite = null;
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
