import type { URL } from 'url';
import type { PlannerItem, PlannerPriority, PlannerProject, PlannerStatus } from './projectPlannerStore';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 2990;
export const PORT_SEARCH_LIMIT = 25;
export const MAX_BODY_BYTES = 1_000_000;
export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const SERVER_NAME = 'open-git-control-planner';
export const AUTH_HEADER_NAME = 'x-open-git-control-token';
export const AUTH_BEARER_PREFIX = 'bearer ';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'OPTIONS';
export type JsonObject = Record<string, unknown>;

export type RequestContext = {
  method: HttpMethod;
  url: URL;
  segments: string[];
  body: JsonObject;
  baseUrl: string;
};

export type ApiEnvelope<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: {
        code: string;
        message: string;
      };
    };

export type TodoQueryOptions = {
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

export type EnrichedTodo = PlannerItem & {
  projectName: string;
  projectKind: PlannerProject['kind'];
  projectRepoPath: string | null;
  project: Pick<PlannerProject, 'id' | 'name' | 'kind' | 'repoPath'>;
  urgencyRank: number;
};

export type PlannerCounts = {
  total: number;
  open: number;
  byStatus: Record<PlannerStatus, number>;
  byPriority: Record<PlannerPriority, number>;
};

export type ProjectSummary = PlannerProject & {
  counts: PlannerCounts;
};

export type PlanningApiServerOptions = {
  host?: string;
  preferredPort?: number;
  maxPortSearch?: number;
  authToken?: string;
  authTokenProvider?: () => string;
  serverVersion?: string;
};

export type PlanningApiServerHandle = {
  host: string;
  port: number;
  url: string;
  authToken: string;
  authHeaderName: string;
  close: () => Promise<void>;
};

export type PlanningRouteHandler = (ctx: RequestContext) => Promise<unknown> | unknown;
export type McpRpcHandler = (payload: unknown) => Promise<unknown>;

export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
