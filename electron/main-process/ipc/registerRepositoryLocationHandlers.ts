import { BrowserWindow, dialog, ipcMain } from 'electron';
import * as path from 'path';
import type { GitService } from '../../GitService';
import type { RepositoryLocationRequest } from '../../../src/shared/ipc/repositoryLocation';
import { IpcChannel } from '../../../src/types/ipcContract';
import { RepositoryLocationService } from '../RepositoryLocationService';
import { repositoryPathKey } from '../activeRepositoryAuthorization';
import { repoJobRegistry } from '../repoJobRegistry';
import { isAllowedAppNavigation } from '../security';
import { redactGitSensitiveText } from '../../git/GitErrorFormatter';
import { ensureCommitProtectionIsIdle } from '../RepositoryCommitProtection';

export function registerRepositoryLocationHandlers(gitService: GitService, service = new RepositoryLocationService(gitService.runner)) {
  const handle = (channel: IpcChannel, select: boolean) => {
    ipcMain.handle(channel, async (event, request: RepositoryLocationRequest) => {
      try {
        if (
          !event.senderFrame ||
          event.senderFrame !== event.sender.mainFrame ||
          !BrowserWindow.fromWebContents(event.sender) ||
          !isAllowedAppNavigation(event.senderFrame.url, { isDev: process.env.NODE_ENV === 'development', mainProcessDir: path.join(__dirname, '../..') })
        )
          throw new Error('Repository recovery requires the trusted app window.');
        if (!request || typeof request.repoPath !== 'string' || !path.isAbsolute(request.repoPath)) throw new Error('Choose a saved repository.');
        const generation = repoJobRegistry.getGeneration();
        const current = () => {
          const active = gitService.getRepoPath();
          if (!active || repositoryPathKey(active) !== repositoryPathKey(request.repoPath) || repoJobRegistry.getGeneration() !== generation)
            throw new Error('The active repository changed. Repository recovery was stopped.');
          ensureCommitProtectionIsIdle(active);
        };
        current();
        if (!select) return { success: true, data: await service.recheck(request.repoPath, current) };
        const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!, { properties: ['openDirectory'] });
        current();
        if (result.canceled || !result.filePaths[0]) return { success: true, data: null };
        return { success: true, data: await service.relocate(request.repoPath, result.filePaths[0], current) };
      } catch (error) {
        return { success: false, error: redactGitSensitiveText(error instanceof Error ? error.message : String(error)) };
      }
    });
  };
  handle(IpcChannel.ReposRecheck, false);
  handle(IpcChannel.ReposSelectLocation, true);
}
