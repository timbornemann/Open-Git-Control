import { dialog, ipcMain } from 'electron';
import { GitService } from '../../GitService';

type RegisterDialogHandlersDeps = {
  gitService: GitService;
};

export function registerDialogHandlers({ gitService }: RegisterDialogHandlersDeps): void {
  ipcMain.handle('dialog:openDirectory', async () => {
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

  ipcMain.handle('dialog:selectDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Zielordner fuer Clone auswaehlen',
    });
    if (canceled) return null;
    return filePaths[0];
  });

  ipcMain.handle('dialog:selectProjectParentDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Speicherort fuer neues Projekt auswaehlen',
      buttonLabel: 'Speicherort auswaehlen',
    });
    if (canceled) return null;
    return filePaths[0];
  });
}
