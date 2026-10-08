import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import type { GitService } from '../../GitService';
import { GitIdentityService } from '../../git/GitIdentityService';
import { redactGitSensitiveText } from '../../git/GitErrorFormatter';
import { IpcChannel } from '../../../src/types/ipcContract';
import type { GitIdentityRequest, SaveGitIdentityRequest } from '../../../src/shared/ipc/gitIdentity';
import { requireActiveRepositoryPath } from '../activeRepositoryAuthorization';
import { ensureCommitProtectionIsIdle } from '../RepositoryCommitProtection';
import { repoJobRegistry } from '../repoJobRegistry';
import { isAllowedAppNavigation } from '../security';

export function registerGitIdentityHandlers(gitService: GitService) {
  const service = new GitIdentityService(gitService.runner);
  const authorize = (event: Electron.IpcMainInvokeEvent, request: GitIdentityRequest) => {
    if (
      !event.senderFrame ||
      event.senderFrame !== event.sender.mainFrame ||
      !BrowserWindow.fromWebContents(event.sender) ||
      !isAllowedAppNavigation(event.senderFrame.url, { isDev: process.env.NODE_ENV === 'development', mainProcessDir: path.join(__dirname, '../..') })
    )
      throw new Error('Git identity configuration requires the trusted app window.');
    if (!request || !['repository', 'global'].includes(request.scope)) throw new Error('Choose the Git configuration scope.');
    if (request.repoPath === null) {
      if (request.scope === 'global' && !gitService.getRepoPath()) return null;
      throw new Error('The repository context changed. Reopen Git identity settings.');
    }
    if (typeof request.repoPath !== 'string' || !request.repoPath.trim()) throw new Error('Choose a repository or the global Git configuration.');
    return requireActiveRepositoryPath(request.repoPath, gitService.getRepoPath(), 'git:identity');
  };
  ipcMain.handle(IpcChannel.GitGetIdentity, async (event, request: GitIdentityRequest) => {
    try {
      const repoPath = authorize(event, request),
        generation = repoJobRegistry.getGeneration();
      const data = await service.read({ ...request, repoPath });
      authorize(event, { ...request, repoPath });
      if (generation !== repoJobRegistry.getGeneration()) throw new Error('The repository changed while checking Git identity.');
      return { success: true, data };
    } catch (error) {
      return { success: false, error: redactGitSensitiveText(error instanceof Error ? error.message : String(error)) };
    }
  });
  ipcMain.handle(IpcChannel.GitSaveIdentity, async (event, request: SaveGitIdentityRequest) => {
    try {
      const repoPath = authorize(event, request),
        generation = repoJobRegistry.getGeneration();
      if (repoPath) ensureCommitProtectionIsIdle(repoPath);
      const data = await service.save({ ...request, repoPath }, () => {
        authorize(event, { ...request, repoPath });
        if (repoPath) ensureCommitProtectionIsIdle(repoPath);
        if (generation !== repoJobRegistry.getGeneration()) throw new Error('The repository changed. Git identity setup was stopped.');
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: redactGitSensitiveText(error instanceof Error ? error.message : String(error)) };
    }
  });
}
