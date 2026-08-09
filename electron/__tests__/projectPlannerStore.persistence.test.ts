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

import { createPlannerItem, ensureRepositoryProject, readProjectPlannerData, writeProjectPlannerData } from '../main-process/projectPlannerStore';

describe('projectPlannerStore persistence', () => {
  let temporaryDirectory = '';

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-project-planner-'));
    getPathMock.mockReturnValue(temporaryDirectory);
  });

  afterEach(() => {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('does not reuse the former shared temporary filename', () => {
    const storePath = path.join(temporaryDirectory, 'project-planner.json');
    const foreignTemporaryPath = `${storePath}.tmp`;
    fs.writeFileSync(foreignTemporaryPath, 'owned by another process', 'utf8');

    writeProjectPlannerData({ version: 1, projects: [], items: [] });

    expect(JSON.parse(fs.readFileSync(storePath, 'utf8'))).toEqual({ version: 1, projects: [], items: [] });
    expect(fs.readFileSync(foreignTemporaryPath, 'utf8')).toBe('owned by another process');
    expect(fs.readdirSync(temporaryDirectory).filter((entry) => entry.endsWith('.tmp'))).toEqual(['project-planner.json.tmp']);
  });

  it('migrates reachable repository planning data into the repository and removes its legacy copy', () => {
    const repoPath = path.join(temporaryDirectory, 'repo');
    fs.mkdirSync(repoPath);
    fs.writeFileSync(
      path.join(temporaryDirectory, 'project-planner.json'),
      JSON.stringify({
        version: 1,
        projects: [
          {
            id: 'legacy-project',
            name: 'Repository planning',
            description: '',
            kind: 'repository',
            repoPath,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        items: [
          {
            id: 'legacy-item',
            projectId: 'legacy-project',
            title: 'Keep this todo',
            description: '',
            priority: 'medium',
            status: 'planned',
            tags: [],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
      'utf8',
    );

    expect(readProjectPlannerData()).toMatchObject({
      projects: [expect.objectContaining({ id: 'legacy-project', repoPath })],
      items: [expect.objectContaining({ id: 'legacy-item', title: 'Keep this todo' })],
    });
    const planningPath = path.join(repoPath, '.Open-Git-Control', 'planning.json');
    const planningFile = JSON.parse(fs.readFileSync(planningPath, 'utf8'));
    expect(planningFile).toMatchObject({
      projects: [expect.objectContaining({ id: 'legacy-project' })],
      items: [expect.objectContaining({ id: 'legacy-item' })],
    });
    expect(planningFile.projects[0]).not.toHaveProperty('repoPath');
    expect(fs.readFileSync(path.join(repoPath, '.Open-Git-Control', 'README.md'), 'utf8')).toContain('`planning.json`');
    expect(fs.existsSync(path.join(temporaryDirectory, 'project-planner.json'))).toBe(false);
  });

  it('creates repository planning files and the shared README when a todo is created without a run workflow', () => {
    const repoPath = path.join(temporaryDirectory, 'repo');
    fs.mkdirSync(repoPath);

    const project = ensureRepositoryProject(repoPath);
    createPlannerItem(project.id, { title: 'Repository-only todo' });

    const directoryPath = path.join(repoPath, '.Open-Git-Control');
    expect(JSON.parse(fs.readFileSync(path.join(directoryPath, 'planning.json'), 'utf8'))).toMatchObject({
      projects: [expect.objectContaining({ id: project.id })],
      items: [expect.objectContaining({ title: 'Repository-only todo' })],
    });
    expect(fs.readFileSync(path.join(directoryPath, 'README.md'), 'utf8')).toContain('repository-local data');
  });

  const createRepositoryWithPlanningFile = (name: string, projectId: string, itemId: string, storedRepoPath?: string): string => {
    const repoPath = path.join(temporaryDirectory, name);
    fs.mkdirSync(path.join(repoPath, '.Open-Git-Control'), { recursive: true });
    fs.writeFileSync(
      path.join(repoPath, '.Open-Git-Control', 'planning.json'),
      JSON.stringify(
        {
          version: 1,
          projects: [
            {
              id: projectId,
              name: 'Shared planning',
              description: '',
              kind: 'repository',
              ...(storedRepoPath === undefined ? {} : { repoPath: storedRepoPath }),
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          items: [
            { id: itemId, projectId, title: 'Shared todo', description: '', priority: 'medium', status: 'planned', tags: [], createdAt: 1, updatedAt: 1 },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );
    return repoPath;
  };

  const registerRepositories = (...repoPaths: string[]): void => {
    fs.writeFileSync(
      path.join(temporaryDirectory, 'repos.json'),
      JSON.stringify({
        repos: repoPaths.map((repoPath) => ({ path: repoPath, lastOpened: 1, pinned: false, createdAt: 1 })),
        activeRepo: repoPaths[0] || null,
        sortBy: 'lastOpenedDesc',
      }),
      'utf8',
    );
  };

  it('reads a planning file committed on another machine without rewriting it', () => {
    const repoPath = createRepositoryWithPlanningFile('pulled-repo', 'shared-project', 'shared-item', 'D:\\other-machine\\checkout');
    registerRepositories(repoPath);
    const planningPath = path.join(repoPath, '.Open-Git-Control', 'planning.json');
    const fileBeforeRead = fs.readFileSync(planningPath, 'utf8');

    expect(readProjectPlannerData()).toMatchObject({
      projects: [expect.objectContaining({ id: 'shared-project', repoPath })],
      items: [expect.objectContaining({ id: 'shared-item', projectId: 'shared-project', title: 'Shared todo' })],
    });
    expect(fs.readFileSync(planningPath, 'utf8')).toBe(fileBeforeRead);
  });

  it('keeps both checkouts visible when two repositories share the same committed identifiers', () => {
    const firstRepoPath = createRepositoryWithPlanningFile('checkout-a', 'shared-project', 'shared-item');
    const secondRepoPath = createRepositoryWithPlanningFile('checkout-b', 'shared-project', 'shared-item');
    registerRepositories(firstRepoPath, secondRepoPath);

    const data = readProjectPlannerData();
    expect(data.projects.map((project) => project.repoPath).sort()).toEqual([firstRepoPath, secondRepoPath].sort());
    expect(new Set(data.projects.map((project) => project.id)).size).toBe(2);
    expect(data.items).toHaveLength(2);
    expect(fs.readFileSync(path.join(firstRepoPath, '.Open-Git-Control', 'planning.json'), 'utf8')).toContain('shared-project');
  });

  it('keeps inaccessible legacy repository data for a later retry without exposing a broken project', () => {
    const missingRepoPath = path.join(temporaryDirectory, 'missing-repo');
    fs.writeFileSync(
      path.join(temporaryDirectory, 'project-planner.json'),
      JSON.stringify({
        version: 1,
        projects: [{ id: 'pending', name: 'Pending migration', description: '', kind: 'repository', repoPath: missingRepoPath, createdAt: 1, updatedAt: 1 }],
        items: [
          {
            id: 'pending-item',
            projectId: 'pending',
            title: 'Do not lose',
            description: '',
            priority: 'medium',
            status: 'idea',
            tags: [],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
      'utf8',
    );

    expect(readProjectPlannerData()).toEqual({ version: 1, projects: [], items: [] });
    expect(JSON.parse(fs.readFileSync(path.join(temporaryDirectory, 'project-planner.json'), 'utf8'))).toMatchObject({
      projects: [expect.objectContaining({ id: 'pending' })],
      items: [expect.objectContaining({ id: 'pending-item' })],
    });
  });
});
