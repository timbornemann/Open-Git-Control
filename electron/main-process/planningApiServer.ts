import * as http from 'http';
import { URL } from 'url';
import {
  PLANNER_PRIORITIES,
  PLANNER_STATUSES,
  PlannerItem,
  PlannerItemInput,
  PlannerPriority,
  PlannerProject,
  PlannerStatus,
  createPlannedProject,
  createPlannerItem,
  deletePlannerItem,
  deletePlannerProject,
  ensureRepositoryProject,
  getRepositoryProjectKey,
  movePlannerItem,
  readProjectPlannerData,
  updatePlannerItem,
  updatePlannerProject,
} from './projectPlannerStore';
import { StoredRepoEntry, readStoreData } from './repoStore';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 2990;
const PORT_SEARCH_LIMIT = 25;
const MAX_BODY_BYTES = 1_000_000;
const MCP_PROTOCOL_VERSION = '2025-06-18';
const SERVER_NAME = 'open-git-control-planner';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'OPTIONS';
type JsonObject = Record<string, unknown>;
type RequestContext = {
  method: HttpMethod;
  url: URL;
  segments: string[];
  body: JsonObject;
  baseUrl: string;
};

type ApiEnvelope<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

type TodoQueryOptions = {
  projectId?: string;
  repoPath?: string;
  projectName?: string;
  kind?: 'repository' | 'planned';
  status?: PlannerStatus;
  priority?: PlannerPriority;
  tag?: string;
  query?: string;
  includeDone?: boolean;
  limit?: number;
  sort?: 'urgency' | 'updated';
};

type EnrichedTodo = PlannerItem & {
  project: Pick<PlannerProject, 'id' | 'name' | 'kind' | 'repoPath'>;
  urgencyRank: number;
};

type ProjectSummary = PlannerProject & {
  counts: PlannerCounts;
};

type PlannerCounts = {
  total: number;
  open: number;
  byStatus: Record<PlannerStatus, number>;
  byPriority: Record<PlannerPriority, number>;
};

type PlanningApiServerOptions = {
  host?: string;
  preferredPort?: number;
  maxPortSearch?: number;
};

export type PlanningApiServerHandle = {
  host: string;
  port: number;
  url: string;
  close: () => Promise<void>;
};

class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

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

const cleanString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const parseBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
};

const parseLimit = (value: unknown, fallback?: number): number | undefined => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(500, Math.floor(parsed));
};

const parseStatus = (value: unknown, fieldName = 'status'): PlannerStatus | undefined => {
  const raw = cleanString(value).toLowerCase();
  if (!raw) return undefined;
  const normalized = STATUS_ALIASES[raw];
  if (!normalized) {
    throw new ApiError(400, 'INVALID_STATUS', `${fieldName} must be one of ${PLANNER_STATUSES.join(', ')}.`);
  }
  return normalized;
};

const parsePriority = (value: unknown): PlannerPriority | undefined => {
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

const summarizeProject = (project: PlannerProject, allItems: PlannerItem[]): ProjectSummary => ({
  ...project,
  counts: countItems(allItems.filter((item) => item.projectId === project.id)),
});

const findProjectById = (projectId: string): PlannerProject => {
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

const resolveProjectLocator = (input: JsonObject): PlannerProject => {
  const projectId = cleanString(input.projectId);
  if (projectId) return findProjectById(projectId);

  const repoPath = cleanString(input.repoPath);
  if (repoPath) return ensureRepositoryProject(repoPath);

  const projectName = cleanString(input.projectName);
  if (projectName) return findProjectByName(projectName);

  throw new ApiError(400, 'PROJECT_REQUIRED', 'Provide projectId, repoPath, or projectName.');
};

const enrichTodos = (items: PlannerItem[], projects: PlannerProject[]): EnrichedTodo[] => {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  return items
    .map((item) => {
      const project = projectById.get(item.projectId);
      if (!project) return null;
      return {
        ...item,
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

const getTodos = (options: TodoQueryOptions = {}): EnrichedTodo[] => {
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

const getTodoById = (itemId: string): EnrichedTodo => {
  const data = readProjectPlannerData();
  const item = data.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new ApiError(404, 'TODO_NOT_FOUND', 'Todo not found.');
  const [enriched] = enrichTodos([item], data.projects);
  if (!enriched) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  return enriched;
};

const queryOptionsFromUrl = (url: URL, defaults: Partial<TodoQueryOptions> = {}): TodoQueryOptions => {
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

const itemInputFromBody = (body: JsonObject, defaultStatus?: PlannerStatus): PlannerItemInput => {
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

const itemUpdateFromBody = (body: JsonObject): Partial<PlannerItemInput> => {
  const input: Partial<PlannerItemInput> = {};
  if ('title' in body) input.title = cleanString(body.title);
  if ('description' in body) input.description = cleanString(body.description);
  if ('priority' in body) input.priority = parsePriority(body.priority);
  if ('status' in body || 'tab' in body) input.status = parseStatus(body.status ?? body.tab);
  if ('tags' in body) input.tags = normalizeTagsInput(body.tags);
  return input;
};

const moveTodoFromBody = (itemId: string, body: JsonObject): EnrichedTodo => {
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

const getProjects = (url: URL): ProjectSummary[] => {
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

const getRepositories = (): Array<StoredRepoEntry & {
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

const routeApi = async (ctx: RequestContext): Promise<unknown> => {
  const [root, resource, idOrAction, nested, nestedId] = ctx.segments;
  if (root !== 'api') throw new ApiError(404, 'NOT_FOUND', 'Route not found.');

  if (!resource) {
    return apiIndex(ctx.baseUrl);
  }

  if (resource === 'health' && ctx.method === 'GET') {
    return {
      name: SERVER_NAME,
      status: 'ok',
      baseUrl: `${ctx.baseUrl}/api/`,
      mcpUrl: `${ctx.baseUrl}/mcp`,
      statuses: PLANNER_STATUSES,
      priorities: PLANNER_PRIORITIES,
    };
  }

  if (resource === 'openapi.json' && ctx.method === 'GET') {
    return openApiSpec(ctx.baseUrl);
  }

  if (resource === 'tabs') {
    if (!idOrAction && ctx.method === 'GET') return getTabs();
    if (idOrAction && nested === 'todos' && ctx.method === 'GET') {
      return { todos: getTodos(queryOptionsFromUrl(ctx.url, { status: parseStatus(idOrAction, 'tab') })) };
    }
    if (idOrAction && nested === 'todos' && ctx.method === 'POST') {
      const project = resolveProjectLocator(ctx.body);
      const item = createPlannerItem(project.id, itemInputFromBody(ctx.body, parseStatus(idOrAction, 'tab')));
      return getTodoById(item.id);
    }
  }

  if (resource === 'projects') {
    if (!idOrAction && ctx.method === 'GET') return { projects: getProjects(ctx.url) };
    if (!idOrAction && ctx.method === 'POST') {
      return createPlannedProject({
        name: cleanString(ctx.body.name),
        description: cleanString(ctx.body.description),
      });
    }
    if (idOrAction && !nested && ctx.method === 'GET') {
      const data = readProjectPlannerData();
      return {
        project: summarizeProject(findProjectById(idOrAction), data.items),
        todos: getTodos(queryOptionsFromUrl(ctx.url, { projectId: idOrAction })),
      };
    }
    if (idOrAction && !nested && ctx.method === 'PATCH') {
      return updatePlannerProject(idOrAction, {
        name: 'name' in ctx.body ? cleanString(ctx.body.name) : undefined,
        description: 'description' in ctx.body ? cleanString(ctx.body.description) : undefined,
      });
    }
    if (idOrAction && !nested && ctx.method === 'DELETE') {
      deletePlannerProject(idOrAction);
      return { deleted: true };
    }
    if (idOrAction && nested === 'todos' && ctx.method === 'GET') {
      findProjectById(idOrAction);
      return { todos: getTodos(queryOptionsFromUrl(ctx.url, { projectId: idOrAction })) };
    }
    if (idOrAction && nested === 'todos' && ctx.method === 'POST') {
      findProjectById(idOrAction);
      const item = createPlannerItem(idOrAction, itemInputFromBody(ctx.body));
      return getTodoById(item.id);
    }
  }

  if (resource === 'repositories') {
    if (!idOrAction && ctx.method === 'GET') return { repositories: getRepositories() };
    if (idOrAction === 'ensure' && ctx.method === 'POST') {
      return ensureRepositoryProject(cleanString(ctx.body.repoPath));
    }
    if (idOrAction === 'todos' && ctx.method === 'GET') {
      return { todos: getTodos(queryOptionsFromUrl(ctx.url, { kind: 'repository' })) };
    }
  }

  if (resource === 'todos') {
    if (!idOrAction && ctx.method === 'GET') {
      return { todos: getTodos(queryOptionsFromUrl(ctx.url)) };
    }
    if (!idOrAction && ctx.method === 'POST') {
      const project = resolveProjectLocator(ctx.body);
      const item = createPlannerItem(project.id, itemInputFromBody(ctx.body));
      return getTodoById(item.id);
    }
    if (idOrAction === 'next' && ctx.method === 'GET') {
      return { todos: getTodos(queryOptionsFromUrl(ctx.url, { includeDone: false, limit: 20 })) };
    }
    if (idOrAction && !nested && ctx.method === 'GET') return getTodoById(idOrAction);
    if (idOrAction && !nested && ctx.method === 'PATCH') {
      const moveProject = cleanString(ctx.body.projectId) || cleanString(ctx.body.repoPath) || cleanString(ctx.body.projectName);
      if (moveProject) moveTodoFromBody(idOrAction, ctx.body);
      const updated = updatePlannerItem(idOrAction, itemUpdateFromBody(ctx.body));
      const data = readProjectPlannerData();
      return enrichTodos([updated], data.projects)[0];
    }
    if (idOrAction && !nested && ctx.method === 'DELETE') {
      deletePlannerItem(idOrAction);
      return { deleted: true };
    }
    if (idOrAction && nested === 'move' && ctx.method === 'POST') return moveTodoFromBody(idOrAction, ctx.body);
  }

  if (resource === 'agent' && idOrAction === 'next' && ctx.method === 'GET') {
    return { todos: getTodos(queryOptionsFromUrl(ctx.url, { includeDone: false, limit: 20 })) };
  }

  if (resource === 'mcp' && idOrAction === 'tools') {
    if (!nested && ctx.method === 'GET') return { tools: MCP_TOOLS };
    if (nested === 'call' && ctx.method === 'POST') {
      const name = cleanString(ctx.body.name);
      const args = (ctx.body.arguments && typeof ctx.body.arguments === 'object' ? ctx.body.arguments : {}) as JsonObject;
      return callAgentTool(name, args);
    }
  }

  throw new ApiError(404, 'NOT_FOUND', 'Route not found.');
};

const getTabs = () => ({
  tabs: PLANNER_STATUSES.map((status) => ({
    id: status,
    aliases: Object.entries(STATUS_ALIASES)
      .filter(([, normalized]) => normalized === status)
      .map(([alias]) => alias)
      .sort(),
  })),
});

const listProjectsForTool = (args: JsonObject) => {
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

const toolTodoOptions = (args: JsonObject, defaults: Partial<TodoQueryOptions> = {}): TodoQueryOptions => ({
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

const callAgentTool = (name: string, args: JsonObject): unknown => {
  switch (name) {
    case 'list_tabs':
      return getTabs();
    case 'list_projects':
      return listProjectsForTool(args);
    case 'list_repositories':
      return { repositories: getRepositories() };
    case 'list_todos':
      return { todos: getTodos(toolTodoOptions(args)) };
    case 'get_next_todos':
      return { todos: getTodos(toolTodoOptions(args, { includeDone: false, limit: 20 })) };
    case 'create_project':
      return createPlannedProject({
        name: cleanString(args.name),
        description: cleanString(args.description),
      });
    case 'ensure_repository_project':
      return ensureRepositoryProject(cleanString(args.repoPath));
    case 'create_todo': {
      const project = resolveProjectLocator(args);
      const item = createPlannerItem(project.id, itemInputFromBody(args));
      return getTodoById(item.id);
    }
    case 'update_todo': {
      const itemId = cleanString(args.itemId);
      if (!itemId) throw new ApiError(400, 'TODO_REQUIRED', 'itemId is required.');
      if (cleanString(args.projectId) || cleanString(args.repoPath) || cleanString(args.projectName)) {
        moveTodoFromBody(itemId, args);
      }
      const updated = updatePlannerItem(itemId, itemUpdateFromBody(args));
      const data = readProjectPlannerData();
      return enrichTodos([updated], data.projects)[0];
    }
    case 'move_todo': {
      const itemId = cleanString(args.itemId);
      if (!itemId) throw new ApiError(400, 'TODO_REQUIRED', 'itemId is required.');
      return moveTodoFromBody(itemId, args);
    }
    case 'delete_todo': {
      const itemId = cleanString(args.itemId);
      if (!itemId) throw new ApiError(400, 'TODO_REQUIRED', 'itemId is required.');
      deletePlannerItem(itemId);
      return { deleted: true };
    }
    default:
      throw new ApiError(404, 'TOOL_NOT_FOUND', `Unknown tool: ${name}`);
  }
};

const MCP_TOOLS = [
  {
    name: 'list_tabs',
    title: 'List planner tabs',
    description: 'List available planner tabs/status values and accepted aliases.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_projects',
    title: 'List planner projects',
    description: 'List planned projects and repository projects with todo counts.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['repository', 'planned'] },
        includeTodos: { type: 'boolean' },
        includeDone: { type: 'boolean' },
      },
    },
  },
  {
    name: 'list_repositories',
    title: 'List repositories',
    description: 'List repositories known to Open-Git-Control and their linked planning project if present.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_todos',
    title: 'List todos',
    description: 'List todos across projects with optional filters. Results are sorted by urgency by default.',
    inputSchema: todoFilterSchema(),
  },
  {
    name: 'get_next_todos',
    title: 'Get next todos',
    description: 'Return open todos sorted by urgency. Use this when an agent asks what to work on next.',
    inputSchema: todoFilterSchema(),
  },
  {
    name: 'create_project',
    title: 'Create planned project',
    description: 'Create a future project without a repository.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'ensure_repository_project',
    title: 'Ensure repository project',
    description: 'Create or return the planning project for a repository path.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
      },
      required: ['repoPath'],
    },
  },
  {
    name: 'create_todo',
    title: 'Create todo',
    description: 'Create a todo in a project selected by projectId, projectName, or repoPath.',
    inputSchema: todoMutationSchema(['title']),
  },
  {
    name: 'update_todo',
    title: 'Update todo',
    description: 'Update title, description, priority, status, tags, or project assignment.',
    inputSchema: todoMutationSchema(['itemId']),
  },
  {
    name: 'move_todo',
    title: 'Move todo',
    description: 'Move a todo to another tab/status and optionally another project.',
    inputSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'string' },
        status: { type: 'string', enum: PLANNER_STATUSES },
        tab: { type: 'string' },
        projectId: { type: 'string' },
        projectName: { type: 'string' },
        repoPath: { type: 'string' },
      },
      required: ['itemId'],
    },
  },
  {
    name: 'delete_todo',
    title: 'Delete todo',
    description: 'Delete a todo by id.',
    inputSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'string' },
      },
      required: ['itemId'],
    },
  },
];

function todoFilterSchema(): JsonObject {
  return {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      projectName: { type: 'string' },
      repoPath: { type: 'string' },
      status: { type: 'string', enum: PLANNER_STATUSES },
      tab: { type: 'string', description: 'Status alias such as bug, planned, working, done.' },
      priority: { type: 'string', enum: PLANNER_PRIORITIES },
      tag: { type: 'string' },
      query: { type: 'string' },
      includeDone: { type: 'boolean' },
      limit: { type: 'number' },
      sort: { type: 'string', enum: ['urgency', 'updated'] },
    },
  };
}

function todoMutationSchema(required: string[]): JsonObject {
  return {
    type: 'object',
    properties: {
      itemId: { type: 'string' },
      projectId: { type: 'string' },
      projectName: { type: 'string' },
      repoPath: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      priority: { type: 'string', enum: PLANNER_PRIORITIES },
      status: { type: 'string', enum: PLANNER_STATUSES },
      tab: { type: 'string' },
      tags: {
        oneOf: [
          { type: 'array', items: { type: 'string' } },
          { type: 'string' },
        ],
      },
    },
    required,
  };
}

const handleMcpRpc = (payload: unknown): unknown => {
  if (Array.isArray(payload)) {
    const responses = payload
      .map((entry) => handleMcpMessage(entry))
      .filter((entry) => entry !== null);
    return responses.length > 0 ? responses : null;
  }
  return handleMcpMessage(payload);
};

const handleMcpMessage = (message: unknown): unknown => {
  if (!message || typeof message !== 'object') {
    return jsonRpcError(null, -32600, 'Invalid Request');
  }
  const request = message as JsonObject;
  const id = Object.prototype.hasOwnProperty.call(request, 'id') ? request.id : undefined;
  const method = cleanString(request.method);
  const params = request.params && typeof request.params === 'object' ? request.params as JsonObject : {};

  if (!method) return jsonRpcError(id ?? null, -32600, 'Invalid Request');

  try {
    switch (method) {
      case 'initialize':
        return jsonRpcResult(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
          serverInfo: {
            name: SERVER_NAME,
            title: 'Open-Git-Control Planner',
            version: '1.1.1',
          },
          instructions: 'Use get_next_todos for open work ordered by urgency. Use move_todo to change tabs/status.',
        });
      case 'notifications/initialized':
        return null;
      case 'ping':
        return jsonRpcResult(id, {});
      case 'tools/list':
        return jsonRpcResult(id, { tools: MCP_TOOLS });
      case 'tools/call': {
        const toolName = cleanString(params.name);
        const args = params.arguments && typeof params.arguments === 'object'
          ? params.arguments as JsonObject
          : {};
        const structuredContent = callAgentTool(toolName, args);
        return jsonRpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
          structuredContent,
          isError: false,
        });
      }
      default:
        return jsonRpcError(id ?? null, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    return jsonRpcResult(id, {
      content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
      isError: true,
    });
  }
};

const jsonRpcResult = (id: unknown, result: unknown): JsonObject => ({
  jsonrpc: '2.0',
  id: id ?? null,
  result,
});

const jsonRpcError = (id: unknown, code: number, message: string): JsonObject => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message },
});

const readJsonBody = async (request: http.IncomingMessage): Promise<JsonObject> => (
  new Promise((resolve, reject) => {
    const method = request.method || 'GET';
    if (method === 'GET' || method === 'DELETE' || method === 'OPTIONS') {
      resolve({});
      return;
    }

    let total = 0;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new ApiError(400, 'INVALID_JSON', 'Request body must be a JSON object.'));
          return;
        }
        resolve(parsed as JsonObject);
      } catch {
        reject(new ApiError(400, 'INVALID_JSON', 'Request body is not valid JSON.'));
      }
    });
    request.on('error', reject);
  })
);

const readMcpBody = async (request: http.IncomingMessage): Promise<unknown> => (
  new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) {
        reject(new ApiError(400, 'INVALID_JSON', 'Request body is required.'));
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve(jsonRpcError(null, -32700, 'Parse error'));
      }
    });
    request.on('error', reject);
  })
);

const createPlanningApiRequestHandler = () => async (
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> => {
  setCommonHeaders(response);

  try {
    const method = (request.method || 'GET').toUpperCase() as HttpMethod;
    if (!['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'].includes(method)) {
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
    }
    if (method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url || '/', `http://${request.headers.host || `${DEFAULT_HOST}:${DEFAULT_PORT}`}`);
    if (url.pathname === '/') {
      redirect(response, '/api/');
      return;
    }
    if (url.pathname === '/api') {
      redirect(response, '/api/');
      return;
    }
    if (url.pathname === '/mcp') {
      if (method !== 'POST') {
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'MCP endpoint expects HTTP POST with JSON-RPC payloads.');
      }
      const payload = await readMcpBody(request);
      if (payload && typeof payload === 'object' && 'jsonrpc' in payload && 'error' in payload) {
        sendJson(response, 200, payload);
        return;
      }
      const rpcResponse = handleMcpRpc(payload);
      if (rpcResponse === null) {
        response.writeHead(204);
        response.end();
        return;
      }
      sendJson(response, 200, rpcResponse);
      return;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    const baseUrl = `${url.protocol}//${url.host}`;
    const body = await readJsonBody(request);
    const result = await routeApi({ method, url, segments, body, baseUrl });

    if (typeof result === 'string' && result.startsWith('<!doctype html>')) {
      sendHtml(response, 200, result);
      return;
    }
    sendJson(response, 200, { success: true, data: result } satisfies ApiEnvelope<unknown>);
  } catch (error) {
    const apiError = error instanceof ApiError
      ? error
      : new ApiError(500, 'INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
    sendJson(response, apiError.statusCode, {
      success: false,
      error: {
        code: apiError.code,
        message: apiError.message,
      },
    } satisfies ApiEnvelope<unknown>);
  }
};

export async function startPlanningApiServer(
  options: PlanningApiServerOptions = {},
): Promise<PlanningApiServerHandle> {
  const host = options.host || DEFAULT_HOST;
  const preferredPort = normalizePreferredPort(options.preferredPort ?? getConfiguredPort());
  const maxPortSearch = options.maxPortSearch ?? PORT_SEARCH_LIMIT;
  const handler = createPlanningApiRequestHandler();

  for (let offset = 0; offset <= maxPortSearch; offset += 1) {
    const port = preferredPort === 0 ? 0 : preferredPort + offset;
    try {
      const server = await listenOnPort(http.createServer(handler), host, port);
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      return {
        host,
        port: actualPort,
        url: `http://${host}:${actualPort}`,
        close: () => new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
      };
    } catch (error) {
      if (!isAddressInUse(error) || preferredPort === 0 || offset === maxPortSearch) {
        throw error;
      }
    }
  }

  throw new Error('Unable to start planning API server.');
}

function listenOnPort(server: http.Server, host: string, port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve(server);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

const isAddressInUse = (error: unknown): boolean => (
  Boolean(error && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'EADDRINUSE')
);

const normalizePreferredPort = (port: number): number => {
  if (!Number.isFinite(port)) return DEFAULT_PORT;
  const normalized = Math.floor(port);
  if (normalized === 0) return 0;
  if (normalized < 1 || normalized > 65535) return DEFAULT_PORT;
  return normalized;
};

const getConfiguredPort = (): number => {
  const configured = Number(process.env.OPEN_GIT_CONTROL_API_PORT || '');
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_PORT;
};

const setCommonHeaders = (response: http.ServerResponse): void => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'content-type, accept, mcp-protocol-version');
  response.setHeader('Access-Control-Max-Age', '86400');
  response.setHeader('Cache-Control', 'no-store');
};

const sendJson = (response: http.ServerResponse, statusCode: number, payload: unknown): void => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload, null, 2));
};

const sendHtml = (response: http.ServerResponse, statusCode: number, html: string): void => {
  response.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
};

const redirect = (response: http.ServerResponse, location: string): void => {
  response.writeHead(302, { Location: location });
  response.end();
};

const apiIndex = (baseUrl: string): string => `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Open-Git-Control Planning API</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, Arial, sans-serif; background: #101418; color: #e7edf2; }
    body { margin: 0; padding: 32px; line-height: 1.5; }
    main { max-width: 1120px; margin: 0 auto; }
    h1, h2 { line-height: 1.2; }
    code, pre { background: #161d24; border: 1px solid #2a3642; border-radius: 6px; }
    code { padding: 2px 5px; }
    pre { padding: 14px; overflow: auto; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0 28px; font-size: 14px; }
    th, td { border-bottom: 1px solid #2a3642; padding: 9px 8px; text-align: left; vertical-align: top; }
    th { color: #93b8d7; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    a { color: #76b7e6; }
  </style>
</head>
<body>
<main>
  <h1>Open-Git-Control Planning API</h1>
  <p>Lokale API fuer Projektplanung, Repository-Todos und Agenten-Werkzeuge. Base URL: <code>${baseUrl}/api/</code>. MCP JSON-RPC: <code>${baseUrl}/mcp</code>.</p>

  <h2>Konventionen</h2>
  <p>Alle REST-Antworten nutzen <code>{"success":true,"data":...}</code> oder <code>{"success":false,"error":...}</code>. Prioritaeten: <code>${PLANNER_PRIORITIES.join(', ')}</code>. Tabs/Status: <code>${PLANNER_STATUSES.join(', ')}</code>. Der Alias <code>working</code> wird als <code>in-progress</code> behandelt.</p>

  <h2>REST-Endpunkte</h2>
  <table>
    <thead><tr><th>Methode</th><th>Pfad</th><th>Zweck</th></tr></thead>
    <tbody>
      <tr><td>GET</td><td><code>/api/health</code></td><td>Status, verfuegbare Tabs und Prioritaeten.</td></tr>
      <tr><td>GET</td><td><code>/api/openapi.json</code></td><td>Maschinenlesbare API-Beschreibung.</td></tr>
      <tr><td>GET</td><td><code>/api/projects?kind=repository|planned</code></td><td>Alle Planungsprojekte mit Todo-Zaehlern.</td></tr>
      <tr><td>POST</td><td><code>/api/projects</code></td><td>Geplantes Projekt erstellen. Body: <code>{"name":"...","description":"..."}</code>.</td></tr>
      <tr><td>GET/PATCH/DELETE</td><td><code>/api/projects/:projectId</code></td><td>Projekt lesen, umbenennen oder loeschen.</td></tr>
      <tr><td>GET/POST</td><td><code>/api/projects/:projectId/todos</code></td><td>Todos eines Projekts lesen oder erstellen.</td></tr>
      <tr><td>GET</td><td><code>/api/repositories</code></td><td>Bekannte Repositories mit verknuepftem Planner-Projekt.</td></tr>
      <tr><td>POST</td><td><code>/api/repositories/ensure</code></td><td>Planner-Projekt fuer <code>repoPath</code> erstellen oder zurueckgeben.</td></tr>
      <tr><td>GET</td><td><code>/api/repositories/todos</code></td><td>Todos aller Repository-Projekte.</td></tr>
      <tr><td>GET/POST</td><td><code>/api/todos</code></td><td>Todos projektuebergreifend lesen oder erstellen.</td></tr>
      <tr><td>GET/PATCH/DELETE</td><td><code>/api/todos/:todoId</code></td><td>Todo lesen, aktualisieren oder loeschen.</td></tr>
      <tr><td>POST</td><td><code>/api/todos/:todoId/move</code></td><td>Todo in anderen Tab oder ein anderes Projekt verschieben.</td></tr>
      <tr><td>GET</td><td><code>/api/todos/next</code> oder <code>/api/agent/next</code></td><td>Offene Todos nach Dringlichkeit, default <code>limit=20</code>.</td></tr>
      <tr><td>GET</td><td><code>/api/tabs</code></td><td>Tabs und Aliase.</td></tr>
      <tr><td>GET/POST</td><td><code>/api/tabs/:tab/todos</code></td><td>Todos eines Tabs lesen oder direkt in diesem Tab erstellen.</td></tr>
      <tr><td>GET</td><td><code>/api/mcp/tools</code></td><td>Agenten-Toolkatalog.</td></tr>
      <tr><td>POST</td><td><code>/api/mcp/tools/call</code></td><td>Tool per <code>{"name":"get_next_todos","arguments":{...}}</code> ausfuehren.</td></tr>
    </tbody>
  </table>

  <h2>Filter</h2>
  <p><code>GET /api/todos</code>, <code>/api/repositories/todos</code>, <code>/api/projects/:id/todos</code>, <code>/api/tabs/:tab/todos</code> und <code>/api/agent/next</code> akzeptieren: <code>projectId</code>, <code>projectName</code>, <code>repoPath</code>, <code>status</code>/<code>tab</code>, <code>priority</code>/<code>urgency</code>, <code>tag</code>, <code>q</code>, <code>includeDone=false</code>, <code>open=true</code>, <code>limit</code>, <code>sort=urgency|updated</code>.</p>

  <h2>Beispiele</h2>
  <pre>curl "${baseUrl}/api/agent/next?repoPath=D:%5CProjects%5CApp&limit=5"</pre>
  <pre>curl -X POST "${baseUrl}/api/todos" -H "content-type: application/json" -d "{\"repoPath\":\"D:\\\\Projects\\\\App\",\"title\":\"Login Bug fixen\",\"status\":\"bug\",\"priority\":\"urgent\",\"tags\":[\"auth\",\"bug\"]}"</pre>
  <pre>curl -X POST "${baseUrl}/api/todos/TODO_ID/move" -H "content-type: application/json" -d "{\"tab\":\"working\"}"</pre>

  <h2>MCP JSON-RPC</h2>
  <p>Der Endpunkt <code>/mcp</code> unterstuetzt <code>initialize</code>, <code>tools/list</code> und <code>tools/call</code>.</p>
  <pre>curl -X POST "${baseUrl}/mcp" -H "content-type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"</pre>
</main>
</body>
</html>`;

const openApiSpec = (baseUrl: string): JsonObject => ({
  openapi: '3.1.0',
  info: {
    title: 'Open-Git-Control Planning API',
    version: '1.0.0',
    description: 'Local API for repository todos, project planning, and agent tools.',
  },
  servers: [{ url: `${baseUrl}/api` }],
  paths: {
    '/health': { get: { summary: 'API health and planner metadata' } },
    '/projects': {
      get: { summary: 'List planning projects' },
      post: { summary: 'Create planned project' },
    },
    '/projects/{projectId}': {
      get: { summary: 'Get project with todos' },
      patch: { summary: 'Update project' },
      delete: { summary: 'Delete project and related todos' },
    },
    '/projects/{projectId}/todos': {
      get: { summary: 'List project todos' },
      post: { summary: 'Create project todo' },
    },
    '/repositories': { get: { summary: 'List known repositories with planner links' } },
    '/repositories/ensure': { post: { summary: 'Ensure repository planner project' } },
    '/repositories/todos': { get: { summary: 'List todos from repository projects' } },
    '/todos': {
      get: { summary: 'List todos across projects sorted by urgency by default' },
      post: { summary: 'Create todo' },
    },
    '/todos/next': { get: { summary: 'List next open todos sorted by urgency' } },
    '/todos/{todoId}': {
      get: { summary: 'Get todo' },
      patch: { summary: 'Update todo' },
      delete: { summary: 'Delete todo' },
    },
    '/todos/{todoId}/move': { post: { summary: 'Move todo between tabs or projects' } },
    '/tabs': { get: { summary: 'List tabs/statuses and aliases' } },
    '/tabs/{tab}/todos': {
      get: { summary: 'List todos in a tab/status' },
      post: { summary: 'Create todo in a tab/status' },
    },
    '/agent/next': { get: { summary: 'Agent shortcut for next open todos' } },
    '/mcp/tools': { get: { summary: 'List MCP-style tools' } },
    '/mcp/tools/call': { post: { summary: 'Call MCP-style tool over REST' } },
  },
  components: {
    schemas: {
      PlannerStatus: { type: 'string', enum: PLANNER_STATUSES },
      PlannerPriority: { type: 'string', enum: PLANNER_PRIORITIES },
    },
  },
});
