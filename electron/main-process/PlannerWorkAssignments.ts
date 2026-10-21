import type { GitRunner } from '../git/GitRunner';
import type { PlannerItem } from '../../src/types/projectPlanner';
import { activePlannerBranch } from '../../src/shared/plannerWork';
import type { PlannerWorkCache } from './PlannerWorkCache';
import { PlannerWorkRegistry, type WorkAssignment } from './PlannerWorkRegistry';
import { PlannerWorkRecovery } from './PlannerWorkRecovery';
import { loadWorkItem, saveWorkItem, workDigest, workPlanningPath } from './PlannerWorkStore';
import { readRepositoryPlanningFile } from './repositoryPlanningFile';

export class PlannerWorkAssignments {
  readonly registry: PlannerWorkRegistry;
  readonly recovery: PlannerWorkRecovery;
  constructor(
    private readonly git: GitRunner,
    cache: PlannerWorkCache,
  ) {
    this.registry = new PlannerWorkRegistry(cache);
    this.recovery = new PlannerWorkRecovery(cache);
  }
  async protectedBranches(repo: string) {
    const data = readRepositoryPlanningFile(workPlanningPath(repo), repo);
    await this.registry.record(repo, data.items);
    return (await this.registry.read(repo)).filter((entry) => entry.active);
  }
  private renamedItem(item: PlannerItem, records: WorkAssignment[]) {
    const branch = activePlannerBranch(item);
    const record =
      branch &&
      records.find(
        (entry) => entry.itemId === item.id && entry.workflowId === branch.id && entry.branch !== branch.name && entry.aliases?.includes(branch.name),
      );
    if (!branch || !record) return;
    return {
      ...item,
      references: {
        ...item.references!,
        branches: item.references!.branches.map((entry) =>
          entry.id === branch.id
            ? {
                ...entry,
                name: record.branch,
                previousNames: [...new Set([...(entry.previousNames || []), ...(record.aliases || [])])].filter((name) => name !== record.branch),
              }
            : entry,
        ),
      },
    };
  }
  async load(repo: string, itemId: string, ensureActive: () => void, signal: AbortSignal) {
    const source = loadWorkItem(repo, itemId);
    const updated = this.renamedItem(source.item, await this.registry.read(repo));
    if (!updated) return source;
    await this.git.withExclusiveWrite(
      repo,
      'planner:reconcileRename',
      async () => {
        ensureActive();
        const saved = saveWorkItem(repo, updated, source.revision);
        await this.registry.record(repo, [saved]);
      },
      signal,
    );
    return loadWorkItem(repo, itemId);
  }
  async renamed(repo: string, before: string, after: string) {
    await this.git.withExclusiveWrite(repo, 'planner:renameWork', async () => {
      await this.registry.rename(repo, before, after);
      await this.recovery.renamed(repo, before, after);
      const records = await this.registry.read(repo);
      const data = readRepositoryPlanningFile(workPlanningPath(repo), repo);
      for (const item of data.items) {
        const updated = this.renamedItem(item, records);
        if (updated) {
          const saved = saveWorkItem(repo, updated, workDigest(item));
          await this.registry.record(repo, [saved]);
        }
      }
    });
  }
}
