import { app } from 'electron';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export type PlannerProjectKind = 'repository' | 'planned';
export type PlannerPriority = 'low' | 'medium' | 'high' | 'urgent';
export type PlannerStatus = 'idea' | 'planned' | 'in-progress' | 'blocked' | 'done';

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

const EMPTY_DATA: ProjectPlannerData = {
  version: 1,
  projects: [],
  items: [],
};

const PRIORITIES = new Set<PlannerPriority>(['low', 'medium', 'high', 'urgent']);
const STATUSES = new Set<PlannerStatus>(['idea', 'planned', 'in-progress', 'blocked', 'done']);

const cleanText = (value: unknown, maxLength: number): string => (
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
);

const cleanTimestamp = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback
);

const normalizeRepoPath = (value: unknown): string | null => {
  const repoPath = cleanText(value, 4_096);
  return repoPath ? path.resolve(repoPath) : null;
};

export const getRepositoryProjectKey = (repoPath: string): string => {
  const resolved = path.resolve(repoPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const entry of value) {
    const tag = cleanText(entry, 40);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 20) break;
  }

  return tags;
};

export function normalizeProjectPlannerData(input: unknown): ProjectPlannerData {
  if (!input || typeof input !== 'object') return { ...EMPTY_DATA };
  const candidate = input as Partial<ProjectPlannerData>;
  const now = Date.now();
  const projectIds = new Set<string>();
  const repoKeys = new Set<string>();
  const projects: PlannerProject[] = [];

  for (const raw of Array.isArray(candidate.projects) ? candidate.projects : []) {
    const source = raw as Partial<PlannerProject>;
    const id = cleanText(source.id, 100);
    const name = cleanText(source.name, 160);
    const kind: PlannerProjectKind = source.kind === 'repository' ? 'repository' : 'planned';
    const repoPath = kind === 'repository' ? normalizeRepoPath(source.repoPath) : null;
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
      description: cleanText(source.description, 8_000),
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
    const id = cleanText(source.id, 100);
    const projectId = cleanText(source.projectId, 100);
    const title = cleanText(source.title, 240);
    if (!id || !projectIds.has(projectId) || !title || itemIds.has(id)) continue;

    const createdAt = cleanTimestamp(source.createdAt, now);
    items.push({
      id,
      projectId,
      title,
      description: cleanText(source.description, 20_000),
      priority: PRIORITIES.has(source.priority as PlannerPriority) ? source.priority as PlannerPriority : 'medium',
      status: STATUSES.has(source.status as PlannerStatus) ? source.status as PlannerStatus : 'idea',
      tags: normalizeTags(source.tags),
      createdAt,
      updatedAt: cleanTimestamp(source.updatedAt, createdAt),
    });
    itemIds.add(id);
  }

  return { version: 1, projects, items };
}

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'project-planner.json');
}

export function readProjectPlannerData(): ProjectPlannerData {
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf8');
    return normalizeProjectPlannerData(JSON.parse(raw));
  } catch {
    return { ...EMPTY_DATA };
  }
}

export function writeProjectPlannerData(data: ProjectPlannerData): ProjectPlannerData {
  const normalized = normalizeProjectPlannerData(data);
  const storePath = getStorePath();
  const tempPath = `${storePath}.tmp`;
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), 'utf8');
  fs.renameSync(tempPath, storePath);
  return normalized;
}

export function ensureRepositoryProject(repoPath: string): PlannerProject {
  const resolvedPath = normalizeRepoPath(repoPath);
  if (!resolvedPath) throw new Error('Repository path is required.');
  const data = readProjectPlannerData();
  const repoKey = getRepositoryProjectKey(resolvedPath);
  const existing = data.projects.find((project) => (
    project.repoPath && getRepositoryProjectKey(project.repoPath) === repoKey
  ));
  if (existing) return existing;

  const now = Date.now();
  const project: PlannerProject = {
    id: randomUUID(),
    name: path.basename(resolvedPath) || resolvedPath,
    description: '',
    kind: 'repository',
    repoPath: resolvedPath,
    createdAt: now,
    updatedAt: now,
  };
  writeProjectPlannerData({ ...data, projects: [...data.projects, project] });
  return project;
}

export function createPlannedProject(input: { name: string; description?: string }): PlannerProject {
  const name = cleanText(input?.name, 160);
  if (!name) throw new Error('Project name is required.');
  const data = readProjectPlannerData();
  const now = Date.now();
  const project: PlannerProject = {
    id: randomUUID(),
    name,
    description: cleanText(input?.description, 8_000),
    kind: 'planned',
    repoPath: null,
    createdAt: now,
    updatedAt: now,
  };
  writeProjectPlannerData({ ...data, projects: [...data.projects, project] });
  return project;
}

export function updatePlannerProject(
  projectId: string,
  input: { name?: string; description?: string },
): PlannerProject {
  const data = readProjectPlannerData();
  const index = data.projects.findIndex((project) => project.id === projectId);
  if (index < 0) throw new Error('Project not found.');
  const current = data.projects[index];
  const name = input.name === undefined ? current.name : cleanText(input.name, 160);
  if (!name) throw new Error('Project name is required.');

  const updated: PlannerProject = {
    ...current,
    name,
    description: input.description === undefined
      ? current.description
      : cleanText(input.description, 8_000),
    updatedAt: Date.now(),
  };
  const projects = [...data.projects];
  projects[index] = updated;
  writeProjectPlannerData({ ...data, projects });
  return updated;
}

export function deletePlannerProject(projectId: string): void {
  const data = readProjectPlannerData();
  if (!data.projects.some((project) => project.id === projectId)) return;
  writeProjectPlannerData({
    ...data,
    projects: data.projects.filter((project) => project.id !== projectId),
    items: data.items.filter((item) => item.projectId !== projectId),
  });
}

export function createPlannerItem(projectId: string, input: PlannerItemInput): PlannerItem {
  const data = readProjectPlannerData();
  if (!data.projects.some((project) => project.id === projectId)) {
    throw new Error('Project not found.');
  }
  const title = cleanText(input?.title, 240);
  if (!title) throw new Error('Item title is required.');
  const now = Date.now();
  const item: PlannerItem = {
    id: randomUUID(),
    projectId,
    title,
    description: cleanText(input?.description, 20_000),
    priority: PRIORITIES.has(input?.priority as PlannerPriority) ? input.priority as PlannerPriority : 'medium',
    status: STATUSES.has(input?.status as PlannerStatus) ? input.status as PlannerStatus : 'idea',
    tags: normalizeTags(input?.tags),
    createdAt: now,
    updatedAt: now,
  };
  writeProjectPlannerData({ ...data, items: [...data.items, item] });
  return item;
}

export function updatePlannerItem(itemId: string, input: Partial<PlannerItemInput>): PlannerItem {
  const data = readProjectPlannerData();
  const index = data.items.findIndex((item) => item.id === itemId);
  if (index < 0) throw new Error('Item not found.');
  const current = data.items[index];
  const title = input.title === undefined ? current.title : cleanText(input.title, 240);
  if (!title) throw new Error('Item title is required.');

  const updated: PlannerItem = {
    ...current,
    title,
    description: input.description === undefined ? current.description : cleanText(input.description, 20_000),
    priority: input.priority !== undefined && PRIORITIES.has(input.priority) ? input.priority : current.priority,
    status: input.status !== undefined && STATUSES.has(input.status) ? input.status : current.status,
    tags: input.tags === undefined ? current.tags : normalizeTags(input.tags),
    updatedAt: Date.now(),
  };
  const items = [...data.items];
  items[index] = updated;
  writeProjectPlannerData({ ...data, items });
  return updated;
}

export function deletePlannerItem(itemId: string): void {
  const data = readProjectPlannerData();
  writeProjectPlannerData({ ...data, items: data.items.filter((item) => item.id !== itemId) });
}

export function convertProjectToRepository(projectId: string, repoPath: string): PlannerProject {
  const data = readProjectPlannerData();
  const index = data.projects.findIndex((project) => project.id === projectId);
  if (index < 0) throw new Error('Project not found.');
  if (data.projects[index].kind !== 'planned') throw new Error('Project already has a repository.');

  const resolvedPath = normalizeRepoPath(repoPath);
  if (!resolvedPath) throw new Error('Repository path is required.');
  const repoKey = getRepositoryProjectKey(resolvedPath);
  if (data.projects.some((project, projectIndex) => (
    projectIndex !== index
    && project.repoPath
    && getRepositoryProjectKey(project.repoPath) === repoKey
  ))) {
    throw new Error('A planning project already exists for this repository.');
  }

  const updated: PlannerProject = {
    ...data.projects[index],
    kind: 'repository',
    repoPath: resolvedPath,
    updatedAt: Date.now(),
  };
  const projects = [...data.projects];
  projects[index] = updated;
  writeProjectPlannerData({ ...data, projects });
  return updated;
}

export function validateProjectFolderName(value: unknown): string {
  const folderName = cleanText(value, 100);
  if (!folderName) throw new Error('Project folder name is required.');
  if (folderName === '.' || folderName === '..' || /[<>:"/\\|?*\u0000-\u001F]/.test(folderName)) {
    throw new Error('Project folder name contains invalid characters.');
  }
  if (/[. ]$/.test(folderName)) {
    throw new Error('Project folder name must not end with a dot or space.');
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(folderName)) {
    throw new Error('Project folder name is reserved by the operating system.');
  }
  return folderName;
}
