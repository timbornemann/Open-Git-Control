import type { ElectronPlannerAPI } from '@/shared/ipc/contracts/planner';
import type { ProjectPlannerData } from '@/types/projectPlanner';
import { DEMO_REPO, DEMO_TIME, ok, type DemoRepository } from './demoRepository';
import { DEMO_HOSTED_REPO } from './demoHostingApi';

export function createDemoPlanningApi(repo: DemoRepository): Partial<ElectronPlannerAPI> {
  const data: ProjectPlannerData = {
    version: 1,
    projects: [
      {
        id: 'learning',
        name: 'OGC-Lernprojekt',
        description: 'Ein Projekt zum Ausprobieren / A practice project',
        kind: 'repository',
        repoPath: DEMO_REPO,
        createdAt: DEMO_TIME,
        updatedAt: DEMO_TIME,
      },
    ],
    items: [
      {
        id: 'welcome',
        projectId: 'learning',
        title: 'Begrüßung ergänzen / Add a welcome',
        description: 'Eine freundliche Begrüßung auf der Startseite anzeigen.',
        priority: 'high',
        status: 'planned',
        tags: ['Einstieg'],
        createdAt: DEMO_TIME,
        updatedAt: DEMO_TIME,
      },
      {
        id: 'docs',
        projectId: 'learning',
        title: 'Dokumentation lesen / Read documentation',
        description: 'Den ersten Arbeitsablauf kennenlernen.',
        priority: 'medium',
        status: 'done',
        tags: ['Docs'],
        createdAt: DEMO_TIME,
        updatedAt: DEMO_TIME,
      },
      {
        id: 'idea',
        projectId: 'learning',
        title: 'Neue Ideen sammeln / Collect ideas',
        description: '',
        priority: 'low',
        status: 'idea',
        tags: [],
        createdAt: DEMO_TIME,
        updatedAt: DEMO_TIME,
      },
    ],
  };
  const changed = (event: string) => {
    repo.mark(event);
    repo.emitChannel('planner', undefined);
  };
  return {
    plannerGetData: async () => ok(structuredClone(data)),
    plannerGetWork: async (request) => ok({ itemId: request.itemId, revision: 'demo', commits: [], requests: [], recoveries: [] }),
    plannerInspectWork: async (request) => {
      if (!repo.commits.length) return { success: false, error: 'Create a practice commit before starting task work.' };
      const item = data.items.find((entry) => entry.id === request.itemId);
      if (!item) return { success: false, error: 'Task not found.' };
      return ok({
        planId: 'demo-work',
        item,
        suggestedName: `task/${item.id}-welcome`,
        bases: [{ ref: 'main', sha: repo.commits[0].hash }],
        defaultBase: 'main',
        changes: [...repo.modified],
        worktrees: [],
      });
    },
    plannerStartWork: async (request) => {
      if (!repo.commits.length) return { success: false, error: 'Create a practice commit before starting task work.' };
      const item = data.items.find((entry) => entry.id === request.itemId);
      if (!item || request.planId !== 'demo-work') return { success: false, error: 'Reload the task preview.' };
      repo.command('checkout', '-b', request.branchName, request.baseRef);
      item.status = 'in-progress';
      item.references = {
        activeWorkflowId: 'demo-workflow',
        branches: [
          {
            id: 'demo-workflow',
            projectId: item.projectId,
            name: request.branchName,
            baseRef: request.baseRef,
            baseSha: repo.commits[0].hash,
            startedAt: DEMO_TIME,
            automationPaused: false,
          },
        ],
        pullRequests: [],
      };
      changed('task-started');
      return ok({ branch: request.branchName, item });
    },
    plannerRefreshWork: async (request) => {
      if (!repo.commits.length) return { success: false, error: 'Create a practice commit before starting task work.' };
      const item = data.items.find((entry) => entry.id === request.itemId);
      return ok({
        itemId: request.itemId,
        revision: 'demo',
        workflowId: item?.references?.activeWorkflowId,
        hostingRepository: DEMO_HOSTED_REPO,
        headSha: repo.commits[0].hash,
        commits: repo.commits.map((commit) => ({ sha: commit.hash, subject: commit.subject, timestamp: Date.parse(commit.date), state: 'current' as const })),
        requests: (item?.references?.pullRequests || []).map((reference) => ({
          ...reference,
          state: 'open' as const,
          title: item?.title || '',
          headSha: repo.commits[0].hash,
          sourceBranch: repo.branch,
          targetBranch: 'main',
        })),
        checkedAt: DEMO_TIME,
      });
    },
    plannerUpdateWork: async (request) => {
      const item = data.items.find((entry) => entry.id === request.itemId);
      if (!item) return { success: false, error: 'Task not found.' };
      if (request.action === 'attach-pr' && item.references) item.references.pullRequests.push(request.reference);
      if (request.action === 'archive') item.status = 'done';
      changed('task-updated');
      return ok(item);
    },
    onPlannerDataChanged: (callback) => repo.subscribeChannel('planner', callback),
    plannerEnsureRepositoryProject: async () => ok(data.projects[0]),
    plannerCreateProject: async (input) => {
      const project = { ...input, id: `project-${data.projects.length}`, kind: 'planned' as const, repoPath: null, createdAt: DEMO_TIME, updatedAt: DEMO_TIME };
      data.projects.push(project);
      changed('project-created');
      return ok(project);
    },
    plannerUpdateProject: async (id, input) => {
      const project = data.projects.find((entry) => entry.id === id);
      if (!project) return { success: false, error: 'Project not found.' };
      Object.assign(project, input, { updatedAt: DEMO_TIME + repo.revision });
      changed('project-updated');
      return ok(project);
    },
    plannerDeleteProject: async (id) => {
      data.projects = data.projects.filter((project) => project.id !== id);
      changed('project-deleted');
      return ok(true);
    },
    plannerCreateItem: async (projectId, input) => {
      if (!input.title.trim()) return { success: false, error: 'Please enter a title.' };
      const item = { ...input, projectId, id: `task-${data.items.length + repo.revision}`, createdAt: DEMO_TIME, updatedAt: DEMO_TIME + repo.revision };
      data.items.push(item);
      changed('task-created');
      return ok(item);
    },
    plannerUpdateItem: async (id, input) => {
      const item = data.items.find((entry) => entry.id === id);
      if (!item) return { success: false, error: 'Task not found.' };
      Object.assign(item, input, { updatedAt: DEMO_TIME + repo.revision });
      changed('task-updated');
      return ok(item);
    },
    plannerDeleteItem: async (id) => {
      data.items = data.items.filter((item) => item.id !== id);
      changed('task-deleted');
      return ok(true);
    },
    plannerDeleteRepositoryProjectByPath: async () => ok({ deletedProjectCount: 0, deletedItemCount: 0 }),
  };
}
