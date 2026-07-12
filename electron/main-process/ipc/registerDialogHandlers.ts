import { dialog, ipcMain, type WebContents } from 'electron';
import type { GitService } from '../../GitService';
import { IpcChannel } from '../../../src/types/ipcContract';
import { clearSelectedFileGrants, grantSelectedFiles, grantSelectedProjectParentDirectory } from '../fileAccessGrant';

type RegisterDialogHandlersDeps = {
  gitService: GitService;
};

const grantCleanupRegistrations = new Set<number>();

const ensureGrantCleanup = (sender: WebContents): void => {
  if (grantCleanupRegistrations.has(sender.id)) return;
  grantCleanupRegistrations.add(sender.id);
  sender.once('destroyed', () => {
    clearSelectedFileGrants(sender.id);
    grantCleanupRegistrations.delete(sender.id);
  });
};

export function registerDialogHandlers({ gitService }: RegisterDialogHandlersDeps): void {
  ipcMain.handle(IpcChannel.DialogOpenDirectory, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (canceled) {
      return null;
    }

    const selectedPath = filePaths[0];
    if (!selectedPath) return null;
    let isRepo = false;
    let repositoryPath = selectedPath;
    try {
      await gitService.runCommandAtPath(selectedPath, ['rev-parse', '--is-inside-work-tree']);
      isRepo = true;
      repositoryPath = gitService.resolveRepositoryPath(selectedPath);
    } catch {
      isRepo = false;
    }

    return { path: repositoryPath, isRepo };
  });

  ipcMain.handle(IpcChannel.DialogSelectDirectory, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Zielordner fuer Clone auswaehlen',
    });
    if (canceled) return null;
    return filePaths[0];
  });

  ipcMain.handle(IpcChannel.DialogSelectProjectParentDirectory, async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Speicherort fuer neues Projekt auswaehlen',
      buttonLabel: 'Speicherort auswaehlen',
    });
    if (canceled) return null;
    const selectedPath = filePaths[0];
    if (!selectedPath) return null;
    ensureGrantCleanup(event.sender);
    grantSelectedProjectParentDirectory(event.sender.id, selectedPath);
    return selectedPath;
  });

  ipcMain.handle(IpcChannel.DialogSelectFiles, async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      title: 'Dateien auswaehlen',
    });
    if (canceled) return null;
    ensureGrantCleanup(event.sender);
    grantSelectedFiles(event.sender.id, filePaths);
    return filePaths;
  });
}
