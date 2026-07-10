import { dialog, ipcMain } from 'electron';
import type { GitService } from '../../GitService';
import { IpcChannel } from '../../../src/types/ipcContract';

type RegisterDialogHandlersDeps = {
  gitService: GitService;
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
    let isRepo = false;
    try {
      await gitService.runCommandAtPath(selectedPath, ['rev-parse', '--is-inside-work-tree']);
      isRepo = true;
    } catch {
      isRepo = false;
    }

    return { path: selectedPath, isRepo };
  });

  ipcMain.handle(IpcChannel.DialogSelectDirectory, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Zielordner fuer Clone auswaehlen',
    });
    if (canceled) return null;
    return filePaths[0];
  });

  ipcMain.handle(IpcChannel.DialogSelectProjectParentDirectory, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Speicherort fuer neues Projekt auswaehlen',
      buttonLabel: 'Speicherort auswaehlen',
    });
    if (canceled) return null;
    return filePaths[0];
  });

  ipcMain.handle(IpcChannel.DialogSelectFiles, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      title: 'Dateien auswaehlen',
    });
    if (canceled) return null;
    return filePaths;
  });
}
