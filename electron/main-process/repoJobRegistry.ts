import * as path from 'path';

export class RepoJobCancelledError extends Error {
  constructor(message = 'Repository job was cancelled because the active repository changed.') {
    super(message);
    this.name = 'RepoJobCancelledError';
  }
}

export type RepoJobContext = {
  repoPath: string;
  generation: number;
  signal: AbortSignal;
  ensureActive: () => void;
  complete: () => void;
};

type ActiveRepoJob = {
  id: number;
  repoPathKey: string;
  controller: AbortController;
};

const normalizeRepoPathKey = (repoPath: string): string => {
  const resolved = path.resolve(String(repoPath || '').trim());
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

export class RepoJobRegistry {
  private generation = 0;
  private nextJobId = 1;
  private activeJobs = new Map<number, ActiveRepoJob>();
  private currentRepoPathKey: string | null | undefined;

  getGeneration(): number {
    return this.generation;
  }

  begin(repoPath: string): RepoJobContext {
    const normalizedPath = String(repoPath || '').trim();
    if (!normalizedPath) {
      throw new Error('Repository path is required.');
    }

    const jobGeneration = this.generation;
    const controller = new AbortController();
    const id = this.nextJobId;
    this.nextJobId += 1;

    this.activeJobs.set(id, {
      id,
      repoPathKey: normalizeRepoPathKey(normalizedPath),
      controller,
    });

    const ensureActive = () => {
      if (controller.signal.aborted) {
        throw new RepoJobCancelledError();
      }
    };

    return {
      repoPath: normalizedPath,
      generation: jobGeneration,
      signal: controller.signal,
      ensureActive,
      complete: () => {
        this.activeJobs.delete(id);
      },
    };
  }

  cancelForRepoChange(nextRepoPath?: string | null): void {
    const nextKey = nextRepoPath ? normalizeRepoPathKey(nextRepoPath) : null;
    if (this.currentRepoPathKey === nextKey) {
      return;
    }

    this.currentRepoPathKey = nextKey;
    this.generation += 1;

    for (const job of this.activeJobs.values()) {
      if (!nextKey || job.repoPathKey !== nextKey) {
        job.controller.abort();
      }
    }
  }
}

export const repoJobRegistry = new RepoJobRegistry();
