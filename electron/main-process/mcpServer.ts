import { PLANNER_PRIORITIES, PLANNER_STATUSES, createPlannedProject, deletePlannerItem, ensureRepositoryProject } from './projectPlannerStore';
import type { JsonObject } from './planningApiTypes';
import { MCP_PROTOCOL_VERSION, SERVER_NAME, ApiError } from './planningApiTypes';
import {
  cleanString,
  getRepositories,
  getTabs,
  createTodoFromBody,
  getTodos,
  listProjectsForTool,
  moveTodoFromBody,
  toolTodoOptions,
  updateTodoFromBody,
} from './planningApiDomain';

export const callMcpTool = async (name: string, args: JsonObject): Promise<unknown> => {
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
      return createTodoFromBody(args);
    }
    case 'update_todo': {
      const itemId = cleanString(args.itemId);
      if (!itemId) throw new ApiError(400, 'TODO_REQUIRED', 'itemId is required.');
      return updateTodoFromBody(itemId, args);
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

export const MCP_TOOLS = [
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

export const handleMcpRpc = async (payload: unknown, serverVersion: string): Promise<unknown> => {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return jsonRpcError(null, -32600, 'Invalid Request');
    }
    const responses = (await Promise.all(payload.map((entry) => handleMcpMessage(entry, serverVersion)))).filter((entry) => entry !== null);
    return responses.length > 0 ? responses : null;
  }
  return handleMcpMessage(payload, serverVersion);
};

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
        oneOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string' }],
      },
    },
    required,
  };
}

const hasOwn = (value: JsonObject, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

const isValidRequestId = (value: unknown): value is string | number | null => value === null || typeof value === 'string' || typeof value === 'number';

const isJsonObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isStructuredValue = (value: unknown): boolean => isJsonObject(value) || Array.isArray(value);

const handleMcpMessage = async (message: unknown, serverVersion: string): Promise<unknown> => {
  if (!isJsonObject(message)) {
    return jsonRpcError(null, -32600, 'Invalid Request');
  }

  const request = message;
  const hasId = hasOwn(request, 'id');
  const id = hasId ? request.id : null;
  const method = typeof request.method === 'string' ? request.method : '';
  const rawParams = request.params === undefined ? {} : request.params;

  if (request.jsonrpc !== '2.0' || !method || (hasId && !isValidRequestId(id)) || !isStructuredValue(rawParams)) {
    return jsonRpcError(null, -32600, 'Invalid Request');
  }

  // A JSON-RPC notification is a valid request without an id. It is still
  // executed, but it must never receive a result or an error response.
  const isNotification = !hasId;
  try {
    let response: JsonObject;
    switch (method) {
      case 'initialize':
        response = jsonRpcResult(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
          serverInfo: {
            name: SERVER_NAME,
            title: 'Open-Git-Control Planner',
            version: serverVersion,
          },
          instructions: 'Use get_next_todos for open work ordered by urgency. Use move_todo to change tabs/status.',
        });
        break;
      case 'notifications/initialized':
        response = jsonRpcResult(id, {});
        break;
      case 'ping':
        response = jsonRpcResult(id, {});
        break;
      case 'tools/list':
        response = jsonRpcResult(id, { tools: MCP_TOOLS });
        break;
      case 'tools/call': {
        if (!isJsonObject(rawParams)) {
          response = jsonRpcError(id, -32602, 'Invalid params');
          break;
        }
        const params = rawParams;
        const toolName = cleanString(params.name);
        const args = isJsonObject(params.arguments) ? params.arguments : {};
        const structuredContent = await callMcpTool(toolName, args);
        response = jsonRpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
          structuredContent,
          isError: false,
        });
        break;
      }
      default:
        response = jsonRpcError(id, -32601, `Method not found: ${method}`);
        break;
    }
    return isNotification ? null : response;
  } catch (error) {
    const response = jsonRpcResult(id, {
      content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
      isError: true,
    });
    return isNotification ? null : response;
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
