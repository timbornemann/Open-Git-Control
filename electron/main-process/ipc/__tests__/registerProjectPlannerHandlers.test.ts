import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { handleMock, getPathMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  getPathMock: vi.fn(),
}));
const { getAuthorizedProjectParentDirectoryMock } = vi.hoisted(() => ({
  getAuthorizedProjectParentDirectoryMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
  app: { getPath: getPathMock },
}));

vi.mock('../../fileAccessGrant', () => ({
  getAuthorizedProjectParentDirectory: getAuthorizedProjectParentDirectoryMock,
}));

import { registerProjectPlannerHandlers } from '../registerProjectPlannerHandlers';
import { createPlannedProject, createPlannerItem, ensureRepositoryProject, readProjectPlannerData } from '../../projectPlannerStore';
import { readStoreData } from '../../repoStore';

describe('registerProjectPlannerHandlers', () => {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();
  let tempDirectory = '';

  beforeEach(() => {
    handlers.clear();
    handleMock.mockReset();
    getAuthorizedProjectParentDirectoryMock.mockReset();
    getAuthorizedProjectParentDirectoryMock.mockImplementation((_webContentsId: number, parentDirectory: string) => parentDirectory);
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-planner-'));
    getPathMock.mockReturnValue(tempDirectory);
    handleMock.mockImplementation((channel: string, callback: (...args: any[]) => Promise<any>) => {
      handlers.set(channel, callback);
    });
  });

  afterEach(() => {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  it('creates a future project through IPC and returns it from the planner data endpoint', async () => {
    const gitService = {
      runCommandAtPath: vi.fn(),
    } as any;
    registerProjectPlannerHandlers({ gitService });

    const createHandler = handlers.get('planner:createProject');
    const getDataHandler = handlers.get('planner:getData');
    expect(createHandler).toBeTruthy();
    expect(getDataHandler).toBeTruthy();

    const createResult = await createHandler!(
      {},
      {
        name: 'Future Desktop App',
        description: 'Collect product ideas before creating a repository.',
      },
    );
    expect(createResult).toMatchObject({
      success: true,
      data: {
        name: 'Future Desktop App',
        description: 'Collect product ideas before creating a repository.',
        kind: 'planned',
        repoPath: null,
      },
    });

    const dataResult = await getDataHandler!();
    expect(dataResult).toMatchObject({
      success: true,
      data: {
        projects: [
          expect.objectContaining({
            id: createResult.data.id,
            name: 'Future Desktop App',
            kind: 'planned',
          }),
        ],
      },
    });
  });

  it('deletes a future project and all of its related planning items through IPC', async () => {
    const project = createPlannedProject({ name: 'Disposable idea' });
    createPlannerItem(project.id, {
      title: 'Disposable feature',
      priority: 'medium',
      status: 'idea',
      tags: ['Idea'],
    });
    const gitService = {
      runCommandAtPath: vi.fn(),
    } as any;
    registerProjectPlannerHandlers({ gitService });

    const deleteHandler = handlers.get('planner:deleteProject');
    const getDataHandler = handlers.get('planner:getData');
    expect(deleteHandler).toBeTruthy();

    const deleteResult = await deleteHandler!({}, project.id);
    expect(deleteResult).toEqual({ success: true, data: true });

    const dataResult = await getDataHandler!();
    expect(dataResult).toMatchObject({
      success: true,
      data: {
        projects: [],
        items: [],
      },
    });
  });

  it('returns TODO_NOT_FOUND when deleting an unknown planner item through IPC', async () => {
    const gitService = { runCommandAtPath: vi.fn() } as any;
    registerProjectPlannerHandlers({ gitService });

    await expect(handlers.get('planner:deleteItem')!({}, 'missing-todo')).resolves.toEqual({
      success: false,
      error: 'Todo not found.',
      code: 'TODO_NOT_FOUND',
    });
  });

  it('deletes a repository planning project and its items by repository path through IPC', async () => {
    const repoPath = path.join(tempDirectory, 'deleted-repo');
    const project = ensureRepositoryProject(repoPath);
    createPlannerItem(project.id, {
      title: 'Remove me with the missing repo',
      priority: 'high',
      status: 'planned',
      tags: ['Cleanup'],
    });
    const otherProject = createPlannedProject({ name: 'Keep this idea' });
    createPlannerItem(otherProject.id, {
      title: 'Keep me',
      priority: 'medium',
      status: 'idea',
      tags: ['Idea'],
    });

    const gitService = {
      runCommandAtPath: vi.fn(),
    } as any;
    registerProjectPlannerHandlers({ gitService });

    const deleteByPathHandler = handlers.get('planner:deleteRepositoryProjectByPath');
    expect(deleteByPathHandler).toBeTruthy();

    const result = await deleteByPathHandler!({}, repoPath);
    expect(result).toEqual({
      success: true,
      data: {
        deletedProjectCount: 1,
        deletedItemCount: 1,
      },
    });

    const plannerData = readProjectPlannerData();
    expect(plannerData.projects).toHaveLength(1);
    expect(plannerData.projects[0]).toMatchObject({ id: otherProject.id, name: 'Keep this idea' });
    expect(plannerData.items).toHaveLength(1);
    expect(plannerData.items[0]).toMatchObject({ projectId: otherProject.id, title: 'Keep me' });
  });

  it('creates and initializes a project folder while preserving its planning items', async () => {
    const project = createPlannedProject({ name: 'Future App', description: 'Vision' });
    createPlannerItem(project.id, {
      title: 'First feature',
      description: 'Keep me assigned',
      priority: 'high',
      status: 'planned',
      tags: ['Feature'],
    });

    const gitService = {
      runCommandAtPath: vi.fn().mockResolvedValue('Initialized empty Git repository'),
    } as any;
    registerProjectPlannerHandlers({ gitService });

    const parentDirectory = path.join(tempDirectory, 'projects');
    fs.mkdirSync(parentDirectory);
    const handler = handlers.get('planner:materializeProject');
    const result = await handler!({ sender: { id: 41 } }, project.id, parentDirectory, 'future-app');
    const expectedRepoPath = path.join(parentDirectory, 'future-app');

    expect(result.success).toBe(true);
    expect(getAuthorizedProjectParentDirectoryMock).toHaveBeenCalledWith(41, parentDirectory);
    expect(result.data.repoPath).toBe(expectedRepoPath);
    expect(gitService.runCommandAtPath).toHaveBeenCalledWith(expectedRepoPath, ['init']);
    expect(fs.existsSync(expectedRepoPath)).toBe(true);

    const plannerData = readProjectPlannerData();
    expect(plannerData.projects[0]).toMatchObject({
      id: project.id,
      kind: 'repository',
      repoPath: expectedRepoPath,
    });
    expect(plannerData.items[0]).toMatchObject({
      projectId: project.id,
      title: 'First feature',
    });
    expect(readStoreData()).toMatchObject({
      activeRepo: expectedRepoPath,
      repos: [expect.objectContaining({ path: expectedRepoPath })],
    });
  });

  it('removes a newly created folder and keeps the project planned when git init fails', async () => {
    const project = createPlannedProject({ name: 'Broken start' });
    const gitService = {
      runCommandAtPath: vi.fn().mockRejectedValue(new Error('git is unavailable')),
    } as any;
    registerProjectPlannerHandlers({ gitService });

    const parentDirectory = path.join(tempDirectory, 'projects');
    fs.mkdirSync(parentDirectory);
    const handler = handlers.get('planner:materializeProject');
    const result = await handler!({ sender: { id: 41 } }, project.id, parentDirectory, 'broken-start');
    const expectedRepoPath = path.join(parentDirectory, 'broken-start');

    expect(result).toEqual({ success: false, error: 'git is unavailable' });
    expect(fs.existsSync(expectedRepoPath)).toBe(false);
    expect(readProjectPlannerData().projects[0]).toMatchObject({
      id: project.id,
      kind: 'planned',
      repoPath: null,
    });
    expect(readStoreData().repos).toEqual([]);
  });

  it('rejects empty or renderer-supplied project parent paths without a matching native grant', async () => {
    const project = createPlannedProject({ name: 'Protected project' });
    const gitService = { runCommandAtPath: vi.fn() } as any;
    registerProjectPlannerHandlers({ gitService });
    const handler = handlers.get('planner:materializeProject');

    await expect(handler!({ sender: { id: 41 } }, project.id, '', 'protected-project')).resolves.toEqual({
      success: false,
      error: 'Selected parent directory is required.',
    });

    const unauthorizedParent = path.join(tempDirectory, 'unauthorized');
    fs.mkdirSync(unauthorizedParent);
    getAuthorizedProjectParentDirectoryMock.mockReturnValueOnce(null);
    await expect(handler!({ sender: { id: 42 } }, project.id, unauthorizedParent, 'protected-project')).resolves.toEqual({
      success: false,
      error: 'Selected parent directory is not authorized. Please choose it again.',
    });
    expect(gitService.runCommandAtPath).not.toHaveBeenCalled();
  });
});
