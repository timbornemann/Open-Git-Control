import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { GitService } from '../../GitService';
import { readStoreData, writeStoreData } from '../repoStore';
import { IpcChannel } from '../../../src/types/ipcContract';
import { getAuthorizedProjectParentDirectory } from '../fileAccessGrant';
import { ApiError } from '../planningApiTypes';
import {
  convertProjectToRepository,
  createPlannedProject,
  createPlannerItem,
  deleteRepositoryPlannerProjectByPath,
  deletePlannerItem,
  deletePlannerProject,
  ensureRepositoryProject,
  getRepositoryProjectKey,
  onProjectPlannerDataChanged,
  readProjectPlannerData,
  updatePlannerItem,
  updatePlannerProject,
  validateProjectFolderName,
} from '../projectPlannerStore';

type RegisterProjectPlannerHandlersDeps = {
  gitService: GitService;
};

const success = <T>(data: T) => ({ success: true as const, data });
const failure = (error: unknown) =>
  error instanceof ApiError
    ? { success: false as const, error: error.message, code: error.code }
    : { success: false as const, error: error instanceof Error ? error.message : String(error || 'Unknown error') };

const plannerSubscribers = new Set<WebContents>();
let plannerChangeBroadcasterRegistered = false;

const rememberPlannerSubscriber = (event: IpcMainInvokeEvent | undefined): void => {
  if (event?.sender?.send) plannerSubscribers.add(event.sender);
};

const ensurePlannerChangeBroadcaster = (): void => {
  if (plannerChangeBroadcasterRegistered) return;
  plannerChangeBroadcasterRegistered = true;
  onProjectPlannerDataChanged(() => {
    for (const subscriber of plannerSubscribers) {
      if (subscriber.isDestroyed?.()) {
        plannerSubscribers.delete(subscriber);
      } else {
        subscriber.send(IpcChannel.PlannerDataChanged);
      }
    }
  });
};

export function registerProjectPlannerHandlers({ gitService }: RegisterProjectPlannerHandlersDeps): void {
  ensurePlannerChangeBroadcaster();
  ipcMain.handle(IpcChannel.PlannerGetData, async (event: IpcMainInvokeEvent) => {
    rememberPlannerSubscriber(event);
    return success(readProjectPlannerData());
  });

  ipcMain.handle(IpcChannel.PlannerEnsureRepositoryProject, async (_event: unknown, repoPath: string) => {
    try {
      return success(ensureRepositoryProject(repoPath));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IpcChannel.PlannerCreateProject, async (_event: unknown, input: { name: string; description?: string }) => {
    try {
      return success(createPlannedProject(input));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IpcChannel.PlannerUpdateProject, async (_event: unknown, projectId: string, input: { name?: string; description?: string }) => {
    try {
      return success(updatePlannerProject(projectId, input));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IpcChannel.PlannerDeleteProject, async (_event: unknown, projectId: string) => {
    try {
      deletePlannerProject(projectId);
      return success(true);
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IpcChannel.PlannerDeleteRepositoryProjectByPath, async (_event: unknown, repoPath: string) => {
    try {
      return success(deleteRepositoryPlannerProjectByPath(repoPath));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IpcChannel.PlannerCreateItem, async (_event: unknown, projectId: string, input: Record<string, unknown>) => {
    try {
      return success(createPlannerItem(projectId, input as never));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IpcChannel.PlannerUpdateItem, async (_event: unknown, itemId: string, input: Record<string, unknown>) => {
    try {
      return success(updatePlannerItem(itemId, input as never));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IpcChannel.PlannerDeleteItem, async (_event: unknown, itemId: string) => {
    try {
      deletePlannerItem(itemId);
      return success(true);
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(
    IpcChannel.PlannerMaterializeProject,
    async (event: IpcMainInvokeEvent, projectId: string, parentDirectory: string, requestedFolderName: string) => {
      let targetPath: string | null = null;
      let createdDirectory = false;
      let repoStoreBeforeUpdate: ReturnType<typeof readStoreData> | null = null;
      let repoStoreUpdated = false;
      try {
        const projectBeforeConversion = readProjectPlannerData().projects.find((project) => project.id === projectId);
        if (!projectBeforeConversion) throw new Error('Project not found.');
        if (projectBeforeConversion.kind !== 'planned') throw new Error('Project already has a repository.');

        const requestedParentPath = String(parentDirectory || '').trim();
        if (!requestedParentPath) throw new Error('Selected parent directory is required.');
        const parentPath = getAuthorizedProjectParentDirectory(event?.sender?.id, requestedParentPath);
        if (!parentPath) throw new Error('Selected parent directory is not authorized. Please choose it again.');

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
        if (!repoData.repos.some((repo) => getRepositoryProjectKey(repo.path) === getRepositoryProjectKey(repositoryPath))) {
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
    },
  );
}
