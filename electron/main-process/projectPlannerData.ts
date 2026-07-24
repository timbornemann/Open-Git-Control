import * as path from 'path';

export type PlannerProjectKind = 'repository' | 'planned';
export type PlannerPriority = 'low' | 'medium' | 'high' | 'urgent';
export type PlannerStatus = 'idea' | 'bug' | 'planned' | 'in-progress' | 'blocked' | 'done';

export interface PlannerProject {
  id: string;
  name: string;
  description: string;
  kind: PlannerProjectKind;
  repoPath: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PlannerItem {
  id: string;
  projectId: string;
  title: string;
  description: string;
  priority: PlannerPriority;
  status: PlannerStatus;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ProjectPlannerData {
  version: 1;
  projects: PlannerProject[];
  items: PlannerItem[];
}

export type PlannerItemInput = {
  title: string;
  description?: string;
  priority?: PlannerPriority;
  status?: PlannerStatus;
  tags?: string[];
};

export const PLANNER_PRIORITIES: PlannerPriority[] = ['low', 'medium', 'high', 'urgent'];
export const PLANNER_STATUSES: PlannerStatus[] = ['idea', 'bug', 'planned', 'in-progress', 'blocked', 'done'];

const PRIORITIES = new Set<PlannerPriority>(PLANNER_PRIORITIES);
const STATUSES = new Set<PlannerStatus>(PLANNER_STATUSES);

export const createEmptyProjectPlannerData = (): ProjectPlannerData => ({ version: 1, projects: [], items: [] });
export const cleanPlannerText = (value: unknown, maxLength: number): string => (typeof value === 'string' ? value.trim().slice(0, maxLength) : '');

const cleanTimestamp = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;

export const normalizePlannerRepoPath = (value: unknown): string | null => {
  const repoPath = cleanPlannerText(value, 4_096);
  return repoPath ? path.resolve(repoPath) : null;
};

export const getRepositoryProjectKey = (repoPath: string): string => {
  const resolved = path.resolve(repoPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

export const isPlannerPriority = (value: unknown): value is PlannerPriority => PRIORITIES.has(value as PlannerPriority);
export const isPlannerStatus = (value: unknown): value is PlannerStatus => STATUSES.has(value as PlannerStatus);

export const normalizePlannerTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of value) {
    const tag = cleanPlannerText(entry, 40);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 20) break;
  }
  return tags;
};

export function normalizeProjectPlannerData(input: unknown): ProjectPlannerData {
  if (!input || typeof input !== 'object') return createEmptyProjectPlannerData();
  const candidate = input as Partial<ProjectPlannerData>;
  const now = Date.now();
  const projectIds = new Set<string>();
  const repoKeys = new Set<string>();
  const projects: PlannerProject[] = [];
  for (const raw of Array.isArray(candidate.projects) ? candidate.projects : []) {
    const source = raw as Partial<PlannerProject>;
    const id = cleanPlannerText(source.id, 100);
    const name = cleanPlannerText(source.name, 160);
    const kind: PlannerProjectKind = source.kind === 'repository' ? 'repository' : 'planned';
    const repoPath = kind === 'repository' ? normalizePlannerRepoPath(source.repoPath) : null;
    if (!id || !name || projectIds.has(id) || (kind === 'repository' && !repoPath)) continue;
    if (repoPath) {
      const repoKey = getRepositoryProjectKey(repoPath);
      if (repoKeys.has(repoKey)) continue;
      repoKeys.add(repoKey);
    }
    const createdAt = cleanTimestamp(source.createdAt, now);
    projects.push({
      id,
      name,
      description: cleanPlannerText(source.description, 8_000),
      kind,
      repoPath,
      createdAt,
      updatedAt: cleanTimestamp(source.updatedAt, createdAt),
    });
    projectIds.add(id);
  }

  const itemIds = new Set<string>();
  const items: PlannerItem[] = [];
  for (const raw of Array.isArray(candidate.items) ? candidate.items : []) {
    const source = raw as Partial<PlannerItem>;
    const id = cleanPlannerText(source.id, 100);
    const projectId = cleanPlannerText(source.projectId, 100);
    const title = cleanPlannerText(source.title, 240);
    if (!id || !projectIds.has(projectId) || !title || itemIds.has(id)) continue;
    const createdAt = cleanTimestamp(source.createdAt, now);
    items.push({
      id,
      projectId,
      title,
      description: cleanPlannerText(source.description, 20_000),
      priority: isPlannerPriority(source.priority) ? source.priority : 'medium',
      status: isPlannerStatus(source.status) ? source.status : 'idea',
      tags: normalizePlannerTags(source.tags),
      createdAt,
      updatedAt: cleanTimestamp(source.updatedAt, createdAt),
    });
    itemIds.add(id);
  }
  return { version: 1, projects, items };
}
