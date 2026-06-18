import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createPlannerItem } from '../projectPlannerStore';

const { getPathMock } = vi.hoisted(() => ({
  getPathMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getPath: getPathMock },
}));

import { PlanningApiServerHandle, startPlanningApiServer } from '../planningApiServer';

describe('planningApiServer', () => {
  let tempDirectory = '';
  let server: PlanningApiServerHandle | null = null;

  const requestJson = async (
    route: string,
    init: RequestInit = {},
  ): Promise<any> => {
    if (!server) throw new Error('Server not started.');
    const response = await fetch(`${server.url}${route}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init.headers || {}),
      },
    });
    return response.json();
  };

  beforeEach(async () => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-planning-api-'));
    getPathMock.mockReturnValue(tempDirectory);
    server = await startPlanningApiServer({ preferredPort: 0, maxPortSearch: 0 });
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  it('serves API metadata and documentation endpoints', async () => {
    const health = await requestJson('/api/health');
    expect(health).toMatchObject({
      success: true,
      data: {
        name: 'open-git-control-planner',
        status: 'ok',
      },
    });
    expect(health.data.statuses).toContain('bug');
    expect(health.data.priorities).toEqual(['low', 'medium', 'high', 'urgent']);

    const docsResponse = await fetch(`${server!.url}/api/`);
    expect(docsResponse.headers.get('content-type')).toContain('text/html');
    expect(await docsResponse.text()).toContain('Open-Git-Control Planning API');

    const openApi = await requestJson('/api/openapi.json');
    expect(openApi.data.paths['/todos/{todoId}/move']).toBeTruthy();
  });

  it('creates todos, sorts open work by urgency, and moves todos through the working alias', async () => {
    const projectResult = await requestJson('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Agent Project' }),
    });
    const projectId = projectResult.data.id;

    const low = await requestJson(`/api/projects/${projectId}/todos`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Later cleanup', priority: 'low', status: 'planned' }),
    });
    await requestJson('/api/todos', {
      method: 'POST',
      body: JSON.stringify({
        projectId,
        title: 'Crash on startup',
        priority: 'urgent',
        status: 'bug',
        tags: ['bug', 'startup'],
      }),
    });
    await requestJson('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ projectId, title: 'Release notes', priority: 'high', status: 'planned' }),
    });

    const next = await requestJson('/api/agent/next?projectId=' + encodeURIComponent(projectId));
    expect(next.data.todos.map((todo: any) => todo.title)).toEqual([
      'Crash on startup',
      'Release notes',
      'Later cleanup',
    ]);

    const move = await requestJson(`/api/todos/${low.data.id}/move`, {
      method: 'POST',
      body: JSON.stringify({ tab: 'working' }),
    });
    expect(move.data.status).toBe('in-progress');

    const working = await requestJson('/api/tabs/working/todos?projectId=' + encodeURIComponent(projectId));
    expect(working.data.todos).toEqual([
      expect.objectContaining({
        id: low.data.id,
        status: 'in-progress',
      }),
    ]);
  });

  it('exposes planner operations through MCP tools/call JSON-RPC', async () => {
    const createProject = await requestJson('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'MCP Project' }),
    });
    createPlannerItem(createProject.data.id, {
      title: 'Implement API client',
      priority: 'high',
      status: 'planned',
      tags: ['agent'],
    });

    const toolsList = await requestJson('/mcp', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(toolsList.result.tools.map((tool: any) => tool.name)).toContain('get_next_todos');

    const call = await requestJson('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'get_next_todos',
          arguments: { projectName: 'MCP Project' },
        },
      }),
    });
    expect(call.result.isError).toBe(false);
    expect(call.result.structuredContent.todos).toEqual([
      expect.objectContaining({ title: 'Implement API client' }),
    ]);
  });
});
