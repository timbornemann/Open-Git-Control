import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { getPathMock } = vi.hoisted(() => ({
  getPathMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getPath: getPathMock },
}));

import type { PlanningApiServerHandle } from '../planningApiServer';
import { startFixtureServer } from './planningApiTestFixture';

describe('planningApiServer repository access', () => {
  let tempDirectory = '';
  let server: PlanningApiServerHandle | null = null;

  const requestJson = async (route: string, init: RequestInit = {}): Promise<any> => {
    if (!server) throw new Error('Server not started.');
    const response = await fetch(`${server.url}${route}`, {
      ...init,
      headers: { 'content-type': 'application/json', [server.authHeaderName]: server.authToken, ...(init.headers || {}) },
    });
    return response.json();
  };

  beforeEach(async () => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-planning-api-access-'));
    getPathMock.mockReturnValue(tempDirectory);
    server = await startFixtureServer({ preferredPort: 0, maxPortSearch: 0, authToken: 'test-planning-api-token', serverVersion: '9.8.7' });
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  it('only creates repository planning files in Git repositories, never in arbitrary directories', async () => {
    const folder = path.join(tempDirectory, 'plain-folder');
    fs.mkdirSync(folder);
    const call = (repoPath: string) =>
      requestJson('/mcp', {
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'ensure_repository_project', arguments: { repoPath } } }),
      });

    expect((await call(folder)).result.structuredContent.error.code).toBe('REPOSITORY_NOT_FOUND');
    expect((await call('relative-folder')).result.structuredContent.error.code).toBe('REPOSITORY_PATH_INVALID');
    const rest = await requestJson('/api/repositories/ensure', { method: 'POST', body: JSON.stringify({ repoPath: folder }) });
    expect(rest.error.code).toBe('REPOSITORY_NOT_FOUND');
    const todo = await requestJson('/api/todos', { method: 'POST', body: JSON.stringify({ repoPath: folder, title: 'Must not be written' }) });
    expect(todo.error.code).toBe('REPOSITORY_NOT_FOUND');
    expect(fs.existsSync(path.join(folder, '.Open-Git-Control'))).toBe(false);

    fs.mkdirSync(path.join(folder, '.git'));
    expect((await call(folder)).result.structuredContent).toMatchObject({ kind: 'repository', repoPath: folder });
  });
});
