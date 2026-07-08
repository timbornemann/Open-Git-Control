import {
  PLANNER_PRIORITIES,
  PLANNER_STATUSES,
  PlannerItem,
  PlannerItemInput,
  PlannerPriority,
  PlannerProject,
  PlannerStatus,
  ensureRepositoryProject,
  getRepositoryProjectKey,
  movePlannerItem,
  readProjectPlannerData,
} from './projectPlannerStore';
import { StoredRepoEntry, readStoreData } from './repoStore';
import {
  ApiError,
  EnrichedTodo,
  JsonObject,
  PlannerCounts,
  ProjectSummary,
  TodoQueryOptions,
} from './planningApiTypes';

const PRIORITY_RANK: Record<PlannerPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const STATUS_RANK: Record<PlannerStatus, number> = {
  bug: 50,
  blocked: 45,
  'in-progress': 40,
  planned: 30,
  idea: 20,
  done: 0,
};

const STATUS_ALIASES: Record<string, PlannerStatus> = {
  idea: 'idea',
  ideas: 'idea',
  ideen: 'idea',
  bug: 'bug',
  bugs: 'bug',
  issue: 'bug',
  issues: 'bug',
  planned: 'planned',
  plan: 'planned',
  geplant: 'planned',
  plned: 'planned',
  working: 'in-progress',
  work: 'in-progress',
  active: 'in-progress',
  doing: 'in-progress',
  'in-progress': 'in-progress',
  in_progress: 'in-progress',
  progress: 'in-progress',
  blocked: 'blocked',
  blockiert: 'blocked',
  done: 'done',
  erledigt: 'done',
  closed: 'done',
};

const PRIORITY_ALIASES: Record<string, PlannerPriority> = {
  low: 'low',
  niedrig: 'low',
  medium: 'medium',
  mittel: 'medium',
  normal: 'medium',
  high: 'high',
  hoch: 'high',
  urgent: 'urgent',
  dringend: 'urgent',
  critical: 'urgent',
  kritisch: 'urgent',
};

const emptyCounts = (): PlannerCounts => ({
  total: 0,
  open: 0,
  byStatus: Object.fromEntries(PLANNER_STATUSES.map((status) => [status, 0])) as Record<PlannerStatus, number>,
  byPriority: Object.fromEntries(PLANNER_PRIORITIES.map((priority) => [priority, 0])) as Record<PlannerPriority, number>,
});

export const cleanString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

export const parseBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
};

export const parseLimit = (value: unknown, fallback?: number): number | undefined => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(500, Math.floor(parsed));
};

export const parseStatus = (value: unknown, fieldName = 'status'): PlannerStatus | undefined => {
  const raw = cleanString(value).toLowerCase();
  if (!raw) return undefined;
  const normalized = STATUS_ALIASES[raw];
  if (!normalized) {
    throw new ApiError(400, 'INVALID_STATUS', `${fieldName} must be one of ${PLANNER_STATUSES.join(', ')}.`);
  }
  return normalized;
};

export const parsePriority = (value: unknown): PlannerPriority | undefined => {
  const raw = cleanString(value).toLowerCase();
  if (!raw) return undefined;
  const normalized = PRIORITY_ALIASES[raw];
  if (!normalized) {
    throw new ApiError(400, 'INVALID_PRIORITY', `priority must be one of ${PLANNER_PRIORITIES.join(', ')}.`);
  }
  return normalized;
};

const normalizeTagsInput = (value: unknown): string[] | undefined => {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map((entry) => cleanString(entry)).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
  throw new ApiError(400, 'INVALID_TAGS', 'tags must be an array of strings or a comma separated string.');
};

const calculateUrgencyRank = (item: PlannerItem): number => {
  if (item.status === 'done') return 0;
  return PRIORITY_RANK[item.priority] * 100 + STATUS_RANK[item.status];
};

const compareTodosByUrgency = (left: EnrichedTodo, right: EnrichedTodo): number => (
  right.urgencyRank - left.urgencyRank
  || left.updatedAt - right.updatedAt
  || left.createdAt - right.createdAt
  || left.title.localeCompare(right.title)
);

const compareTodosByUpdated = (left: EnrichedTodo, right: EnrichedTodo): number => (
  right.updatedAt - left.updatedAt
  || compareTodosByUrgency(left, right)
);

const countItems = (items: PlannerItem[]): PlannerCounts => {
  const counts = emptyCounts();
  for (const item of items) {
    counts.total += 1;
    if (item.status !== 'done') counts.open += 1;
    counts.byStatus[item.status] += 1;
    counts.byPriority[item.priority] += 1;
  }
  return counts;
};

export const summarizeProject = (project: PlannerProject, allItems: PlannerItem[]): ProjectSummary => ({
  ...project,
  counts: countItems(allItems.filter((item) => item.projectId === project.id)),
});

export const findProjectById = (projectId: string): PlannerProject => {
  const project = readProjectPlannerData().projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  return project;
};

const findProjectByName = (projectName: string): PlannerProject => {
  const name = projectName.trim().toLowerCase();
  const matches = readProjectPlannerData().projects.filter((project) => project.name.toLowerCase() === name);
  if (matches.length === 0) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  if (matches.length > 1) {
    throw new ApiError(409, 'PROJECT_NAME_AMBIGUOUS', 'Multiple projects use this name. Use projectId instead.');
  }
  return matches[0];
};

export const resolveProjectLocator = (input: JsonObject): PlannerProject => {
  const projectId = cleanString(input.projectId);
  if (projectId) return findProjectById(projectId);

  const repoPath = cleanString(input.repoPath);
  if (repoPath) return ensureRepositoryProject(repoPath);

  const projectName = cleanString(input.projectName);
  if (projectName) return findProjectByName(projectName);

  throw new ApiError(400, 'PROJECT_REQUIRED', 'Provide projectId, repoPath, or projectName.');
};

export const enrichTodos = (items: PlannerItem[], projects: PlannerProject[]): EnrichedTodo[] => {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  return items
    .map((item) => {
      const project = projectById.get(item.projectId);
      if (!project) return null;
      return {
        ...item,
        projectName: project.name,
        projectKind: project.kind,
        projectRepoPath: project.repoPath,
        project: {
          id: project.id,
          name: project.name,
          kind: project.kind,
          repoPath: project.repoPath,
        },
        urgencyRank: calculateUrgencyRank(item),
      };
    })
    .filter((item): item is EnrichedTodo => item !== null);
};

export const getTodos = (options: TodoQueryOptions = {}): EnrichedTodo[] => {
  const data = readProjectPlannerData();
  const repoKey = options.repoPath ? getRepositoryProjectKey(options.repoPath) : null;
  const projectName = options.projectName?.trim().toLowerCase() || null;
  const tag = options.tag?.trim().toLowerCase() || null;
  const query = options.query?.trim().toLowerCase() || null;
  const projectById = new Map(data.projects.map((project) => [project.id, project]));

  const filtered = data.items.filter((item) => {
    const project = projectById.get(item.projectId);
    if (!project) return false;
    if (options.projectId && item.projectId !== options.projectId) return false;
    if (options.kind && project.kind !== options.kind) return false;
    if (repoKey && (!project.repoPath || getRepositoryProjectKey(project.repoPath) !== repoKey)) return false;
    if (projectName && project.name.toLowerCase() !== projectName) return false;
    if (options.status && item.status !== options.status) return false;
    if (options.priority && item.priority !== options.priority) return false;
    if (options.includeDone === false && item.status === 'done') return false;
    if (tag && !item.tags.some((candidate) => candidate.toLowerCase() === tag)) return false;
    if (query) {
      const haystack = [
        item.title,
        item.description,
        ...item.tags,
        project.name,
        project.repoPath || '',
      ].join('\n').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const enriched = enrichTodos(filtered, data.projects);
  enriched.sort(options.sort === 'updated' ? compareTodosByUpdated : compareTodosByUrgency);
  return options.limit ? enriched.slice(0, options.limit) : enriched;
};

export const getTodoById = (itemId: string): EnrichedTodo => {
  const data = readProjectPlannerData();
  const item = data.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new ApiError(404, 'TODO_NOT_FOUND', 'Todo not found.');
  const [enriched] = enrichTodos([item], data.projects);
  if (!enriched) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  return enriched;
};

export const queryOptionsFromUrl = (url: URL, defaults: Partial<TodoQueryOptions> = {}): TodoQueryOptions => {
  const openOnly = parseBoolean(url.searchParams.get('open'));
  const includeDone = parseBoolean(url.searchParams.get('includeDone'));
  const statusValue = url.searchParams.get('status') || url.searchParams.get('tab') || undefined;
  const priorityValue = url.searchParams.get('priority') || url.searchParams.get('urgency') || undefined;
  const kind = url.searchParams.get('kind');
  if (kind && kind !== 'repository' && kind !== 'planned') {
    throw new ApiError(400, 'INVALID_KIND', 'kind must be repository or planned.');
  }

  return {
    ...defaults,
    projectId: url.searchParams.get('projectId') || defaults.projectId,
    repoPath: url.searchParams.get('repoPath') || defaults.repoPath,
    projectName: url.searchParams.get('projectName') || defaults.projectName,
    kind: (kind as TodoQueryOptions['kind']) || defaults.kind,
    status: parseStatus(statusValue) || defaults.status,
    priority: parsePriority(priorityValue) || defaults.priority,
    tag: url.searchParams.get('tag') || defaults.tag,
    query: url.searchParams.get('q') || url.searchParams.get('query') || defaults.query,
    includeDone: openOnly === true ? false : includeDone ?? defaults.includeDone,
    limit: parseLimit(url.searchParams.get('limit'), defaults.limit),
    sort: url.searchParams.get('sort') === 'updated' ? 'updated' : defaults.sort || 'urgency',
  };
};

export const itemInputFromBody = (body: JsonObject, defaultStatus?: PlannerStatus): PlannerItemInput => {
  const title = cleanString(body.title);
  if (!title) throw new ApiError(400, 'TITLE_REQUIRED', 'title is required.');
  return {
    title,
    description: cleanString(body.description),
    priority: parsePriority(body.priority) || 'medium',
    status: parseStatus(body.status ?? body.tab) || defaultStatus || 'idea',
    tags: normalizeTagsInput(body.tags) || [],
  };
};

export const itemUpdateFromBody = (body: JsonObject): Partial<PlannerItemInput> => {
  const input: Partial<PlannerItemInput> = {};
  if ('title' in body) input.title = cleanString(body.title);
  if ('description' in body) input.description = cleanString(body.description);
  if ('priority' in body) input.priority = parsePriority(body.priority);
  if ('status' in body || 'tab' in body) input.status = parseStatus(body.status ?? body.tab);
  if ('tags' in body) input.tags = normalizeTagsInput(body.tags);
  return input;
};

export const moveTodoFromBody = (itemId: string, body: JsonObject): EnrichedTodo => {
  const status = parseStatus(body.status ?? body.tab);
  const hasProjectLocator = Boolean(
    cleanString(body.projectId)
    || cleanString(body.repoPath)
    || cleanString(body.projectName),
  );
  const project = hasProjectLocator ? resolveProjectLocator(body) : null;
  if (!status && !project) {
    throw new ApiError(400, 'MOVE_TARGET_REQUIRED', 'Provide status/tab, projectId, repoPath, or projectName.');
  }
  const moved = movePlannerItem(itemId, {
    projectId: project?.id,
    status,
  });
  const data = readProjectPlannerData();
  return enrichTodos([moved], data.projects)[0];
};

export const getProjects = (url: URL): ProjectSummary[] => {
  const kind = url.searchParams.get('kind');
  if (kind && kind !== 'repository' && kind !== 'planned') {
    throw new ApiError(400, 'INVALID_KIND', 'kind must be repository or planned.');
  }
  const data = readProjectPlannerData();
  return data.projects
    .filter((project) => !kind || project.kind === kind)
    .map((project) => summarizeProject(project, data.items))
    .sort((left, right) => left.name.localeCompare(right.name));
};

export const getRepositories = (): Array<StoredRepoEntry & {
  project: ProjectSummary | null;
}> => {
  const data = readProjectPlannerData();
  const store = readStoreData();
  const projectsByRepoKey = new Map<string, ProjectSummary>();
  for (const project of data.projects) {
    if (project.kind === 'repository' && project.repoPath) {
      projectsByRepoKey.set(getRepositoryProjectKey(project.repoPath), summarizeProject(project, data.items));
    }
  }

  return store.repos.map((repo) => ({
    ...repo,
    project: projectsByRepoKey.get(getRepositoryProjectKey(repo.path)) || null,
  }));
};

export const getTabs = () => ({
  tabs: PLANNER_STATUSES.map((status) => ({
    id: status,
    aliases: Object.entries(STATUS_ALIASES)
      .filter(([, normalized]) => normalized === status)
      .map(([alias]) => alias)
      .sort(),
  })),
});

export const listProjectsForTool = (args: JsonObject) => {
  const data = readProjectPlannerData();
  const includeTodos = parseBoolean(args.includeTodos) === true;
  const kindRaw = cleanString(args.kind);
  if (kindRaw && kindRaw !== 'repository' && kindRaw !== 'planned') {
    throw new ApiError(400, 'INVALID_KIND', 'kind must be repository or planned.');
  }
  const projects = data.projects
    .filter((project) => !kindRaw || project.kind === kindRaw)
    .map((project) => ({
      ...summarizeProject(project, data.items),
      ...(includeTodos ? {
        todos: getTodos({ projectId: project.id, includeDone: parseBoolean(args.includeDone) }),
      } : {}),
    }));
  return { projects };
};

export const toolTodoOptions = (
  args: JsonObject,
  defaults: Partial<TodoQueryOptions> = {},
): TodoQueryOptions => ({
  ...defaults,
  projectId: cleanString(args.projectId) || defaults.projectId,
  repoPath: cleanString(args.repoPath) || defaults.repoPath,
  projectName: cleanString(args.projectName) || defaults.projectName,
  status: parseStatus(args.status ?? args.tab) || defaults.status,
  priority: parsePriority(args.priority ?? args.urgency) || defaults.priority,
  tag: cleanString(args.tag) || defaults.tag,
  query: cleanString(args.query ?? args.q) || defaults.query,
  includeDone: parseBoolean(args.includeDone) ?? defaults.includeDone,
  limit: parseLimit(args.limit, defaults.limit),
  sort: cleanString(args.sort) === 'updated' ? 'updated' : defaults.sort || 'urgency',
});
