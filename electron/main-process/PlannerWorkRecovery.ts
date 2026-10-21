import { randomUUID } from 'node:crypto';
import type { PlannerItem, PlannerProject } from '../../src/types/projectPlanner';
import type { PlannerWorkCache } from './PlannerWorkCache';

export type WorkRecovery = { item: PlannerItem; project: PlannerProject; branch: string; requiresChangesReview?: boolean };
/** An indexed journal keeps unfinished checkouts discoverable after a restart. */
export class PlannerWorkRecovery {
  constructor(private readonly cache: PlannerWorkCache) {}
  async read(repo: string, itemId: string) {
    const pending = await this.cache.read<{ id: string }>(repo, `pending:${itemId}`, true);
    const value = pending && (await this.cache.read<WorkRecovery>(repo, pending.id, true));
    return value?.item.id === itemId ? { id: pending!.id, value } : undefined;
  }
  async prepare(repo: string, value: WorkRecovery, current: () => boolean) {
    const id = randomUUID();
    await this.cache.write(repo, id, value, current, true);
    try {
      await this.cache.write(repo, `pending:${value.item.id}`, { id }, current, true);
      const index = (await this.cache.read<string[]>(repo, 'pending-starts', true)) || [];
      if (index.length >= 100 && !index.includes(value.item.id)) throw new Error('Too many unfinished task checkouts. Recover them first.');
      await this.cache.write(repo, 'pending-starts', [...new Set([...index, value.item.id])], current, true);
    } catch (error) {
      await this.cache.removeRecovery(repo, id);
      await this.cache.removeRecovery(repo, `pending:${value.item.id}`);
      throw error;
    }
    return id;
  }
  async complete(repo: string, itemId: string, id: string) {
    await this.cache.removeRecovery(repo, id);
    // Stale index pointers are harmless once the owned journal has been removed.
    await this.cache.removeRecovery(repo, `pending:${itemId}`).catch(() => undefined);
    const index = (await this.cache.read<string[]>(repo, 'pending-starts', true).catch(() => undefined)) || [];
    await this.cache
      .write(
        repo,
        'pending-starts',
        index.filter((entry) => entry !== itemId),
        () => true,
        true,
      )
      .catch(() => undefined);
  }
  async list(repo: string) {
    const index = (await this.cache.read<string[]>(repo, 'pending-starts', true)) || [];
    const recoveries = await Promise.all(index.map((id) => this.read(repo, id)));
    return recoveries.filter((entry) => entry !== undefined);
  }
  async renamed(repo: string, before: string, after: string) {
    for (const recovery of await this.list(repo)) {
      if (recovery.value.branch !== before) continue;
      const value = structuredClone(recovery.value);
      value.branch = after;
      for (const branch of value.item.references?.branches || [])
        if (branch.name === before) {
          branch.name = after;
          branch.previousNames = [...new Set([...(branch.previousNames || []), before])].filter((name) => name !== after);
        }
      await this.cache.write(repo, recovery.id, value, () => true, true);
    }
  }
}
