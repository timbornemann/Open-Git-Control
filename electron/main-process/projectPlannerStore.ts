import { app } from 'electron';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { writeTextFileAtomically } from './atomicFile';
import { ApiError } from './planningApiTypes';

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

const EMPTY_DATA: ProjectPlannerData = {
  version: 1,
  projects: [],
  items: [],
};

export const PLANNER_PRIORITIES: PlannerPriority[] = ['low', 'medium', 'high', 'urgent'];
export const PLANNER_STATUSES: PlannerStatus[] = ['idea', 'bug', 'planned', 'in-progress', 'blocked', 'done'];

const PRIORITIES = new Set<PlannerPriority>(PLANNER_PRIORITIES);
const STATUSES = new Set<PlannerStatus>(PLANNER_STATUSES);

const cleanText = (value: unknown, maxLength: number): string => (typeof value === 'string' ? value.trim().slice(0, maxLength) : '');

const cleanTimestamp = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;

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
      priority: PRIORITIES.has(source.priority as PlannerPriority) ? (source.priority as PlannerPriority) : 'medium',
      status: STATUSES.has(source.status as PlannerStatus) ? (source.status as PlannerStatus) : 'idea',
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

const plannerDataListeners = new Set<() => void>();

export function onProjectPlannerDataChanged(listener: () => void): () => void {
  plannerDataListeners.add(listener);
  return () => plannerDataListeners.delete(listener);
}

export function readProjectPlannerData(): ProjectPlannerData {
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('Planner data is not a JSON object.');
    const candidate = parsed as Partial<ProjectPlannerData>;
    if (candidate.version !== 1 || !Array.isArray(candidate.projects) || !Array.isArray(candidate.items)) {
      throw new Error('Planner data has an unsupported or incomplete schema.');
    }
    const normalized = normalizeProjectPlannerData(candidate);
    if (normalized.projects.length !== candidate.projects.length || normalized.items.length !== candidate.items.length) {
      throw new Error('Planner data contains invalid or orphaned records.');
    }
    return normalized;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return { ...EMPTY_DATA };
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Planner data could not be read safely; the existing file was left untouched. ${message}`);
  }
}

export function writeProjectPlannerData(data: ProjectPlannerData): ProjectPlannerData {
  const normalized = normalizeProjectPlannerData(data);
  const storePath = getStorePath();
  writeTextFileAtomically(storePath, JSON.stringify(normalized, null, 2));
  for (const listener of plannerDataListeners) {
    try {
      listener();
    } catch {
      // Persistence succeeded; a UI notification failure must not turn the
      // committed mutation into an apparent write failure.
    }
  }
  return normalized;
}

/** Adds a repository project to the supplied in-memory document when needed. */
export function ensureRepositoryProjectInData(data: ProjectPlannerData, repoPath: string): PlannerProject {
  const resolvedPath = normalizeRepoPath(repoPath);
  if (!resolvedPath) throw new ApiError(400, 'REPOSITORY_PATH_REQUIRED', 'Repository path is required.');
  const repoKey = getRepositoryProjectKey(resolvedPath);
  const existing = data.projects.find((project) => project.repoPath && getRepositoryProjectKey(project.repoPath) === repoKey);
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
  data.projects = [...data.projects, project];
  return project;
}

export function ensureRepositoryProject(repoPath: string): PlannerProject {
  const data = readProjectPlannerData();
  const projectCount = data.projects.length;
  const project = ensureRepositoryProjectInData(data, repoPath);
  if (data.projects.length !== projectCount) {
    writeProjectPlannerData(data);
  }
  return project;
}

export function createPlannedProject(input: { name: string; description?: string }): PlannerProject {
  const name = cleanText(input?.name, 160);
  if (!name) throw new ApiError(400, 'PROJECT_NAME_REQUIRED', 'Project name is required.');
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

export function updatePlannerProject(projectId: string, input: { name?: string; description?: string }): PlannerProject {
  const data = readProjectPlannerData();
  const index = data.projects.findIndex((project) => project.id === projectId);
  if (index < 0) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  const current = data.projects[index];
  const name = input.name === undefined ? current.name : cleanText(input.name, 160);
  if (!name) throw new ApiError(400, 'PROJECT_NAME_REQUIRED', 'Project name is required.');

  const updated: PlannerProject = {
    ...current,
    name,
    description: input.description === undefined ? current.description : cleanText(input.description, 8_000),
    updatedAt: Date.now(),
  };
  const projects = [...data.projects];
  projects[index] = updated;
  writeProjectPlannerData({ ...data, projects });
  return updated;
}

export function deletePlannerProject(projectId: string): void {
  const data = readProjectPlannerData();
  if (!data.projects.some((project) => project.id === projectId)) {
    throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  }
  writeProjectPlannerData({
    ...data,
    projects: data.projects.filter((project) => project.id !== projectId),
    items: data.items.filter((item) => item.projectId !== projectId),
  });
}

export function deleteRepositoryPlannerProjectByPath(repoPath: string): { deletedProjectCount: number; deletedItemCount: number } {
  const resolvedPath = normalizeRepoPath(repoPath);
  if (!resolvedPath) throw new ApiError(400, 'REPOSITORY_PATH_REQUIRED', 'Repository path is required.');

  const data = readProjectPlannerData();
  const repoKey = getRepositoryProjectKey(resolvedPath);
  const projectIds = new Set(
    data.projects.filter((project) => project.repoPath && getRepositoryProjectKey(project.repoPath) === repoKey).map((project) => project.id),
  );

  if (projectIds.size === 0) {
    return { deletedProjectCount: 0, deletedItemCount: 0 };
  }

  const deletedItemCount = data.items.filter((item) => projectIds.has(item.projectId)).length;
  writeProjectPlannerData({
    ...data,
    projects: data.projects.filter((project) => !projectIds.has(project.id)),
    items: data.items.filter((item) => !projectIds.has(item.projectId)),
  });

  return { deletedProjectCount: projectIds.size, deletedItemCount };
}

export function createPlannerItem(projectId: string, input: PlannerItemInput): PlannerItem {
  const data = readProjectPlannerData();
  const item = createPlannerItemInData(data, projectId, input);
  writeProjectPlannerData(data);
  return item;
}

/** Adds a validated item to an in-memory document without persisting it. */
export function createPlannerItemInData(data: ProjectPlannerData, projectId: string, input: PlannerItemInput): PlannerItem {
  if (!data.projects.some((project) => project.id === projectId)) {
    throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  }
  const title = cleanText(input?.title, 240);
  if (!title) throw new ApiError(400, 'TITLE_REQUIRED', 'Item title is required.');
  const now = Date.now();
  const item: PlannerItem = {
    id: randomUUID(),
    projectId,
    title,
    description: cleanText(input?.description, 20_000),
    priority: PRIORITIES.has(input?.priority as PlannerPriority) ? (input.priority as PlannerPriority) : 'medium',
    status: STATUSES.has(input?.status as PlannerStatus) ? (input.status as PlannerStatus) : 'idea',
    tags: normalizeTags(input?.tags),
    createdAt: now,
    updatedAt: now,
  };
  data.items = [...data.items, item];
  return item;
}

export type PlannerItemUpdateOptions = {
  projectId?: string;
};

/** Applies an item update to an in-memory document without persisting it. */
export function updatePlannerItemInData(
  data: ProjectPlannerData,
  itemId: string,
  input: Partial<PlannerItemInput>,
  options: PlannerItemUpdateOptions = {},
): PlannerItem {
  const index = data.items.findIndex((item) => item.id === itemId);
  if (index < 0) throw new ApiError(404, 'TODO_NOT_FOUND', 'Item not found.');
  const current = data.items[index];
  const title = input.title === undefined ? current.title : cleanText(input.title, 240);
  if (!title) throw new ApiError(400, 'TITLE_REQUIRED', 'Item title is required.');

  const projectId = options.projectId === undefined ? current.projectId : cleanText(options.projectId, 100);
  if (!data.projects.some((project) => project.id === projectId)) {
    throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  }

  const updated: PlannerItem = {
    ...current,
    projectId,
    title,
    description: input.description === undefined ? current.description : cleanText(input.description, 20_000),
    priority: input.priority !== undefined && PRIORITIES.has(input.priority) ? input.priority : current.priority,
    status: input.status !== undefined && STATUSES.has(input.status) ? input.status : current.status,
    tags: input.tags === undefined ? current.tags : normalizeTags(input.tags),
    updatedAt: Date.now(),
  };
  const items = [...data.items];
  items[index] = updated;
  data.items = items;
  return updated;
}

export function updatePlannerItem(itemId: string, input: Partial<PlannerItemInput>, options: PlannerItemUpdateOptions = {}): PlannerItem {
  const data = readProjectPlannerData();
  const updated = updatePlannerItemInData(data, itemId, input, options);
  writeProjectPlannerData(data);
  return updated;
}

export function movePlannerItem(itemId: string, input: { projectId?: string; status?: PlannerStatus }): PlannerItem {
  const data = readProjectPlannerData();
  const updated = updatePlannerItemInData(data, itemId, { status: input.status }, { projectId: input.projectId });
  writeProjectPlannerData(data);
  return updated;
}

export function deletePlannerItem(itemId: string): void {
  const data = readProjectPlannerData();
  writeProjectPlannerData({ ...data, items: data.items.filter((item) => item.id !== itemId) });
}

export function convertProjectToRepository(projectId: string, repoPath: string): PlannerProject {
  const data = readProjectPlannerData();
  const index = data.projects.findIndex((project) => project.id === projectId);
  if (index < 0) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  if (data.projects[index].kind !== 'planned') throw new ApiError(409, 'PROJECT_ALREADY_REPOSITORY', 'Project already has a repository.');

  const resolvedPath = normalizeRepoPath(repoPath);
  if (!resolvedPath) throw new ApiError(400, 'REPOSITORY_PATH_REQUIRED', 'Repository path is required.');
  const repoKey = getRepositoryProjectKey(resolvedPath);
  if (data.projects.some((project, projectIndex) => projectIndex !== index && project.repoPath && getRepositoryProjectKey(project.repoPath) === repoKey)) {
    throw new ApiError(409, 'REPOSITORY_PROJECT_EXISTS', 'A planning project already exists for this repository.');
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
  if (!folderName) throw new ApiError(400, 'PROJECT_FOLDER_REQUIRED', 'Project folder name is required.');
  // eslint-disable-next-line no-control-regex -- Windows folder names must reject ASCII control characters.
  if (folderName === '.' || folderName === '..' || /[<>:"/\\|?*\u0000-\u001F]/.test(folderName)) {
    throw new ApiError(400, 'INVALID_PROJECT_FOLDER', 'Project folder name contains invalid characters.');
  }
  if (/[. ]$/.test(folderName)) {
    throw new ApiError(400, 'INVALID_PROJECT_FOLDER', 'Project folder name must not end with a dot or space.');
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(folderName)) {
    throw new ApiError(400, 'INVALID_PROJECT_FOLDER', 'Project folder name is reserved by the operating system.');
  }
  return folderName;
}
