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

import type { PlanningApiServerHandle } from '../planningApiServer';
import { startPlanningApiServer } from '../planningApiServer';

describe('planningApiServer', () => {
  let tempDirectory = '';
  let server: PlanningApiServerHandle | null = null;

  const requestJson = async (route: string, init: RequestInit = {}): Promise<any> => {
    if (!server) throw new Error('Server not started.');
    const response = await fetch(`${server.url}${route}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        [server.authHeaderName]: server.authToken,
        ...(init.headers || {}),
      },
    });
    return response.json();
  };

  beforeEach(async () => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-planning-api-'));
    getPathMock.mockReturnValue(tempDirectory);
    server = await startPlanningApiServer({
      preferredPort: 0,
      maxPortSearch: 0,
      authToken: 'test-planning-api-token',
      serverVersion: '9.8.7',
    });
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
    const docsHtml = await docsResponse.text();
    expect(docsHtml).toContain('Open-Git-Control Planning API');
    expect(docsHtml).not.toContain('/api/git/');

    const openApi = await requestJson('/api/openapi.json');
    expect(openApi.data.paths['/todos/{todoId}/move']).toBeTruthy();
    expect(openApi.data.paths['/git/status']).toBeUndefined();
    expect(openApi.data.components.securitySchemes.openGitControlToken.name).toBe(server!.authHeaderName);
  });

  it('requires a token for protected API and MCP routes', async () => {
    const protectedResponse = await fetch(`${server!.url}/api/projects`);
    expect(protectedResponse.status).toBe(401);
    const protectedBody = await protectedResponse.json();
    expect(protectedBody.error.code).toBe('UNAUTHORIZED');

    const mcpResponse = await fetch(`${server!.url}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(mcpResponse.status).toBe(401);

    const publicHealth = await fetch(`${server!.url}/api/health`);
    expect(publicHealth.status).toBe(200);
  });

  it('uses the current auth token provider value for protected routes', async () => {
    await server!.close();
    let activeToken = 'provider-token-before-rotation';
    server = await startPlanningApiServer({
      preferredPort: 0,
      maxPortSearch: 0,
      authTokenProvider: () => activeToken,
    });

    const beforeRotation = await fetch(`${server!.url}/api/projects`, {
      headers: { [server!.authHeaderName]: activeToken },
    });
    expect(beforeRotation.status).toBe(200);

    const oldToken = activeToken;
    activeToken = 'provider-token-after-rotation';

    const staleTokenResponse = await fetch(`${server!.url}/api/projects`, {
      headers: { [server!.authHeaderName]: oldToken },
    });
    expect(staleTokenResponse.status).toBe(401);

    const rotatedTokenResponse = await fetch(`${server!.url}/api/projects`, {
      headers: { [server!.authHeaderName]: activeToken },
    });
    expect(rotatedTokenResponse.status).toBe(200);
    expect(server!.authToken).toBe(activeToken);
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
    expect(next.data.todos.map((todo: any) => todo.title)).toEqual(['Crash on startup', 'Release notes', 'Later cleanup']);
    expect(next.data.todos[0]).toMatchObject({
      projectId,
      projectName: 'Agent Project',
      projectKind: 'planned',
      projectRepoPath: null,
      project: {
        id: projectId,
        name: 'Agent Project',
      },
    });

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

  it('returns 404 when deleting a planner project that does not exist', async () => {
    const response = await fetch(`${server!.url}/api/projects/missing-project`, {
      method: 'DELETE',
      headers: { [server!.authHeaderName]: server!.authToken },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: { code: 'PROJECT_NOT_FOUND' } });
  });

  it('returns TODO_NOT_FOUND when deleting a todo that does not exist', async () => {
    const response = await fetch(`${server!.url}/api/todos/missing-todo`, {
      method: 'DELETE',
      headers: { [server!.authHeaderName]: server!.authToken },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: { code: 'TODO_NOT_FOUND' } });
  });

  it('rejects invalid todo patches without persisting a simultaneous move', async () => {
    const sourceProject = await requestJson('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Source project' }),
    });
    const targetProject = await requestJson('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Target project' }),
    });
    const todo = await requestJson('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ projectId: sourceProject.data.id, title: 'Keep my assignment' }),
    });

    const invalidPatch = await fetch(`${server!.url}/api/todos/${todo.data.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        [server!.authHeaderName]: server!.authToken,
      },
      body: JSON.stringify({ projectId: targetProject.data.id, title: '   ' }),
    });
    expect(invalidPatch.status).toBe(400);
    await expect(invalidPatch.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'TITLE_REQUIRED' },
    });

    const unchanged = await requestJson(`/api/todos/${todo.data.id}`);
    expect(unchanged.data).toMatchObject({
      id: todo.data.id,
      title: 'Keep my assignment',
      projectId: sourceProject.data.id,
    });

    const unknownTodo = await fetch(`${server!.url}/api/todos/missing-todo`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        [server!.authHeaderName]: server!.authToken,
      },
      body: JSON.stringify({ title: 'Does not exist' }),
    });
    expect(unknownTodo.status).toBe(404);
    await expect(unknownTodo.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'TODO_NOT_FOUND' },
    });
  });

  it('does not persist a repository project when todo validation fails', async () => {
    const response = await fetch(`${server!.url}/api/todos`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [server!.authHeaderName]: server!.authToken,
      },
      body: JSON.stringify({ repoPath: path.join(tempDirectory, 'new-repository'), title: '   ' }),
    });

    expect(response.status).toBe(400);
    const projects = await requestJson('/api/projects');
    expect(projects.data.projects).toEqual([]);
  });

  it('returns an error and preserves an incompatible planner store instead of overwriting it', async () => {
    const storePath = path.join(tempDirectory, 'project-planner.json');
    const corruptContents = '{"version":2,"projects":[],"items":[]}';
    fs.writeFileSync(storePath, corruptContents, 'utf8');

    const response = await fetch(`${server!.url}/api/todos`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [server!.authHeaderName]: server!.authToken,
      },
      body: JSON.stringify({ repoPath: path.join(tempDirectory, 'new-repository'), title: 'Must not be written' }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'INTERNAL_ERROR' },
    });
    expect(fs.readFileSync(storePath, 'utf8')).toBe(corruptContents);
  });

  it('returns a structured 413 response without resetting the client socket', async () => {
    const response = await fetch(`${server!.url}/api/todos`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [server!.authHeaderName]: server!.authToken,
      },
      body: JSON.stringify({ title: 'x'.repeat(1_100_000), projectId: 'irrelevant' }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'PAYLOAD_TOO_LARGE' },
    });
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

    const initialize = await requestJson('/mcp', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize' }),
    });
    expect(initialize.result.serverInfo).toMatchObject({
      name: 'open-git-control-planner',
      version: '9.8.7',
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
      expect.objectContaining({
        title: 'Implement API client',
        projectName: 'MCP Project',
      }),
    ]);

    const deleteMissing = await requestJson('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'delete_todo', arguments: { itemId: 'missing-todo' } },
      }),
    });
    expect(deleteMissing.result).toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'TODO_NOT_FOUND', message: 'Todo not found.' } },
    });
    expect(deleteMissing.result.content[0].text).toContain('TODO_NOT_FOUND');
  });

  it('does not expose Git routes or MCP Git tools', async () => {
    const gitRouteResponse = await fetch(`${server!.url}/api/git/status?repoPath=${encodeURIComponent(tempDirectory)}`, {
      headers: { [server!.authHeaderName]: server!.authToken },
    });
    expect(gitRouteResponse.status).toBe(404);
    const gitRouteBody = await gitRouteResponse.json();
    expect(gitRouteBody.error.code).toBe('NOT_FOUND');

    const toolsList = await requestJson('/mcp', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }),
    });
    const toolNames = toolsList.result.tools.map((tool: any) => tool.name);
    expect(toolNames).not.toContain('get_git_status');
    expect(toolNames).not.toContain('create_commit');
    expect(toolNames).not.toContain('push_remote');

    const mcpStatus = await requestJson('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'get_git_status',
          arguments: { repoPath: tempDirectory },
        },
      }),
    });
    expect(mcpStatus.result).toMatchObject({
      isError: true,
    });
    expect(mcpStatus.result.content[0].text).toContain('Unknown tool: get_git_status');
  });
  it('follows JSON-RPC rules for notifications, batches, and parse errors', async () => {
    const headers = {
      'content-type': 'application/json',
      [server!.authHeaderName]: server!.authToken,
    };
    const notification = await fetch(`${server!.url}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'ping', params: [] }),
    });
    expect(notification.status).toBe(204);
    await expect(notification.text()).resolves.toBe('');

    const invalidNotification = await fetch(`${server!.url}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'ping', params: 'invalid' }),
    });
    expect(invalidNotification.status).toBe(204);
    await expect(invalidNotification.text()).resolves.toBe('');

    const mixedBatch = await fetch(`${server!.url}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify([
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 'ping-request', method: 'ping' },
      ]),
    });
    expect(mixedBatch.status).toBe(200);
    await expect(mixedBatch.json()).resolves.toEqual([
      {
        jsonrpc: '2.0',
        id: 'ping-request',
        result: {},
      },
    ]);

    const emptyBatch = await fetch(`${server!.url}/mcp`, {
      method: 'POST',
      headers,
      body: '[]',
    });
    expect(emptyBatch.status).toBe(200);
    await expect(emptyBatch.json()).resolves.toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Invalid Request' },
    });

    const parseError = await fetch(`${server!.url}/mcp`, {
      method: 'POST',
      headers,
      body: '{',
    });
    expect(parseError.status).toBe(200);
    await expect(parseError.json()).resolves.toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    });
  });
});
