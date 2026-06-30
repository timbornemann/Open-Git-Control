import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { GitService } from '../../GitService';
import { readStoreData, writeStoreData } from '../repoStore';
import {
  convertProjectToRepository,
  createPlannedProject,
  createPlannerItem,
  deleteRepositoryPlannerProjectByPath,
  deletePlannerItem,
  deletePlannerProject,
  ensureRepositoryProject,
  getRepositoryProjectKey,
  readProjectPlannerData,
  updatePlannerItem,
  updatePlannerProject,
  validateProjectFolderName,
} from '../projectPlannerStore';

type RegisterProjectPlannerHandlersDeps = {
  gitService: GitService;
};

const success = <T>(data: T) => ({ success: true as const, data });
const failure = (error: unknown) => ({
  success: false as const,
  error: error instanceof Error ? error.message : String(error || 'Unknown error'),
});

export function registerProjectPlannerHandlers({ gitService }: RegisterProjectPlannerHandlersDeps): void {
  ipcMain.handle('planner:getData', async () => success(readProjectPlannerData()));

  ipcMain.handle('planner:ensureRepositoryProject', async (_event: unknown, repoPath: string) => {
    try {
      return success(ensureRepositoryProject(repoPath));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('planner:createProject', async (
    _event: unknown,
    input: { name: string; description?: string },
  ) => {
    try {
      return success(createPlannedProject(input));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('planner:updateProject', async (
    _event: unknown,
    projectId: string,
    input: { name?: string; description?: string },
  ) => {
    try {
      return success(updatePlannerProject(projectId, input));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('planner:deleteProject', async (_event: unknown, projectId: string) => {
    try {
      deletePlannerProject(projectId);
      return success(true);
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('planner:deleteRepositoryProjectByPath', async (_event: unknown, repoPath: string) => {
    try {
      return success(deleteRepositoryPlannerProjectByPath(repoPath));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('planner:createItem', async (
    _event: unknown,
    projectId: string,
    input: Record<string, unknown>,
  ) => {
    try {
      return success(createPlannerItem(projectId, input as never));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('planner:updateItem', async (
    _event: unknown,
    itemId: string,
    input: Record<string, unknown>,
  ) => {
    try {
      return success(updatePlannerItem(itemId, input as never));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('planner:deleteItem', async (_event: unknown, itemId: string) => {
    try {
      deletePlannerItem(itemId);
      return success(true);
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('planner:materializeProject', async (
    _event: unknown,
    projectId: string,
    parentDirectory: string,
    requestedFolderName: string,
  ) => {
    let targetPath: string | null = null;
    let createdDirectory = false;
    let repoStoreBeforeUpdate: ReturnType<typeof readStoreData> | null = null;
    let repoStoreUpdated = false;
    try {
      const projectBeforeConversion = readProjectPlannerData().projects.find((project) => project.id === projectId);
      if (!projectBeforeConversion) throw new Error('Project not found.');
      if (projectBeforeConversion.kind !== 'planned') throw new Error('Project already has a repository.');

      const parentPath = path.resolve(String(parentDirectory || '').trim());
      if (!fs.existsSync(parentPath) || !fs.statSync(parentPath).isDirectory()) {
        throw new Error('Selected parent directory does not exist.');
      }

      const folderName = validateProjectFolderName(requestedFolderName);
      targetPath = path.resolve(parentPath, folderName);
      if (path.dirname(targetPath) !== parentPath) {
        throw new Error('Project folder must be created directly inside the selected directory.');
      }
      if (fs.existsSync(targetPath)) {
        throw new Error('A file or folder with this name already exists.');
      }

      fs.mkdirSync(targetPath);
      createdDirectory = true;
      await gitService.runCommandAtPath(targetPath, ['init']);
      const repositoryPath = targetPath;

      const repoData = readStoreData();
      repoStoreBeforeUpdate = {
        ...repoData,
        repos: repoData.repos.map((repo) => ({ ...repo })),
      };
      const now = Date.now();
      if (!repoData.repos.some((repo) => (
        getRepositoryProjectKey(repo.path) === getRepositoryProjectKey(repositoryPath)
      ))) {
        repoData.repos.push({
          path: repositoryPath,
          lastOpened: now,
          pinned: false,
          createdAt: now,
        });
      }
      repoData.activeRepo = repositoryPath;
      writeStoreData(repoData);
      repoStoreUpdated = true;

      const project = convertProjectToRepository(projectId, repositoryPath);
      return success({ project, repoPath: repositoryPath });
    } catch (error) {
      if (repoStoreUpdated && repoStoreBeforeUpdate) {
        try {
          writeStoreData(repoStoreBeforeUpdate);
        } catch {
          // Preserve the original materialization error.
        }
      }
      if (createdDirectory && targetPath && fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
      return failure(error);
    }
  });
}
