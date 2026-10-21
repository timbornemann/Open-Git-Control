import type { ParkedBranchChange } from '../../src/shared/ipc/branchChange';
import type { PlannerWorkCache } from './PlannerWorkCache';

/** Recovery records share the bounded, path-protected recovery storage, never versioned planning data. */
export class BranchChangeStore {
  constructor(private readonly cache: PlannerWorkCache) {}
  async list(repo: string) {
    const value = await this.cache.read<{ sessions: ParkedBranchChange[] }>(repo, 'branch-change-sessions', true);
    if (value && (!Array.isArray(value.sessions) || value.sessions.some((entry) => !entry.id || !entry.sourceHead || !entry.worktree)))
      throw new Error('Invalid branch-change recovery journal.');
    return value?.sessions || [];
  }
  async save(repo: string, session: ParkedBranchChange) {
    const sessions = await this.list(repo);
    const next = [...sessions.filter((entry) => entry.id !== session.id), session];
    if (next.length > 500) throw new Error('Recover existing parked changes before creating more stashes.');
    await this.cache.write(repo, 'branch-change-sessions', { sessions: next }, () => true, true);
  }
  async remove(repo: string, id: string) {
    await this.cache.write(repo, 'branch-change-sessions', { sessions: (await this.list(repo)).filter((entry) => entry.id !== id) }, () => true, true);
  }
}
