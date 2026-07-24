import { randomUUID } from 'crypto';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { writeTextFileAtomically } from './atomicFile';
import { ensureOpenGitControlReadme, getOpenGitControlAssetPath } from './openGitControlDirectory';
import { ApiError } from './planningApiTypes';
import { readStoreData } from './repoStore';
import {
  cleanPlannerText,
  createEmptyProjectPlannerData,
  getRepositoryProjectKey,
  isPlannerPriority,
  isPlannerStatus,
  normalizePlannerRepoPath,
  normalizePlannerTags,
  normalizeProjectPlannerData,
  type PlannerItem,
  type PlannerItemInput,
  type PlannerProject,
  type PlannerStatus,
  type ProjectPlannerData,
} from './projectPlannerData';

export {
  PLANNER_PRIORITIES,
  PLANNER_STATUSES,
  getRepositoryProjectKey,
  normalizeProjectPlannerData,
  type PlannerItem,
  type PlannerItemInput,
  type PlannerPriority,
  type PlannerProject,
  type PlannerStatus,
  type ProjectPlannerData,
} from './projectPlannerData';

const PLANNING_FILE = 'planning.json';

const getLegacyStorePath = (): string => path.join(app.getPath('userData'), 'project-planner.json');
const getPlanningPath = (repoPath: string): string => getOpenGitControlAssetPath(repoPath, PLANNING_FILE, 'Repository planning path');
const plannerDataListeners = new Set<() => void>();
const knownRepositoryPaths = new Map<string, string>();
const rememberRepositoryPath = (repoPath: string): void => {
  if (repositoryExists(repoPath)) knownRepositoryPaths.set(getRepositoryProjectKey(repoPath), repoPath);
};
const notifyDataChanged = (): void => {
  for (const listener of plannerDataListeners) {
    try {
      listener();
    } catch {
      // A UI refresh failure must not change the result of an already committed write.
    }
  }
};

export function onProjectPlannerDataChanged(listener: () => void): () => void {
  plannerDataListeners.add(listener);
  return () => plannerDataListeners.delete(listener);
}

const parsePlannerData = (raw: string, fileLabel: string): ProjectPlannerData => {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') throw new Error(`${fileLabel} is not a JSON object.`);
  const candidate = parsed as Partial<ProjectPlannerData>;
  if (candidate.version !== 1 || !Array.isArray(candidate.projects) || !Array.isArray(candidate.items)) {
    throw new Error(`${fileLabel} has an unsupported or incomplete schema.`);
  }
  const normalized = normalizeProjectPlannerData(candidate);
  if (normalized.projects.length !== candidate.projects.length || normalized.items.length !== candidate.items.length) {
    throw new Error(`${fileLabel} contains invalid or orphaned records.`);
  }
  return normalized;
};

const readLegacyData = (): ProjectPlannerData => {
  try {
    return parsePlannerData(fs.readFileSync(getLegacyStorePath(), 'utf8'), 'Planner data');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return createEmptyProjectPlannerData();
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Planner data could not be read safely; the existing file was left untouched. ${message}`);
  }
};

const writeLegacyData = (data: ProjectPlannerData): ProjectPlannerData => {
  const normalized = normalizeProjectPlannerData(data);
  writeTextFileAtomically(getLegacyStorePath(), JSON.stringify(normalized, null, 2));
  return normalized;
};

const repositoryExists = (repoPath: string): boolean => {
  try {
    return fs.statSync(repoPath).isDirectory();
  } catch {
    return false;
  }
};

const plannerRepositoryPaths = (legacyData: ProjectPlannerData): string[] => {
  const paths = [
    ...readStoreData().repos.map((repo) => repo.path),
    ...knownRepositoryPaths.values(),
    ...legacyData.projects.filter((project) => project.kind === 'repository').map((project) => project.repoPath || ''),
  ];
  const unique = new Map<string, string>();
  for (const repoPath of paths) {
    if (!repoPath || !repositoryExists(repoPath)) continue;
    unique.set(getRepositoryProjectKey(repoPath), repoPath);
  }
  return [...unique.values()];
};

const normalizeRepositoryData = (data: ProjectPlannerData, repoPath: string): { data: ProjectPlannerData; changed: boolean } => {
  const repository = data.projects.find((project) => project.kind === 'repository');
  if (!repository) return { data: createEmptyProjectPlannerData(), changed: data.projects.length > 0 || data.items.length > 0 };
  const physicalPath = fs.realpathSync(repoPath);
  const requiresNewIds = !repository.repoPath || getRepositoryProjectKey(repository.repoPath) !== getRepositoryProjectKey(physicalPath);
  const projectId = requiresNewIds ? randomUUID() : repository.id;
  const items = data.items
    .filter((item) => item.projectId === repository.id)
    .map((item) => ({ ...item, id: requiresNewIds ? randomUUID() : item.id, projectId }));
  const project: PlannerProject = { ...repository, id: projectId, kind: 'repository', repoPath: physicalPath };
  const normalized = { version: 1 as const, projects: [project], items };
  const changed = requiresNewIds || data.projects.length !== 1 || data.items.length !== items.length || repository.repoPath !== physicalPath;
  return { data: normalized, changed };
};

const readRepositoryData = (repoPath: string): ProjectPlannerData => {
  const planningPath = getPlanningPath(repoPath);
  if (!fs.existsSync(planningPath)) return createEmptyProjectPlannerData();
  try {
    const parsed = parsePlannerData(fs.readFileSync(planningPath, 'utf8'), 'Repository planning data');
    const normalized = normalizeRepositoryData(parsed, repoPath);
    if (normalized.changed) writeTextFileAtomically(planningPath, `${JSON.stringify(normalized.data, null, 2)}\n`);
    return normalized.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Repository planning data could not be read safely; the existing file was left untouched. ${message}`);
  }
};

const writeRepositoryData = (repoPath: string, data: ProjectPlannerData, notify = true): ProjectPlannerData => {
  rememberRepositoryPath(repoPath);
  const normalized = normalizeRepositoryData(normalizeProjectPlannerData(data), repoPath).data;
  const planningPath = getPlanningPath(repoPath);
  if (normalized.projects.length === 0) {
    fs.rmSync(planningPath, { force: true });
  } else {
    writeTextFileAtomically(planningPath, `${JSON.stringify(normalized, null, 2)}\n`);
    ensureOpenGitControlReadme(repoPath);
  }
  if (notify) notifyDataChanged();
  return normalized;
};

const mergeLegacyProject = (existing: ProjectPlannerData, legacyProject: PlannerProject, legacyItems: PlannerItem[], repoPath: string): ProjectPlannerData => {
  if (existing.projects.length === 0) return normalizeRepositoryData({ version: 1, projects: [legacyProject], items: legacyItems }, repoPath).data;
  const project = existing.projects[0];
  const items = [...existing.items];
  const itemIds = new Set(items.map((item) => item.id));
  for (const item of legacyItems) {
    const duplicate = items.find((candidate) => candidate.id === item.id);
    if (duplicate) {
      if (item.updatedAt > duplicate.updatedAt) Object.assign(duplicate, { ...item, projectId: project.id });
      continue;
    }
    items.push({ ...item, id: itemIds.has(item.id) ? randomUUID() : item.id, projectId: project.id });
    itemIds.add(items[items.length - 1].id);
  }
  return { version: 1, projects: [project], items };
};

const migrateLegacyRepositoryData = (legacy: ProjectPlannerData): ProjectPlannerData => {
  const migratedIds = new Set<string>();
  for (const project of legacy.projects) {
    if (project.kind !== 'repository' || !project.repoPath || !repositoryExists(project.repoPath)) continue;
    try {
      const existing = readRepositoryData(project.repoPath);
      const merged = mergeLegacyProject(
        existing,
        project,
        legacy.items.filter((item) => item.projectId === project.id),
        project.repoPath,
      );
      writeRepositoryData(project.repoPath, merged, false);
      rememberRepositoryPath(project.repoPath);
      migratedIds.add(project.id);
    } catch {
      // Keep this entry in the legacy file so a later run can retry safely.
    }
  }
  if (migratedIds.size === 0) return legacy;
  const remaining: ProjectPlannerData = {
    version: 1,
    projects: legacy.projects.filter((project) => !migratedIds.has(project.id)),
    items: legacy.items.filter((item) => !migratedIds.has(item.projectId)),
  };
  if (remaining.projects.length === 0 && remaining.items.length === 0) fs.rmSync(getLegacyStorePath(), { force: true });
  else writeLegacyData(remaining);
  return remaining;
};

export function readProjectPlannerData(): ProjectPlannerData {
  const legacyBeforeMigration = readLegacyData();
  const pathsBeforeMigration = plannerRepositoryPaths(legacyBeforeMigration);
  const legacy = migrateLegacyRepositoryData(legacyBeforeMigration);
  const projects = legacy.projects.filter((project) => project.kind === 'planned');
  const items = legacy.items.filter((item) => projects.some((project) => project.id === item.projectId));
  for (const repoPath of [
    ...new Map([...pathsBeforeMigration, ...plannerRepositoryPaths(legacy)].map((repoPath) => [getRepositoryProjectKey(repoPath), repoPath])).values(),
  ]) {
    const repositoryData = readRepositoryData(repoPath);
    projects.push(...repositoryData.projects);
    items.push(...repositoryData.items);
  }
  return normalizeProjectPlannerData({ version: 1, projects, items });
}

/** Persists explicit bulk data by splitting repository data into its repositories. */
export function writeProjectPlannerData(data: ProjectPlannerData): ProjectPlannerData {
  const normalized = normalizeProjectPlannerData(data);
  const existingLegacy = readLegacyData();
  writeLegacyData({
    version: 1,
    projects: [
      ...existingLegacy.projects.filter((project) => project.kind === 'repository'),
      ...normalized.projects.filter((project) => project.kind === 'planned'),
    ],
    items: [
      ...existingLegacy.items.filter((item) => existingLegacy.projects.some((project) => project.kind === 'repository' && project.id === item.projectId)),
      ...normalized.items.filter((item) => normalized.projects.some((project) => project.kind === 'planned' && project.id === item.projectId)),
    ],
  });
  for (const project of normalized.projects.filter((candidate) => candidate.kind === 'repository' && candidate.repoPath)) {
    writeRepositoryData(project.repoPath!, { version: 1, projects: [project], items: normalized.items.filter((item) => item.projectId === project.id) }, false);
  }
  notifyDataChanged();
  return readProjectPlannerData();
}

export function ensureRepositoryProjectInData(data: ProjectPlannerData, repoPath: string): PlannerProject {
  const resolvedPath = normalizePlannerRepoPath(repoPath);
  if (!resolvedPath) throw new ApiError(400, 'REPOSITORY_PATH_REQUIRED', 'Repository path is required.');
  const existing = data.projects.find((project) => project.repoPath && getRepositoryProjectKey(project.repoPath) === getRepositoryProjectKey(resolvedPath));
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
  if (!repositoryExists(repoPath)) throw new ApiError(404, 'REPOSITORY_NOT_FOUND', 'Repository path is not accessible.');
  rememberRepositoryPath(repoPath);
  const data = readRepositoryData(repoPath);
  if (data.projects[0]) return data.projects[0];
  const project = ensureRepositoryProjectInData(data, repoPath);
  return writeRepositoryData(repoPath, data).projects[0] || project;
}

export function createPlannedProject(input: { name: string; description?: string }): PlannerProject {
  const name = cleanPlannerText(input?.name, 160);
  if (!name) throw new ApiError(400, 'PROJECT_NAME_REQUIRED', 'Project name is required.');
  const data = readLegacyData();
  const now = Date.now();
  const project: PlannerProject = {
    id: randomUUID(),
    name,
    description: cleanPlannerText(input?.description, 8_000),
    kind: 'planned',
    repoPath: null,
    createdAt: now,
    updatedAt: now,
  };
  writeLegacyData({ ...data, projects: [...data.projects, project] });
  notifyDataChanged();
  return project;
}

type Storage = { repoPath: string | null; data: ProjectPlannerData; project: PlannerProject };
const findProjectStorage = (projectId: string): Storage => {
  readProjectPlannerData();
  const legacy = readLegacyData();
  const planned = legacy.projects.find((project) => project.id === projectId && project.kind === 'planned');
  if (planned) return { repoPath: null, data: legacy, project: planned };
  for (const repoPath of plannerRepositoryPaths(legacy)) {
    const data = readRepositoryData(repoPath);
    const project = data.projects.find((candidate) => candidate.id === projectId);
    if (project) return { repoPath, data, project };
  }
  throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
};
const writeStorage = (storage: Storage, data: ProjectPlannerData): ProjectPlannerData => {
  if (storage.repoPath) return writeRepositoryData(storage.repoPath, data);
  const written = writeLegacyData(data);
  notifyDataChanged();
  return written;
};

export function updatePlannerProject(projectId: string, input: { name?: string; description?: string }): PlannerProject {
  const storage = findProjectStorage(projectId);
  const name = input.name === undefined ? storage.project.name : cleanPlannerText(input.name, 160);
  if (!name) throw new ApiError(400, 'PROJECT_NAME_REQUIRED', 'Project name is required.');
  const updated = {
    ...storage.project,
    name,
    description: input.description === undefined ? storage.project.description : cleanPlannerText(input.description, 8_000),
    updatedAt: Date.now(),
  };
  writeStorage(storage, { ...storage.data, projects: storage.data.projects.map((project) => (project.id === projectId ? updated : project)) });
  return updated;
}

export function deletePlannerProject(projectId: string): void {
  const storage = findProjectStorage(projectId);
  writeStorage(storage, {
    ...storage.data,
    projects: storage.data.projects.filter((project) => project.id !== projectId),
    items: storage.data.items.filter((item) => item.projectId !== projectId),
  });
}

export function deleteRepositoryPlannerProjectByPath(repoPath: string): { deletedProjectCount: number; deletedItemCount: number } {
  const legacy = readLegacyData();
  const repoKey = getRepositoryProjectKey(repoPath);
  const legacyProjects = legacy.projects.filter((project) => project.repoPath && getRepositoryProjectKey(project.repoPath) === repoKey);
  const legacyItemCount = legacy.items.filter((item) => legacyProjects.some((project) => project.id === item.projectId)).length;
  if (legacyProjects.length)
    writeLegacyData({
      ...legacy,
      projects: legacy.projects.filter((project) => !legacyProjects.includes(project)),
      items: legacy.items.filter((item) => !legacyProjects.some((project) => project.id === item.projectId)),
    });
  let repositoryData: ProjectPlannerData = createEmptyProjectPlannerData();
  try {
    repositoryData = readRepositoryData(repoPath);
    writeRepositoryData(repoPath, createEmptyProjectPlannerData(), false);
  } catch (error) {
    if (!legacyProjects.length) throw error;
  }
  if (legacyProjects.length || repositoryData.projects.length) notifyDataChanged();
  return { deletedProjectCount: legacyProjects.length + repositoryData.projects.length, deletedItemCount: legacyItemCount + repositoryData.items.length };
}

/** Adds a validated item to an in-memory document without persisting it. */
export function createPlannerItemInData(data: ProjectPlannerData, projectId: string, input: PlannerItemInput): PlannerItem {
  if (!data.projects.some((project) => project.id === projectId)) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  const title = cleanPlannerText(input?.title, 240);
  if (!title) throw new ApiError(400, 'TITLE_REQUIRED', 'Item title is required.');
  const now = Date.now();
  const item: PlannerItem = {
    id: randomUUID(),
    projectId,
    title,
    description: cleanPlannerText(input?.description, 20_000),
    priority: isPlannerPriority(input?.priority) ? input.priority : 'medium',
    status: isPlannerStatus(input?.status) ? input.status : 'idea',
    tags: normalizePlannerTags(input?.tags),
    createdAt: now,
    updatedAt: now,
  };
  data.items = [...data.items, item];
  return item;
}

export function createPlannerItem(projectId: string, input: PlannerItemInput): PlannerItem {
  const storage = findProjectStorage(projectId);
  const item = createPlannerItemInData(storage.data, projectId, input);
  writeStorage(storage, storage.data);
  return item;
}

export type PlannerItemUpdateOptions = { projectId?: string };
export function updatePlannerItemInData(
  data: ProjectPlannerData,
  itemId: string,
  input: Partial<PlannerItemInput>,
  options: PlannerItemUpdateOptions = {},
): PlannerItem {
  const index = data.items.findIndex((item) => item.id === itemId);
  if (index < 0) throw new ApiError(404, 'TODO_NOT_FOUND', 'Todo not found.');
  const current = data.items[index];
  const title = input.title === undefined ? current.title : cleanPlannerText(input.title, 240);
  if (!title) throw new ApiError(400, 'TITLE_REQUIRED', 'Item title is required.');
  const projectId = options.projectId === undefined ? current.projectId : cleanPlannerText(options.projectId, 100);
  if (!data.projects.some((project) => project.id === projectId)) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  const updated: PlannerItem = {
    ...current,
    projectId,
    title,
    description: input.description === undefined ? current.description : cleanPlannerText(input.description, 20_000),
    priority: input.priority !== undefined && isPlannerPriority(input.priority) ? input.priority : current.priority,
    status: input.status !== undefined && isPlannerStatus(input.status) ? input.status : current.status,
    tags: input.tags === undefined ? current.tags : normalizePlannerTags(input.tags),
    updatedAt: Date.now(),
  };
  data.items = data.items.map((item, itemIndex) => (itemIndex === index ? updated : item));
  return updated;
}

const findItemStorage = (itemId: string): Storage => {
  const data = readProjectPlannerData();
  const item = data.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new ApiError(404, 'TODO_NOT_FOUND', 'Todo not found.');
  return findProjectStorage(item.projectId);
};

export function updatePlannerItem(itemId: string, input: Partial<PlannerItemInput>, options: PlannerItemUpdateOptions = {}): PlannerItem {
  const source = findItemStorage(itemId);
  if (!options.projectId || options.projectId === source.project.id) {
    const updated = updatePlannerItemInData(source.data, itemId, input, options);
    writeStorage(source, source.data);
    return updated;
  }
  const target = findProjectStorage(options.projectId);
  if (source.repoPath === target.repoPath) {
    const updated = updatePlannerItemInData(source.data, itemId, input, { projectId: target.project.id });
    writeStorage(source, source.data);
    return updated;
  }
  const updated = updatePlannerItemInData(source.data, itemId, input);
  source.data.items = source.data.items.filter((item) => item.id !== itemId);
  const moved = { ...updated, projectId: target.project.id, updatedAt: Date.now() };
  target.data.items = [...target.data.items, moved];
  writeStorage(target, target.data);
  writeStorage(source, source.data);
  return moved;
}

export function movePlannerItem(itemId: string, input: { projectId?: string; status?: PlannerStatus }): PlannerItem {
  return updatePlannerItem(itemId, { status: input.status }, { projectId: input.projectId });
}

export function deletePlannerItem(itemId: string): void {
  const storage = findItemStorage(itemId);
  writeStorage(storage, { ...storage.data, items: storage.data.items.filter((item) => item.id !== itemId) });
}

export function convertProjectToRepository(projectId: string, repoPath: string): PlannerProject {
  const source = findProjectStorage(projectId);
  if (source.project.kind !== 'planned') throw new ApiError(409, 'PROJECT_ALREADY_REPOSITORY', 'Project already has a repository.');
  if (!repositoryExists(repoPath)) throw new ApiError(404, 'REPOSITORY_NOT_FOUND', 'Repository path is not accessible.');
  const destination = readRepositoryData(repoPath);
  if (destination.projects.length) throw new ApiError(409, 'REPOSITORY_PROJECT_EXISTS', 'A planning project already exists for this repository.');
  const updated = { ...source.project, kind: 'repository' as const, repoPath: fs.realpathSync(repoPath), updatedAt: Date.now() };
  writeRepositoryData(repoPath, { version: 1, projects: [updated], items: source.data.items.filter((item) => item.projectId === projectId) }, false);
  writeStorage(source, {
    ...source.data,
    projects: source.data.projects.filter((project) => project.id !== projectId),
    items: source.data.items.filter((item) => item.projectId !== projectId),
  });
  return updated;
}

export function validateProjectFolderName(value: unknown): string {
  const folderName = cleanPlannerText(value, 100);
  if (!folderName) throw new ApiError(400, 'PROJECT_FOLDER_REQUIRED', 'Project folder name is required.');
  // eslint-disable-next-line no-control-regex -- Windows folder names must reject ASCII control characters.
  if (folderName === '.' || folderName === '..' || /[<>:"/\\|?*\u0000-\u001F]/.test(folderName))
    throw new ApiError(400, 'INVALID_PROJECT_FOLDER', 'Project folder name contains invalid characters.');
  if (/[. ]$/.test(folderName)) throw new ApiError(400, 'INVALID_PROJECT_FOLDER', 'Project folder name must not end with a dot or space.');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(folderName))
    throw new ApiError(400, 'INVALID_PROJECT_FOLDER', 'Project folder name is reserved by the operating system.');
  return folderName;
}
