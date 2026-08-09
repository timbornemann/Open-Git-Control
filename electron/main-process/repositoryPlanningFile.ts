import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { writeTextFileAtomically } from './atomicFile';
import {
  createEmptyProjectPlannerData,
  normalizePlannerRepoPath,
  normalizeProjectPlannerData,
  type PlannerProject,
  type ProjectPlannerData,
} from './projectPlannerData';

/**
 * Repository planning files are meant to be committed and shared with a team,
 * so their content must not depend on the machine that wrote them. The absolute
 * repository path is therefore never stored inside the file; it is re-attached
 * from the directory the file was read from. Identifiers are kept exactly as
 * committed so that pulling a colleague's file does not immediately rewrite the
 * working copy.
 */

export const REPOSITORY_PLANNING_FILE = 'planning.json';

export function parsePlannerData(raw: string, fileLabel: string, prepare: (value: unknown) => unknown = (value) => value): ProjectPlannerData {
  const parsed = prepare(JSON.parse(raw) as unknown);
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
}

/**
 * A repository planning file always describes the repository it lives in, even
 * when it was committed on a machine with a different checkout path.
 */
const withRepositoryIdentity = (value: unknown, repoPath: string): unknown => {
  if (!value || typeof value !== 'object') return value;
  const candidate = value as Partial<ProjectPlannerData>;
  const [first, ...rest] = Array.isArray(candidate.projects) ? candidate.projects : [];
  if (!first || typeof first !== 'object') return value;
  return { ...candidate, projects: [{ ...(first as PlannerProject), kind: 'repository', repoPath }, ...rest] };
};

/** Reduces planner data to the single project a repository file may describe. */
export function normalizeRepositoryPlannerData(data: ProjectPlannerData, repoPath: string): ProjectPlannerData {
  const repository = data.projects.find((project) => project.kind === 'repository');
  const normalizedRepoPath = normalizePlannerRepoPath(repoPath);
  if (!repository || !normalizedRepoPath) return createEmptyProjectPlannerData();
  const project: PlannerProject = { ...repository, kind: 'repository', repoPath: normalizedRepoPath };
  return { version: 1, projects: [project], items: data.items.filter((item) => item.projectId === repository.id) };
}

export function readRepositoryPlanningFile(planningPath: string, repoPath: string): ProjectPlannerData {
  let raw: string;
  try {
    raw = fs.readFileSync(planningPath, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return createEmptyProjectPlannerData();
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Repository planning data could not be read safely; the existing file was left untouched. ${message}`);
  }
  try {
    return normalizeRepositoryPlannerData(
      parsePlannerData(raw, 'Repository planning data', (value) => withRepositoryIdentity(value, repoPath)),
      repoPath,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Repository planning data could not be read safely; the existing file was left untouched. ${message}`);
  }
}

/** Serializes without the machine-local repository path so the file stays identical on every checkout. */
export function serializeRepositoryPlanningFile(data: ProjectPlannerData): string {
  const projects = data.projects.map(({ repoPath: _repoPath, ...project }) => project);
  return `${JSON.stringify({ version: 1, projects, items: data.items }, null, 2)}\n`;
}

export function writeRepositoryPlanningFile(planningPath: string, data: ProjectPlannerData): void {
  writeTextFileAtomically(planningPath, serializeRepositoryPlanningFile(data));
}

/**
 * Gives a repository its own identifiers. Shared files legitimately contain the
 * same identifiers on every checkout, so only a second repository that already
 * uses them (a clone or a copied folder) needs to be renumbered.
 */
export function renumberRepositoryPlannerData(data: ProjectPlannerData): ProjectPlannerData {
  const project = data.projects[0];
  if (!project) return data;
  const projectId = randomUUID();
  return {
    version: 1,
    projects: [{ ...project, id: projectId }],
    items: data.items.map((item) => ({ ...item, id: randomUUID(), projectId })),
  };
}
