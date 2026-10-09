import { GitRunner } from '../GitRunner';
import { runCommitEditProcess } from '../CommitEditProcess';
import type { GitJobKind } from '../../GitScheduler';
import type { GitCloneProgressResult, GitTransferOptions } from '../GitProcessTypes';

/** Own all fixture work, including the test continuation after a Vitest timeout. */
export class GitIntegrationLifecycle {
  private readonly controller = new AbortController();
  private readonly pending = new Set<Promise<unknown>>();
  readonly runner = new OwnedGitRunner(this);

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  track<T>(operation: Promise<T>): Promise<T> {
    this.pending.add(operation);
    const finished = () => this.pending.delete(operation);
    void operation.then(finished, finished);
    return operation;
  }

  git(cwd: string, ...args: string[]): Promise<string> {
    return this.track(runCommitEditProcess(cwd, args, this.signal).then((output) => output.trim()));
  }

  async close(): Promise<void> {
    this.controller.abort();
    // Stopping a command can let its caller finish or enqueue a final read.
    // Await those continuations before deleting any repository directory.
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
}

class OwnedGitRunner extends GitRunner {
  constructor(private readonly lifecycle: GitIntegrationLifecycle) {
    super();
  }

  override schedule<T>(
    repoPath: string,
    kind: GitJobKind,
    command: string,
    run: (signal: AbortSignal) => Promise<T>,
    options: { coalesceKey?: string; signal?: AbortSignal } = {},
  ): Promise<T> {
    const signal = options.signal ? AbortSignal.any([this.lifecycle.signal, options.signal]) : this.lifecycle.signal;
    return this.lifecycle.track(super.schedule(repoPath, kind, command, run, { ...options, signal }));
  }

  override cloneWithProgress(
    cloneUrl: string,
    repoPath: string,
    onProgress: (line: string) => void,
    options: GitTransferOptions = {},
  ): Promise<GitCloneProgressResult> {
    const signal = options.signal ? AbortSignal.any([this.lifecycle.signal, options.signal]) : this.lifecycle.signal;
    return this.lifecycle.track(super.cloneWithProgress(cloneUrl, repoPath, onProgress, { ...options, signal }));
  }
}
