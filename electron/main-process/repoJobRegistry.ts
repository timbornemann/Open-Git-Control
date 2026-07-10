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

const normalizeRepoPathKey = (repoPath: string): string => path.resolve(String(repoPath || '').trim()).toLowerCase();

export class RepoJobRegistry {
  private generation = 0;
  private nextJobId = 1;
  private activeJobs = new Map<number, ActiveRepoJob>();

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
      if (controller.signal.aborted || jobGeneration !== this.generation) {
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
    this.generation += 1;

    for (const job of this.activeJobs.values()) {
      if (!nextKey || job.repoPathKey !== nextKey) {
        job.controller.abort();
      }
    }
  }
}

export const repoJobRegistry = new RepoJobRegistry();
