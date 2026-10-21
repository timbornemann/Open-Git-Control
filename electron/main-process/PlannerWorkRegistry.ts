import type { PlannerItem } from '../../src/types/projectPlanner';
import { activePlannerBranch } from '../../src/shared/plannerWork';
import type { PlannerWorkCache } from './PlannerWorkCache';

export type WorkAssignment = { itemId: string; workflowId: string; branch: string; title: string; active: boolean; observedAt: number; aliases?: string[] };

/** Kept separately from disposable history: tasks on other branches still protect their work. */
export class PlannerWorkRegistry {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly cache: PlannerWorkCache) {}
  async read(repo: string): Promise<WorkAssignment[]> {
    return (await this.cache.read<WorkAssignment[]>(repo, 'active-assignments', true)) || [];
  }
  record(repo: string, items: PlannerItem[]) {
    const update = this.pending
      .catch(() => undefined)
      .then(async () => {
        const previous = await this.read(repo);
        const newer = items.filter(
          (item) => item.updatedAt >= Math.max(0, ...previous.filter((entry) => entry.itemId === item.id).map((entry) => entry.observedAt)),
        );
        const ids = new Set(newer.map((item) => item.id));
        const records = previous.filter((entry) => !ids.has(entry.itemId));
        for (const item of newer) {
          const active = activePlannerBranch(item);
          records.push({ itemId: item.id, workflowId: '', branch: '', title: item.title, active: false, observedAt: item.updatedAt });
          for (const branch of item.references?.branches || []) {
            if (branch.projectId !== item.projectId) continue;
            const known = previous.find((entry) => entry.itemId === item.id && entry.workflowId === branch.id);
            const name = known?.aliases?.includes(branch.name) ? known.branch : branch.name;
            const aliases = [...new Set([...(known?.aliases || []), ...(branch.previousNames || [])])].filter((entry) => entry !== name);
            records.push({
              itemId: item.id,
              workflowId: branch.id,
              branch: name,
              ...(aliases.length ? { aliases } : {}),
              title: item.title,
              active: branch.id === active?.id && !branch.completedBy && item.status !== 'done',
              observedAt: item.updatedAt,
            });
          }
        }
        await this.cache.write(repo, 'active-assignments', records, () => true, true);
      });
    this.pending = update;
    return update;
  }
  async assertAvailable(repo: string, itemId: string, branch: string) {
    const other = (await this.read(repo)).find((entry) => entry.branch === branch && entry.itemId !== itemId);
    if (other) throw new Error(`Branch is already assigned to task: ${other.title}`);
  }
  rename(repo: string, before: string, after: string) {
    const update = this.pending
      .catch(() => undefined)
      .then(async () => {
        const records = (await this.read(repo)).map((entry) =>
          entry.branch === before
            ? { ...entry, branch: after, aliases: [...new Set([...(entry.aliases || []), before])].filter((name) => name !== after) }
            : entry,
        );
        await this.cache.write(repo, 'active-assignments', records, () => true, true);
      });
    this.pending = update;
    return update;
  }
  forget(repo: string, itemIds: string[]) {
    const update = this.pending
      .catch(() => undefined)
      .then(async () => {
        const records = await this.read(repo);
        const observedAt = Math.max(Date.now(), ...records.filter((entry) => itemIds.includes(entry.itemId)).map((entry) => entry.observedAt + 1));
        const remaining = records.filter((entry) => !itemIds.includes(entry.itemId));
        for (const itemId of itemIds) remaining.push({ itemId, workflowId: '', branch: '', title: '', active: false, observedAt });
        await this.cache.write(repo, 'active-assignments', remaining, () => true, true);
      });
    this.pending = update;
    return update;
  }
}
