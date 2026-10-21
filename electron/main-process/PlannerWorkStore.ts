import { createHash } from 'node:crypto';
import type { PlannerItem, PlannerProject } from '../../src/types/projectPlanner';
import { getOpenGitControlAssetPath } from './openGitControlDirectory';
import { readRepositoryPlanningFile, writeRepositoryPlanningFile } from './repositoryPlanningFile';
import { normalizeProjectPlannerData } from './projectPlannerData';
import { notifyProjectPlannerDataChanged } from './projectPlannerStore';

export const workDigest = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(value) ?? 'undefined')
    .digest('hex');
export const workPlanningPath = (repo: string) => getOpenGitControlAssetPath(repo, 'planning.json', 'Planner work');
export const workContent = (item: PlannerItem) => [item.title, item.description, item.priority, item.tags];

export function loadWorkItem(repo: string, id: string) {
  const data = readRepositoryPlanningFile(workPlanningPath(repo), repo);
  const item = data.items.find((entry) => entry.id === id);
  const project = data.projects.find((entry) => entry.id === item?.projectId);
  if (!item || !project) throw new Error('Planner task no longer exists in this repository.');
  return { data, item, project, revision: workDigest(item) };
}

export function saveWorkItem(repo: string, item: PlannerItem, expectedRevision: string) {
  const current = loadWorkItem(repo, item.id);
  if (current.revision !== expectedRevision) throw new Error('The task changed. Review the latest version before continuing.');
  const updated = { ...item, updatedAt: Math.max(Date.now(), current.item.updatedAt + 1) };
  const normalized = normalizeProjectPlannerData({ ...current.data, items: current.data.items.map((entry) => (entry.id === item.id ? updated : entry)) });
  writeRepositoryPlanningFile(workPlanningPath(repo), normalized);
  notifyProjectPlannerDataChanged();
  return normalized.items.find((entry) => entry.id === item.id)!;
}

/** Preserve the selected task across checkouts without replacing another branch's planning document. */
export function carryWorkItem(repo: string, item: PlannerItem, project: PlannerProject, allowedRevisions?: string[]) {
  const data = readRepositoryPlanningFile(workPlanningPath(repo), repo);
  const existing = data.items.find((entry) => entry.id === item.id);
  if (data.projects.length && data.projects[0].id !== project.id)
    throw new Error('The target branch has a different planning project. Reconcile it before assigning this task.');
  if (existing && workDigest(workContent(existing)) !== workDigest(workContent(item)))
    throw new Error('The target branch contains a conflicting version of this task. Reconcile it before assigning the branch.');
  if (existing && allowedRevisions && !allowedRevisions.includes(workDigest(existing)))
    throw new Error('The task changed during checkout. Review it before completing the assignment.');
  const updated = { ...item, updatedAt: Math.max(Date.now(), item.updatedAt + 1) };
  writeRepositoryPlanningFile(
    workPlanningPath(repo),
    normalizeProjectPlannerData({
      version: 1,
      projects: data.projects.length ? data.projects : [{ ...project, repoPath: repo }],
      items: [...data.items.filter((entry) => entry.id !== item.id), updated],
    }),
  );
  notifyProjectPlannerDataChanged();
  return updated;
}
