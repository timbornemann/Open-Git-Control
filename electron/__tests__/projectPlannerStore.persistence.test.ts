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
    expect(JSON.parse(fs.readFileSync(planningPath, 'utf8'))).toMatchObject({
      projects: [expect.objectContaining({ id: 'legacy-project', repoPath })],
      items: [expect.objectContaining({ id: 'legacy-item' })],
    });
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

  it('keeps inaccessible legacy repository data for a later retry without exposing a broken project', () => {
    const missingRepoPath = path.join(temporaryDirectory, 'missing-repo');
    fs.writeFileSync(
      path.join(temporaryDirectory, 'project-planner.json'),
      JSON.stringify({
        version: 1,
        projects: [{ id: 'pending', name: 'Pending migration', description: '', kind: 'repository', repoPath: missingRepoPath, createdAt: 1, updatedAt: 1 }],
        items: [{ id: 'pending-item', projectId: 'pending', title: 'Do not lose', description: '', priority: 'medium', status: 'idea', tags: [], createdAt: 1, updatedAt: 1 }],
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
