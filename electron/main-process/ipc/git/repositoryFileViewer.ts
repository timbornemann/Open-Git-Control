import { ipcMain } from 'electron';
import type { GitService } from '../../../GitService';
import { RepositoryFileViewerService } from '../../../git/RepositoryFileViewerService';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { IpcChannel } from '../../../../src/types/ipcContract';
import type { RepositoryFileContextDto, RepositoryFilePreviewRequestDto, SaveRepositoryFileRequestDto } from '../../../../src/shared/ipc/repositoryFiles';

export function registerRepositoryFileViewerHandlers(gitService: GitService, ensureWriteAllowed: (repoPath: string) => void): void {
  const files = new RepositoryFileViewerService(gitService.runner, gitService.files);
  const context = <T extends RepositoryFileContextDto>(request: T, channel: string): T => {
    if (!request || typeof request !== 'object') throw new Error('A repository file request is required.');
    return { ...request, repoPath: requireActiveRepositoryPath(request.repoPath, gitService.getRepoPath(), channel) };
  };
  const handle = <T>(channel: IpcChannel, action: (request: T) => Promise<unknown>) => {
    ipcMain.handle(channel, async (_event: unknown, request: T) => {
      try {
        return { success: true, data: await action(request) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
  };
  handle<RepositoryFilePreviewRequestDto>(IpcChannel.GitGetRepositoryFilePreview, (request) =>
    files.getPreview(context(request, IpcChannel.GitGetRepositoryFilePreview)),
  );
  handle<RepositoryFileContextDto>(IpcChannel.GitGetRepositoryFileInfo, (request) => files.getInfo(context(request, IpcChannel.GitGetRepositoryFileInfo)));
  handle<SaveRepositoryFileRequestDto>(IpcChannel.GitSaveRepositoryFile, (request) => {
    const target = context(request, IpcChannel.GitSaveRepositoryFile);
    return files.save(target, () => {
      context(target, IpcChannel.GitSaveRepositoryFile);
      ensureWriteAllowed(target.repoPath);
    });
  });
}
