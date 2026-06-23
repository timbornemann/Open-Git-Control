import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { GitService } from '../../GitService';
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
      gitService: new GitService(),
      authToken: 'test-planning-api-token',
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
    expect(await docsResponse.text()).toContain('Open-Git-Control Planning API');

    const openApi = await requestJson('/api/openapi.json');
    expect(openApi.data.paths['/todos/{todoId}/move']).toBeTruthy();
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
      gitService: new GitService(),
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
    expect(next.data.todos.map((todo: any) => todo.title)).toEqual([
      'Crash on startup',
      'Release notes',
      'Later cleanup',
    ]);
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
      expect.objectContaining({
        title: 'Implement API client',
        projectName: 'MCP Project',
      }),
    ]);
  });

  it('exposes Git status, branch, staging, commit, and MCP Git tools', async () => {
    const repoPath = path.join(tempDirectory, 'repo');
    fs.mkdirSync(repoPath);
    const git = (args: string[]) => execFileSync('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    git(['init']);
    git(['config', 'user.email', 'agent@example.test']);
    git(['config', 'user.name', 'Agent Test']);
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# Test\n', 'utf8');
    git(['add', 'README.md']);
    git(['commit', '-m', 'Initial commit']);
    fs.writeFileSync(path.join(repoPath, 'feature.txt'), 'agent work\n', 'utf8');

    const status = await requestJson('/api/git/status?repoPath=' + encodeURIComponent(repoPath));
    expect(status.data.untracked).toEqual([
      expect.objectContaining({ path: 'feature.txt' }),
    ]);

    const branch = await requestJson('/api/git/branches', {
      method: 'POST',
      body: JSON.stringify({
        repoPath,
        name: 'agent/api-test',
        checkout: true,
        confirm: true,
      }),
    });
    expect(branch.data).toMatchObject({
      name: 'agent/api-test',
      checkedOut: true,
    });

    const branches = await requestJson('/api/git/branches?repoPath=' + encodeURIComponent(repoPath));
    expect(branches.data.local).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'agent/api-test', current: true }),
      ]),
    );

    const stage = await requestJson('/api/git/stage', {
      method: 'POST',
      body: JSON.stringify({ repoPath, paths: ['feature.txt'], confirm: true }),
    });
    expect(stage.data.paths).toEqual(['feature.txt']);

    const commit = await requestJson('/api/git/commit', {
      method: 'POST',
      body: JSON.stringify({ repoPath, title: 'Add agent feature file', confirm: true }),
    });
    expect(commit.data.hash).toMatch(/^[0-9a-f]{40}$/i);

    const commits = await requestJson('/api/git/commits?repoPath=' + encodeURIComponent(repoPath) + '&scope=head&limit=2');
    expect(commits.data.commits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subject: 'Add agent feature file' }),
      ]),
    );

    const mcpStatus = await requestJson('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'get_git_status',
          arguments: { repoPath },
        },
      }),
    });
    expect(mcpStatus.result).toMatchObject({
      isError: false,
      structuredContent: {
        changeCount: 0,
      },
    });
  });
});
