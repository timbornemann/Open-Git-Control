import { PLANNER_PRIORITIES, PLANNER_STATUSES, createPlannerItem, ensureRepositoryProject } from './projectPlannerStore';
import { AUTH_HEADER_NAME, ApiError, SERVER_NAME } from './planningApiTypes';
import type { PlanningApiServerHandle, JsonObject, PlanningApiServerOptions, RequestContext } from './planningApiTypes';
import {
  getRepositories,
  getTabs,
  getTodoById,
  getTodos,
  itemInputFromBody,
  parseStatus,
  queryOptionsFromUrl,
  resolveProjectLocator,
  cleanString,
} from './planningApiDomain';
import { handleProjectsRoute } from './planningProjectsController';
import { handleTodosRoute } from './planningTodosController';
import { startPlanningApiHost } from './planningApiServerHost';
import { MCP_TOOLS, callMcpTool, handleMcpRpc } from './mcpServer';

export type { PlanningApiServerHandle };

const routeApi = async (ctx: RequestContext): Promise<unknown> => {
  const [root, resource, idOrAction, nested] = ctx.segments;
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

  const projectsRoute = await handleProjectsRoute(ctx);
  if (projectsRoute.handled) return projectsRoute.value;

  const todosRoute = await handleTodosRoute(ctx);
  if (todosRoute.handled) return todosRoute.value;

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

  if (resource === 'repositories') {
    if (!idOrAction && ctx.method === 'GET') return { repositories: getRepositories() };
    if (idOrAction === 'ensure' && ctx.method === 'POST') {
      return ensureRepositoryProject(cleanString(ctx.body.repoPath));
    }
    if (idOrAction === 'todos' && ctx.method === 'GET') {
      return { todos: getTodos(queryOptionsFromUrl(ctx.url, { kind: 'repository' })) };
    }
  }

  if (resource === 'agent' && idOrAction === 'next' && ctx.method === 'GET') {
    return { todos: getTodos(queryOptionsFromUrl(ctx.url, { includeDone: false, limit: 20 })) };
  }

  if (resource === 'mcp' && idOrAction === 'tools') {
    if (!nested && ctx.method === 'GET') return { tools: MCP_TOOLS };
    if (nested === 'call' && ctx.method === 'POST') {
      const name = cleanString(ctx.body.name);
      const args = (ctx.body.arguments && typeof ctx.body.arguments === 'object' ? ctx.body.arguments : {}) as JsonObject;
      return callMcpTool(name, args);
    }
  }

  throw new ApiError(404, 'NOT_FOUND', 'Route not found.');
};

export async function startPlanningApiServer(options: PlanningApiServerOptions = {}): Promise<PlanningApiServerHandle> {
  return startPlanningApiHost(options, {
    routeApi,
    handleMcpRpc,
  });
}

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
  <p>Alle Daten- und MCP-Endpunkte benoetigen ein pro App-Prozess erzeugtes Token. Sende es als <code>${AUTH_HEADER_NAME}: &lt;TOKEN&gt;</code> oder <code>Authorization: Bearer &lt;TOKEN&gt;</code>.</p>

  <h2>REST-Endpunkte</h2>
  <table>
    <thead><tr><th>Methode</th><th>Pfad</th><th>Zweck</th></tr></thead>
    <tbody>
      <tr><td>GET</td><td><code>/api/health</code></td><td>Status, verfuegbare Tabs und Prioritaeten.</td></tr>
      <tr><td>GET</td><td><code>/api/openapi.json</code></td><td>Maschinenlesbare API-Beschreibung.</td></tr>
      <tr><td>GET/POST</td><td><code>/api/projects</code></td><td>Planungsprojekte lesen oder erstellen.</td></tr>
      <tr><td>GET/PATCH/DELETE</td><td><code>/api/projects/:projectId</code></td><td>Projekt lesen, umbenennen oder loeschen.</td></tr>
      <tr><td>GET/POST</td><td><code>/api/projects/:projectId/todos</code></td><td>Todos eines Projekts lesen oder erstellen.</td></tr>
      <tr><td>GET</td><td><code>/api/repositories</code></td><td>Bekannte Repositories mit Planner-Projekt.</td></tr>
      <tr><td>POST</td><td><code>/api/repositories/ensure</code></td><td>Planner-Projekt fuer <code>repoPath</code> sicherstellen.</td></tr>
      <tr><td>GET/POST</td><td><code>/api/todos</code></td><td>Todos projektuebergreifend lesen oder erstellen.</td></tr>
      <tr><td>GET/PATCH/DELETE</td><td><code>/api/todos/:todoId</code></td><td>Todo lesen, aktualisieren oder loeschen.</td></tr>
      <tr><td>POST</td><td><code>/api/todos/:todoId/move</code></td><td>Todo in anderen Tab oder ein anderes Projekt verschieben.</td></tr>
      <tr><td>GET</td><td><code>/api/mcp/tools</code></td><td>Agenten-Toolkatalog.</td></tr>
      <tr><td>POST</td><td><code>/api/mcp/tools/call</code></td><td>Tool per <code>{"name":"get_next_todos","arguments":{...}}</code> ausfuehren.</td></tr>
    </tbody>
  </table>

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
  security: [{ openGitControlToken: [] }, { bearerToken: [] }],
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
    '/mcp/tools': { get: { summary: 'List MCP-style tools' } },
    '/mcp/tools/call': { post: { summary: 'Call MCP-style tool over REST' } },
  },
});
