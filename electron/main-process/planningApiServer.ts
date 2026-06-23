import * as http from 'http';
import * as crypto from 'crypto';
import { URL } from 'url';
import { GitService, gitService as defaultGitService } from '../GitService';
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
const AUTH_HEADER_NAME = 'x-open-git-control-token';
const AUTH_BEARER_PREFIX = 'bearer ';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'OPTIONS';
type JsonObject = Record<string, unknown>;
type RequestContext = {
  method: HttpMethod;
  url: URL;
  segments: string[];
  body: JsonObject;
  baseUrl: string;
  gitService: GitService;
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
  projectName: string;
  projectKind: PlannerProject['kind'];
  projectRepoPath: string | null;
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
  gitService?: GitService;
  authToken?: string;
  authTokenProvider?: () => string;
};

export type PlanningApiServerHandle = {
  host: string;
  port: number;
  url: string;
  authToken: string;
  authHeaderName: string;
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

type GitStatusEntry = {
  path: string;
  index: string;
  workingTree: string;
  code: string;
};

type GitBranchEntry = {
  name: string;
  type: 'local' | 'remote';
  current: boolean;
  commit: string;
  updatedAt: string;
  upstream: string | null;
};

type GitCommitEntry = {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
  refs: string[];
};

const CONFLICT_CODES = new Set(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']);

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

const createAuthToken = (configuredToken?: string): string => {
  const configured = cleanString(configuredToken ?? process.env.OPEN_GIT_CONTROL_API_TOKEN);
  if (configured.length >= 16) return configured;
  return crypto.randomBytes(32).toString('base64url');
};

const headerValue = (value: string | string[] | undefined): string => (
  Array.isArray(value) ? String(value[0] || '') : String(value || '')
);

const isAllowedCorsOrigin = (origin: string): boolean => {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    const protocolAllowed = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    const hostname = parsed.hostname.toLowerCase();
    return protocolAllowed && (
      hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '::1'
      || hostname === '[::1]'
    );
  } catch {
    return false;
  }
};

const timingSafeTokenEquals = (candidate: string, expected: string): boolean => {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  if (candidateBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
};

const getRequestAuthToken = (request: http.IncomingMessage): string => {
  const headerToken = headerValue(request.headers[AUTH_HEADER_NAME]);
  if (headerToken) return headerToken.trim();

  const authorization = headerValue(request.headers.authorization).trim();
  if (authorization.toLowerCase().startsWith(AUTH_BEARER_PREFIX)) {
    return authorization.slice(AUTH_BEARER_PREFIX.length).trim();
  }
  return '';
};

const isPublicApiRequest = (url: URL, method: HttpMethod): boolean => {
  if (method !== 'GET') return false;
  return (
    url.pathname === '/'
    || url.pathname === '/api'
    || url.pathname === '/api/'
    || url.pathname === '/api/health'
    || url.pathname === '/api/openapi.json'
  );
};

const requireAuthorizedRequest = (
  request: http.IncomingMessage,
  url: URL,
  method: HttpMethod,
  authToken: string,
): void => {
  if (isPublicApiRequest(url, method)) return;
  const token = getRequestAuthToken(request);
  if (!token || !timingSafeTokenEquals(token, authToken)) {
    throw new ApiError(
      401,
      'UNAUTHORIZED',
      `Missing or invalid API token. Provide it as ${AUTH_HEADER_NAME} or Authorization: Bearer <token>.`,
    );
  }
};

const parseStringArray = (value: unknown, fieldName: string, maxLength = 200): string[] => {
  if (!Array.isArray(value)) {
    throw new ApiError(400, 'INVALID_ARRAY', `${fieldName} must be an array of strings.`);
  }
  const result = value
    .map((entry) => cleanString(entry))
    .filter(Boolean)
    .slice(0, maxLength);
  if (result.some((entry) => /[\0\r\n]/.test(entry))) {
    throw new ApiError(400, 'INVALID_VALUE', `${fieldName} entries must not contain control characters.`);
  }
  return result;
};

const requireWriteConfirmation = (body: JsonObject, action: string): void => {
  if (body.confirm !== true) {
    throw new ApiError(400, 'CONFIRMATION_REQUIRED', `${action} requires {"confirm":true}.`);
  }
};

const cleanGitRef = (value: unknown, fieldName: string): string => {
  const ref = cleanString(value);
  if (!ref) throw new ApiError(400, 'GIT_REF_REQUIRED', `${fieldName} is required.`);
  if (ref.length > 240 || /[\0\r\n]/.test(ref) || ref.startsWith('-')) {
    throw new ApiError(400, 'INVALID_GIT_REF', `${fieldName} is not a safe Git ref.`);
  }
  if (ref.includes('..') || ref.includes('@{') || ref.endsWith('.') || ref.endsWith('/') || ref.includes('//')) {
    throw new ApiError(400, 'INVALID_GIT_REF', `${fieldName} is not a safe Git ref.`);
  }
  return ref;
};

const cleanOptionalGitRef = (value: unknown, fieldName: string): string | undefined => {
  const ref = cleanString(value);
  return ref ? cleanGitRef(ref, fieldName) : undefined;
};

const resolveGitRepoPath = async (
  gitService: GitService,
  source: JsonObject | URL,
): Promise<string> => {
  const repoPath = source instanceof URL
    ? cleanString(source.searchParams.get('repoPath'))
    : cleanString(source.repoPath);
  const fallback = gitService.getRepoPath();
  const candidate = repoPath || fallback || '';
  if (!candidate) {
    throw new ApiError(400, 'REPO_REQUIRED', 'Provide repoPath or select a repository in the app.');
  }
  try {
    const root = await gitService.runCommandAtPath(candidate, ['rev-parse', '--show-toplevel']);
    return root.trim() || candidate;
  } catch (error) {
    throw new ApiError(
      400,
      'INVALID_REPOSITORY',
      error instanceof Error ? error.message : String(error),
    );
  }
};

const truncateText = (value: string, maxBytes = 1_000_000): { text: string; truncated: boolean; bytes: number } => {
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes <= maxBytes) return { text: value, truncated: false, bytes };
  let text = value;
  while (Buffer.byteLength(text, 'utf8') > maxBytes) {
    text = text.slice(0, Math.max(0, text.length - 1024));
  }
  return { text, truncated: true, bytes: Buffer.byteLength(text, 'utf8') };
};

const decodeGitPath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"')) return trimmed;
  try {
    return JSON.parse(trimmed) as string;
  } catch {
    return trimmed.replace(/^"|"$/g, '');
  }
};

const parseStatusPath = (line: string): string => {
  const payload = line.slice(3).trim();
  const renameSeparator = payload.lastIndexOf(' -> ');
  return decodeGitPath(renameSeparator >= 0 ? payload.slice(renameSeparator + 4) : payload);
};

const parseGitStatusPorcelain = (raw: string) => {
  const entries: GitStatusEntry[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, '');
    if (line.length < 3) continue;
    const index = line[0];
    const workingTree = line[1];
    const path = parseStatusPath(line);
    if (!path) continue;
    entries.push({ path, index, workingTree, code: `${index}${workingTree}` });
  }
  return {
    entries,
    staged: entries.filter((entry) => entry.index !== ' ' && entry.index !== '?'),
    unstaged: entries.filter((entry) => entry.workingTree !== ' ' && entry.workingTree !== '?'),
    untracked: entries.filter((entry) => entry.code === '??'),
    conflicts: entries.filter((entry) => CONFLICT_CODES.has(entry.code)),
  };
};

const parseBranchStatus = (raw: string) => {
  const result = {
    current: null as string | null,
    upstream: null as string | null,
    ahead: 0,
    behind: 0,
    hasUpstream: false,
  };
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length).trim();
      result.current = head === '(detached)' ? null : head;
    } else if (line.startsWith('# branch.upstream ')) {
      result.upstream = line.slice('# branch.upstream '.length).trim() || null;
      result.hasUpstream = true;
    } else {
      const ab = line.match(/^# branch\.ab \+(\d+) -(\d+)$/);
      if (ab) {
        result.ahead = Number(ab[1]);
        result.behind = Number(ab[2]);
        result.hasUpstream = true;
      }
    }
  }
  return result;
};

const parseNumstat = (raw: string) => {
  const stats = { files: 0, additions: 0, deletions: 0 };
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
    if (!match) continue;
    stats.files += 1;
    if (match[1] !== '-') stats.additions += Number(match[1]);
    if (match[2] !== '-') stats.deletions += Number(match[2]);
  }
  return stats;
};

const parseBranches = (raw: string): GitBranchEntry[] => (
  raw
    .split('\0')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record): GitBranchEntry | null => {
      const [refname = '', commit = '', updatedAt = '', upstream = '', head = ''] = record.split('\x1f');
      if (!refname) return null;
      const isRemote = refname.startsWith('refs/remotes/');
      const name = isRemote
        ? refname.slice('refs/remotes/'.length)
        : refname.replace(/^refs\/heads\//, '');
      if (!name || name.endsWith('/HEAD')) return null;
      return {
        name,
        type: isRemote ? 'remote' : 'local',
        current: head === '*',
        commit,
        updatedAt,
        upstream: upstream || null,
      };
    })
    .filter((branch): branch is GitBranchEntry => branch !== null)
);

const parseCommitLog = (raw: string): GitCommitEntry[] => (
  raw
    .split('\0')
    .map((record) => record.replace(/^\r?\n/, '').trim())
    .filter(Boolean)
    .map((record): GitCommitEntry | null => {
      const [hash = '', shortHash = '', author = '', date = '', subject = '', refsRaw = ''] = record.split('\x1f');
      if (!hash) return null;
      return {
        hash,
        shortHash,
        author,
        date,
        subject,
        refs: refsRaw ? refsRaw.split('\x1d').map((ref) => ref.trim()).filter(Boolean) : [],
      };
    })
    .filter((commit): commit is GitCommitEntry => commit !== null)
);

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

const getGitStatus = async (gitService: GitService, source: JsonObject | URL) => {
  const repoPath = await resolveGitRepoPath(gitService, source);
  const [statusRaw, branchRaw] = await Promise.all([
    gitService.runCommandAtPath(repoPath, ['status', '--porcelain=v1', '--untracked-files=all']),
    gitService.runCommandAtPath(repoPath, ['status', '--porcelain=v2', '--branch']),
  ]);
  const parsed = parseGitStatusPorcelain(statusRaw);
  return {
    repoPath,
    branch: parseBranchStatus(branchRaw),
    raw: statusRaw,
    changeCount: parsed.entries.length,
    ...parsed,
  };
};

const getWorkingTree = async (gitService: GitService, source: JsonObject | URL) => {
  const repoPath = await resolveGitRepoPath(gitService, source);
  const [status, stagedRaw, unstagedRaw] = await Promise.all([
    getGitStatus(gitService, source),
    gitService.runCommandAtPath(repoPath, ['diff', '--numstat', '--cached']),
    gitService.runCommandAtPath(repoPath, ['diff', '--numstat']),
  ]);
  return {
    ...status,
    stats: {
      staged: parseNumstat(stagedRaw),
      unstaged: parseNumstat(unstagedRaw),
    },
  };
};

const getGitDiff = async (gitService: GitService, url: URL) => {
  const repoPath = await resolveGitRepoPath(gitService, url);
  const scope = url.searchParams.get('scope') || 'unstaged';
  const filePath = cleanString(url.searchParams.get('path'));
  const maxBytes = parseLimit(url.searchParams.get('maxBytes'), 1_000_000) || 1_000_000;
  const args = ['diff'];
  if (scope === 'staged' || scope === 'cached') {
    args.push('--cached');
  } else if (scope === 'commit') {
    const ref = cleanGitRef(url.searchParams.get('ref') || 'HEAD', 'ref');
    args.push(`${ref}^!`);
  } else if (scope !== 'unstaged') {
    throw new ApiError(400, 'INVALID_DIFF_SCOPE', 'scope must be unstaged, staged, cached, or commit.');
  }
  if (filePath) args.push('--', filePath);
  const raw = await gitService.runCommandAtPath(repoPath, args);
  return {
    repoPath,
    scope,
    path: filePath || null,
    ...truncateText(raw, maxBytes),
  };
};

const listGitBranches = async (gitService: GitService, source: JsonObject | URL) => {
  const repoPath = await resolveGitRepoPath(gitService, source);
  const [branchesRaw, branchRaw] = await Promise.all([
    gitService.runCommandAtPath(repoPath, [
      'for-each-ref',
      '--format=%(refname)%1f%(objectname:short)%1f%(committerdate:iso8601)%1f%(upstream:short)%1f%(HEAD)%00',
      'refs/heads',
      'refs/remotes',
    ]),
    gitService.runCommandAtPath(repoPath, ['status', '--porcelain=v2', '--branch']),
  ]);
  const branches = parseBranches(branchesRaw);
  return {
    repoPath,
    branch: parseBranchStatus(branchRaw),
    branches,
    local: branches.filter((branch) => branch.type === 'local'),
    remote: branches.filter((branch) => branch.type === 'remote'),
  };
};

const createGitBranch = async (gitService: GitService, body: JsonObject) => {
  requireWriteConfirmation(body, 'Creating a branch');
  const repoPath = await resolveGitRepoPath(gitService, body);
  const name = cleanGitRef(body.name, 'name');
  const startPoint = cleanOptionalGitRef(body.startPoint, 'startPoint');
  const checkout = parseBoolean(body.checkout) === true;
  const args = checkout ? ['checkout', '-b', name] : ['branch', name];
  if (startPoint) args.push(startPoint);
  const output = await gitService.runCommandAtPath(repoPath, args);
  return { repoPath, name, checkedOut: checkout, output };
};

const checkoutGitBranch = async (gitService: GitService, body: JsonObject) => {
  requireWriteConfirmation(body, 'Checking out a branch');
  const repoPath = await resolveGitRepoPath(gitService, body);
  const ref = cleanGitRef(body.ref ?? body.name, 'ref');
  const create = parseBoolean(body.create) === true;
  const startPoint = cleanOptionalGitRef(body.startPoint, 'startPoint');
  const args = create ? ['checkout', '-b', ref] : ['checkout', ref];
  if (create && startPoint) args.push(startPoint);
  const output = await gitService.runCommandAtPath(repoPath, args);
  return { repoPath, ref, created: create, output };
};

const renameGitBranch = async (gitService: GitService, body: JsonObject) => {
  requireWriteConfirmation(body, 'Renaming a branch');
  const repoPath = await resolveGitRepoPath(gitService, body);
  const nextName = cleanGitRef(body.newName, 'newName');
  const currentName = cleanOptionalGitRef(body.currentName, 'currentName');
  const args = currentName ? ['branch', '-m', currentName, nextName] : ['branch', '-m', nextName];
  const output = await gitService.runCommandAtPath(repoPath, args);
  return { repoPath, currentName: currentName || null, newName: nextName, output };
};

const deleteGitBranch = async (gitService: GitService, body: JsonObject) => {
  requireWriteConfirmation(body, 'Deleting a branch');
  const repoPath = await resolveGitRepoPath(gitService, body);
  const name = cleanGitRef(body.name, 'name');
  const force = parseBoolean(body.force) === true;
  const output = await gitService.runCommandAtPath(repoPath, ['branch', force ? '-D' : '-d', name]);
  return { repoPath, name, force, output };
};

const listGitCommits = async (gitService: GitService, url: URL) => {
  const repoPath = await resolveGitRepoPath(gitService, url);
  const limit = parseLimit(url.searchParams.get('limit'), 50) || 50;
  const scope = url.searchParams.get('scope') === 'head' ? 'head' : 'all';
  const offset = Math.max(0, Math.floor(Number(url.searchParams.get('offset')) || 0));
  const format = '%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%(decorate:prefix=,suffix=,separator=%x1d)%x00';
  const args = ['log', '--topo-order', '-z', `-${limit}`, `--skip=${offset}`, `--pretty=format:${format}`, '--date=iso'];
  if (scope === 'all') args.splice(1, 0, '--all');
  const raw = await gitService.runCommandAtPath(repoPath, args);
  return { repoPath, scope, commits: parseCommitLog(raw) };
};

const stageGitPaths = async (gitService: GitService, body: JsonObject) => {
  requireWriteConfirmation(body, 'Staging paths');
  const repoPath = await resolveGitRepoPath(gitService, body);
  const paths = parseStringArray(body.paths, 'paths', 500);
  if (paths.length === 0) throw new ApiError(400, 'PATHS_REQUIRED', 'paths must contain at least one path.');
  const output = await gitService.stagePathsAtPath(repoPath, paths);
  return { repoPath, paths, output };
};

const unstageGitPaths = async (gitService: GitService, body: JsonObject) => {
  requireWriteConfirmation(body, 'Unstaging paths');
  const repoPath = await resolveGitRepoPath(gitService, body);
  const paths = parseStringArray(body.paths, 'paths', 500);
  if (paths.length === 0) throw new ApiError(400, 'PATHS_REQUIRED', 'paths must contain at least one path.');
  const output = await gitService.unstagePathsAtPath(repoPath, paths);
  return { repoPath, paths, output };
};

const createGitCommit = async (gitService: GitService, body: JsonObject) => {
  requireWriteConfirmation(body, 'Creating a commit');
  const repoPath = await resolveGitRepoPath(gitService, body);
  const title = cleanString(body.title || body.message);
  if (!title) throw new ApiError(400, 'COMMIT_TITLE_REQUIRED', 'title is required.');
  const description = cleanString(body.description);
  const output = await gitService.commitWithMessageAtPath(repoPath, {
    title,
    description,
    amend: parseBoolean(body.amend) === true,
    signoff: parseBoolean(body.signoff) === true,
  });
  const hash = await gitService.runCommandAtPath(repoPath, ['rev-parse', 'HEAD']);
  return { repoPath, hash: hash.trim(), output };
};

const listGitRemotes = async (gitService: GitService, source: JsonObject | URL) => {
  const repoPath = await resolveGitRepoPath(gitService, source);
  const raw = await gitService.runCommandAtPath(repoPath, ['remote', '-v']);
  const remotes = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
      return match ? { name: match[1], url: match[2], type: match[3] } : null;
    })
    .filter((remote): remote is { name: string; url: string; type: string } => remote !== null);
  return { repoPath, remotes };
};

const runRemoteAction = async (
  gitService: GitService,
  body: JsonObject,
  action: 'fetch' | 'pull' | 'push',
) => {
  requireWriteConfirmation(body, `Running git ${action}`);
  const repoPath = await resolveGitRepoPath(gitService, body);
  const remote = cleanOptionalGitRef(body.remote, 'remote');
  const branch = cleanOptionalGitRef(body.branch, 'branch');
  const args: string[] = [action];
  if (action === 'fetch') {
    if (parseBoolean(body.all) !== false) args.push('--all');
    if (parseBoolean(body.prune) !== false) args.push('--prune');
    if (parseBoolean(body.tags) !== false) args.push('--tags');
    if (remote && !args.includes('--all')) args.push(remote);
  } else if (action === 'push') {
    if (parseBoolean(body.setUpstream) === true) args.push('-u');
    if (parseBoolean(body.forceWithLease) === true) args.push('--force-with-lease');
    if (remote) args.push(remote);
    if (branch) args.push(branch);
  } else {
    if (remote) args.push(remote);
    if (branch) args.push(branch);
  }
  const output = await gitService.runCommandAtPath(repoPath, args);
  return { repoPath, action, args, output };
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
      auth: {
        required: true,
        headerName: AUTH_HEADER_NAME,
        bearerSupported: true,
      },
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

  if (resource === 'git') {
    if (idOrAction === 'status' && ctx.method === 'GET') return getGitStatus(ctx.gitService, ctx.url);
    if (idOrAction === 'working-tree' && ctx.method === 'GET') return getWorkingTree(ctx.gitService, ctx.url);
    if (idOrAction === 'diff' && ctx.method === 'GET') return getGitDiff(ctx.gitService, ctx.url);
    if (idOrAction === 'branches') {
      if (!nested && ctx.method === 'GET') return listGitBranches(ctx.gitService, ctx.url);
      if (!nested && ctx.method === 'POST') return createGitBranch(ctx.gitService, ctx.body);
      if (nested === 'checkout' && ctx.method === 'POST') return checkoutGitBranch(ctx.gitService, ctx.body);
      if (nested === 'rename' && ctx.method === 'POST') return renameGitBranch(ctx.gitService, ctx.body);
      if (nested === 'delete' && ctx.method === 'POST') return deleteGitBranch(ctx.gitService, ctx.body);
    }
    if (idOrAction === 'commits' && ctx.method === 'GET') return listGitCommits(ctx.gitService, ctx.url);
    if (idOrAction === 'stage' && ctx.method === 'POST') return stageGitPaths(ctx.gitService, ctx.body);
    if (idOrAction === 'unstage' && ctx.method === 'POST') return unstageGitPaths(ctx.gitService, ctx.body);
    if (idOrAction === 'commit' && ctx.method === 'POST') return createGitCommit(ctx.gitService, ctx.body);
    if (idOrAction === 'remotes') {
      if (!nested && ctx.method === 'GET') return listGitRemotes(ctx.gitService, ctx.url);
      if (nested === 'fetch' && ctx.method === 'POST') return runRemoteAction(ctx.gitService, ctx.body, 'fetch');
      if (nested === 'pull' && ctx.method === 'POST') return runRemoteAction(ctx.gitService, ctx.body, 'pull');
      if (nested === 'push' && ctx.method === 'POST') return runRemoteAction(ctx.gitService, ctx.body, 'push');
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
      return callAgentTool(ctx.gitService, name, args);
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

const urlFromToolArgs = (args: JsonObject): URL => {
  const url = new URL('http://local/tool');
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || typeof value === 'object') continue;
    url.searchParams.set(key, String(value));
  }
  return url;
};

const callAgentTool = async (gitService: GitService, name: string, args: JsonObject): Promise<unknown> => {
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
    case 'get_git_status':
      return getGitStatus(gitService, args);
    case 'get_working_tree':
      return getWorkingTree(gitService, args);
    case 'get_git_diff':
      return getGitDiff(gitService, urlFromToolArgs(args));
    case 'list_branches':
      return listGitBranches(gitService, args);
    case 'create_branch':
      return createGitBranch(gitService, args);
    case 'checkout_branch':
      return checkoutGitBranch(gitService, args);
    case 'rename_branch':
      return renameGitBranch(gitService, args);
    case 'delete_branch':
      return deleteGitBranch(gitService, args);
    case 'list_commits':
      return listGitCommits(gitService, urlFromToolArgs(args));
    case 'stage_paths':
      return stageGitPaths(gitService, args);
    case 'unstage_paths':
      return unstageGitPaths(gitService, args);
    case 'create_commit':
      return createGitCommit(gitService, args);
    case 'list_remotes':
      return listGitRemotes(gitService, args);
    case 'fetch_remote':
      return runRemoteAction(gitService, args, 'fetch');
    case 'pull_remote':
      return runRemoteAction(gitService, args, 'pull');
    case 'push_remote':
      return runRemoteAction(gitService, args, 'push');
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
  {
    name: 'get_git_status',
    title: 'Get Git status',
    description: 'Read branch sync state and staged, unstaged, untracked, and conflicted paths.',
    inputSchema: repoLocatorSchema(),
  },
  {
    name: 'get_working_tree',
    title: 'Get working tree',
    description: 'Read Git status plus staged and unstaged diff statistics.',
    inputSchema: repoLocatorSchema(),
  },
  {
    name: 'get_git_diff',
    title: 'Get Git diff',
    description: 'Read a truncated diff for unstaged, staged, or commit scope.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        scope: { type: 'string', enum: ['unstaged', 'staged', 'cached', 'commit'] },
        ref: { type: 'string' },
        path: { type: 'string' },
        maxBytes: { type: 'number' },
      },
    },
  },
  {
    name: 'list_branches',
    title: 'List branches',
    description: 'List local and remote branches with current branch and upstream sync data.',
    inputSchema: repoLocatorSchema(),
  },
  {
    name: 'create_branch',
    title: 'Create branch',
    description: 'Create a local branch, optionally checking it out. Requires confirm=true.',
    inputSchema: branchMutationSchema(['repoPath', 'name', 'confirm']),
  },
  {
    name: 'checkout_branch',
    title: 'Checkout branch',
    description: 'Checkout an existing branch or create and checkout a new branch. Requires confirm=true.',
    inputSchema: branchMutationSchema(['repoPath', 'ref', 'confirm']),
  },
  {
    name: 'rename_branch',
    title: 'Rename branch',
    description: 'Rename the current branch or a named local branch. Requires confirm=true.',
    inputSchema: branchMutationSchema(['repoPath', 'newName', 'confirm']),
  },
  {
    name: 'delete_branch',
    title: 'Delete branch',
    description: 'Delete a local branch, optionally forced. Requires confirm=true.',
    inputSchema: branchMutationSchema(['repoPath', 'name', 'confirm']),
  },
  {
    name: 'list_commits',
    title: 'List commits',
    description: 'List commits for the repository history.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        limit: { type: 'number' },
        offset: { type: 'number' },
        scope: { type: 'string', enum: ['all', 'head'] },
      },
    },
  },
  {
    name: 'stage_paths',
    title: 'Stage paths',
    description: 'Stage one or more repository-relative paths. Requires confirm=true.',
    inputSchema: pathsMutationSchema(),
  },
  {
    name: 'unstage_paths',
    title: 'Unstage paths',
    description: 'Unstage one or more repository-relative paths. Requires confirm=true.',
    inputSchema: pathsMutationSchema(),
  },
  {
    name: 'create_commit',
    title: 'Create commit',
    description: 'Create a commit from staged changes. Requires confirm=true.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        amend: { type: 'boolean' },
        signoff: { type: 'boolean' },
        confirm: { type: 'boolean' },
      },
      required: ['repoPath', 'title', 'confirm'],
    },
  },
  {
    name: 'list_remotes',
    title: 'List remotes',
    description: 'List configured Git remotes.',
    inputSchema: repoLocatorSchema(),
  },
  {
    name: 'fetch_remote',
    title: 'Fetch remote',
    description: 'Run git fetch with safe defaults. Requires confirm=true.',
    inputSchema: remoteActionSchema(),
  },
  {
    name: 'pull_remote',
    title: 'Pull remote',
    description: 'Run git pull. Requires confirm=true.',
    inputSchema: remoteActionSchema(),
  },
  {
    name: 'push_remote',
    title: 'Push remote',
    description: 'Run git push, optionally setting upstream or force-with-lease. Requires confirm=true.',
    inputSchema: remoteActionSchema(),
  },
];

function repoLocatorSchema(): JsonObject {
  return {
    type: 'object',
    properties: {
      repoPath: { type: 'string' },
    },
  };
}

function branchMutationSchema(required: string[]): JsonObject {
  return {
    type: 'object',
    properties: {
      repoPath: { type: 'string' },
      name: { type: 'string' },
      ref: { type: 'string' },
      currentName: { type: 'string' },
      newName: { type: 'string' },
      startPoint: { type: 'string' },
      checkout: { type: 'boolean' },
      create: { type: 'boolean' },
      force: { type: 'boolean' },
      confirm: { type: 'boolean' },
    },
    required,
  };
}

function pathsMutationSchema(): JsonObject {
  return {
    type: 'object',
    properties: {
      repoPath: { type: 'string' },
      paths: { type: 'array', items: { type: 'string' } },
      confirm: { type: 'boolean' },
    },
    required: ['repoPath', 'paths', 'confirm'],
  };
}

function remoteActionSchema(): JsonObject {
  return {
    type: 'object',
    properties: {
      repoPath: { type: 'string' },
      remote: { type: 'string' },
      branch: { type: 'string' },
      all: { type: 'boolean' },
      prune: { type: 'boolean' },
      tags: { type: 'boolean' },
      setUpstream: { type: 'boolean' },
      forceWithLease: { type: 'boolean' },
      confirm: { type: 'boolean' },
    },
    required: ['repoPath', 'confirm'],
  };
}

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

const handleMcpRpc = async (payload: unknown, gitService: GitService): Promise<unknown> => {
  if (Array.isArray(payload)) {
    const responses = (await Promise.all(payload.map((entry) => handleMcpMessage(entry, gitService))))
      .filter((entry) => entry !== null);
    return responses.length > 0 ? responses : null;
  }
  return handleMcpMessage(payload, gitService);
};

const handleMcpMessage = async (message: unknown, gitService: GitService): Promise<unknown> => {
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
        const structuredContent = await callAgentTool(gitService, toolName, args);
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

const createPlanningApiRequestHandler = (deps: { gitService: GitService; getAuthToken: () => string }) => async (
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> => {
  setCommonHeaders(response, request);

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
    requireAuthorizedRequest(request, url, method, deps.getAuthToken());
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
      const rpcResponse = await handleMcpRpc(payload, deps.gitService);
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
    const result = await routeApi({ method, url, segments, body, baseUrl, gitService: deps.gitService });

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
  const staticAuthToken = createAuthToken(options.authToken);
  const getAuthToken = options.authTokenProvider || (() => staticAuthToken);
  const handler = createPlanningApiRequestHandler({
    gitService: options.gitService || defaultGitService,
    getAuthToken,
  });

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
        get authToken() {
          return getAuthToken();
        },
        authHeaderName: AUTH_HEADER_NAME,
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

const setCommonHeaders = (response: http.ServerResponse, request?: http.IncomingMessage): void => {
  const origin = headerValue(request?.headers.origin);
  if (isAllowedCorsOrigin(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', `content-type, accept, mcp-protocol-version, authorization, ${AUTH_HEADER_NAME}`);
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
  <p>Alle Daten-, Git- und MCP-Endpunkte benoetigen ein pro App-Prozess erzeugtes Token. Sende es als <code>${AUTH_HEADER_NAME}: &lt;TOKEN&gt;</code> oder <code>Authorization: Bearer &lt;TOKEN&gt;</code>. Das aktuelle Token findest du in den Open-Git-Control Einstellungen unter API/MCP.</p>

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
      <tr><td>GET</td><td><code>/api/git/status</code></td><td>Branch-Sync sowie staged, unstaged, untracked und conflict paths.</td></tr>
      <tr><td>GET</td><td><code>/api/git/working-tree</code></td><td>Working-Tree-Status plus staged/unstaged Diff-Statistiken.</td></tr>
      <tr><td>GET</td><td><code>/api/git/diff?scope=unstaged|staged|commit</code></td><td>Gekuerzte Diffs fuer Agenten-Kontext.</td></tr>
      <tr><td>GET/POST</td><td><code>/api/git/branches</code></td><td>Branches listen oder neuen Branch erstellen.</td></tr>
      <tr><td>POST</td><td><code>/api/git/branches/checkout</code></td><td>Branch wechseln oder neuen Branch erstellen und auschecken.</td></tr>
      <tr><td>POST</td><td><code>/api/git/branches/rename</code></td><td>Lokalen Branch umbenennen.</td></tr>
      <tr><td>POST</td><td><code>/api/git/branches/delete</code></td><td>Lokalen Branch loeschen.</td></tr>
      <tr><td>GET</td><td><code>/api/git/commits</code></td><td>Commits aus der Repo-Historie lesen.</td></tr>
      <tr><td>POST</td><td><code>/api/git/stage</code></td><td>Pfade stagen.</td></tr>
      <tr><td>POST</td><td><code>/api/git/unstage</code></td><td>Pfade unstagen.</td></tr>
      <tr><td>POST</td><td><code>/api/git/commit</code></td><td>Commit aus staged changes erstellen.</td></tr>
      <tr><td>GET/POST</td><td><code>/api/git/remotes</code></td><td>Remotes listen; Fetch/Pull/Push ueber Unterpfade ausfuehren.</td></tr>
      <tr><td>GET</td><td><code>/api/mcp/tools</code></td><td>Agenten-Toolkatalog.</td></tr>
      <tr><td>POST</td><td><code>/api/mcp/tools/call</code></td><td>Tool per <code>{"name":"get_next_todos","arguments":{...}}</code> ausfuehren.</td></tr>
    </tbody>
  </table>

  <h2>Filter</h2>
  <p><code>GET /api/todos</code>, <code>/api/repositories/todos</code>, <code>/api/projects/:id/todos</code>, <code>/api/tabs/:tab/todos</code> und <code>/api/agent/next</code> akzeptieren: <code>projectId</code>, <code>projectName</code>, <code>repoPath</code>, <code>status</code>/<code>tab</code>, <code>priority</code>/<code>urgency</code>, <code>tag</code>, <code>q</code>, <code>includeDone=false</code>, <code>open=true</code>, <code>limit</code>, <code>sort=urgency|updated</code>.</p>
  <p>Schreibende Git-Endpunkte erwarten <code>{"confirm":true}</code> im JSON-Body. Das gilt fuer Branch-, Stage-/Unstage-, Commit- und Remote-Aktionen.</p>

  <h2>Beispiele</h2>
  <pre>curl "${baseUrl}/api/agent/next?repoPath=D:%5CProjects%5CApp&limit=5" -H "${AUTH_HEADER_NAME}: &lt;TOKEN&gt;"</pre>
  <pre>curl -X POST "${baseUrl}/api/todos" -H "${AUTH_HEADER_NAME}: &lt;TOKEN&gt;" -H "content-type: application/json" -d "{\"repoPath\":\"D:\\\\Projects\\\\App\",\"title\":\"Login Bug fixen\",\"status\":\"bug\",\"priority\":\"urgent\",\"tags\":[\"auth\",\"bug\"]}"</pre>
  <pre>curl -X POST "${baseUrl}/api/todos/TODO_ID/move" -H "${AUTH_HEADER_NAME}: &lt;TOKEN&gt;" -H "content-type: application/json" -d "{\"tab\":\"working\"}"</pre>
  <pre>curl "${baseUrl}/api/git/status?repoPath=D:%5CProjects%5CApp" -H "${AUTH_HEADER_NAME}: &lt;TOKEN&gt;"</pre>
  <pre>curl -X POST "${baseUrl}/api/git/branches" -H "${AUTH_HEADER_NAME}: &lt;TOKEN&gt;" -H "content-type: application/json" -d "{\"repoPath\":\"D:\\\\Projects\\\\App\",\"name\":\"agent/work\",\"checkout\":true,\"confirm\":true}"</pre>
  <pre>curl -X POST "${baseUrl}/api/git/commit" -H "${AUTH_HEADER_NAME}: &lt;TOKEN&gt;" -H "content-type: application/json" -d "{\"repoPath\":\"D:\\\\Projects\\\\App\",\"title\":\"Implement planned work\",\"confirm\":true}"</pre>

  <h2>MCP JSON-RPC</h2>
  <p>Der Endpunkt <code>/mcp</code> unterstuetzt <code>initialize</code>, <code>tools/list</code> und <code>tools/call</code>.</p>
  <pre>curl -X POST "${baseUrl}/mcp" -H "${AUTH_HEADER_NAME}: &lt;TOKEN&gt;" -H "content-type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"</pre>
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
  components: {
    securitySchemes: {
      openGitControlToken: {
        type: 'apiKey',
        in: 'header',
        name: AUTH_HEADER_NAME,
      },
      bearerToken: {
        type: 'http',
        scheme: 'bearer',
      },
    },
    schemas: {
      PlannerStatus: { type: 'string', enum: PLANNER_STATUSES },
      PlannerPriority: { type: 'string', enum: PLANNER_PRIORITIES },
    },
  },
  security: [
    { openGitControlToken: [] },
    { bearerToken: [] },
  ],
  paths: {
    '/health': { get: { summary: 'API health and planner metadata', security: [] } },
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
    '/git/status': { get: { summary: 'Read Git status and branch sync state' } },
    '/git/working-tree': { get: { summary: 'Read working tree status and diff stats' } },
    '/git/diff': { get: { summary: 'Read truncated Git diff text' } },
    '/git/branches': {
      get: { summary: 'List local and remote branches' },
      post: { summary: 'Create local branch' },
    },
    '/git/branches/checkout': { post: { summary: 'Checkout branch or create and checkout branch' } },
    '/git/branches/rename': { post: { summary: 'Rename local branch' } },
    '/git/branches/delete': { post: { summary: 'Delete local branch' } },
    '/git/commits': { get: { summary: 'List commits' } },
    '/git/stage': { post: { summary: 'Stage repository-relative paths' } },
    '/git/unstage': { post: { summary: 'Unstage repository-relative paths' } },
    '/git/commit': { post: { summary: 'Create commit from staged changes' } },
    '/git/remotes': { get: { summary: 'List Git remotes' } },
    '/git/remotes/fetch': { post: { summary: 'Run git fetch' } },
    '/git/remotes/pull': { post: { summary: 'Run git pull' } },
    '/git/remotes/push': { post: { summary: 'Run git push' } },
    '/mcp/tools': { get: { summary: 'List MCP-style tools' } },
    '/mcp/tools/call': { post: { summary: 'Call MCP-style tool over REST' } },
  },
});
