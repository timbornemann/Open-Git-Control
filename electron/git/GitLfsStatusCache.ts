import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { toolEnvironment, toolRuntimeRevision } from '../system-tools/toolRuntime';
import { GitLfsInspectionCache } from './GitLfsInspectionCache';

type Availability = { available: boolean; error?: string };
type Repository = {
  cache: GitLfsInspectionCache;
  pending: Promise<void>;
  users: number;
  availability?: { key: string; until: number; result: Availability };
};

/** Bounded per-worktree previews. Serialize refreshes so consecutive IPC batches share their work. */
export class GitLfsStatusCache {
  private readonly repositories = new Map<string, Repository>();
  read<T>(repoPath: string, probe: () => Promise<unknown>, inspect: (cache: GitLfsInspectionCache, availability: Availability) => Promise<T>): Promise<T> {
    const resolved = path.resolve(repoPath);
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    const repo = this.repositories.get(key) ?? { cache: new GitLfsInspectionCache(), pending: Promise.resolve(), users: 0 };
    this.repositories.delete(key);
    this.repositories.set(key, repo);
    repo.users++;
    const work = repo.pending.then(async () => inspect(repo.cache, await this.availability(repo, probe)));
    repo.pending = work
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        repo.users--;
        for (const [name, entry] of this.repositories) {
          if (this.repositories.size <= 4) break;
          if (!entry.users) this.repositories.delete(name);
        }
      });
    return work;
  }
  private async availability(repo: Repository, probe: () => Promise<unknown>): Promise<Availability> {
    const environment = Object.entries(toolEnvironment())
      .filter(([key]) => /^(?:GIT_|PATH$)/i.test(key))
      .sort(([a], [b]) => a.localeCompare(b));
    const key = createHash('sha256')
      .update(JSON.stringify([toolRuntimeRevision(), environment]))
      .digest('hex');
    if (repo.availability?.key === key && repo.availability.until > Date.now()) return repo.availability.result;
    let result: Availability;
    try {
      await probe();
      result = { available: true };
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
      result = { available: false, error: 'Git LFS is not installed or cannot be started. Install Git LFS and restart the application.' };
    }
    repo.availability = { key, until: Date.now() + (result.available ? 30000 : 5000), result };
    return result;
  }
}
