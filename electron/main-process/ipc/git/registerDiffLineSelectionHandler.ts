import { ipcMain } from 'electron';
import type { GitService } from '../../../GitService';
import { DiffLineStagingService } from '../../../git/DiffLineStagingService';
import type { ApplyDiffLineSelectionRequest } from '../../../../src/shared/ipc/diffLineSelection';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { ensureCommitProtectionIsIdle } from '../../RepositoryCommitProtection';
import { redactGitSensitiveText } from '../../../git/GitErrorFormatter';

export function registerDiffLineSelectionHandler(gitService: GitService) {
  const service = new DiffLineStagingService(gitService.runner);
  ipcMain.handle(IpcChannel.GitApplyDiffLineSelection, async (_event, request: ApplyDiffLineSelectionRequest) => {
    try {
      if (!request || typeof request.repoPath !== 'string' || !request.repoPath) throw new Error('Repository path is required.');
      const ensureActive = () => {
        const repo = requireActiveRepositoryPath(request?.repoPath, gitService.getRepoPath(), IpcChannel.GitApplyDiffLineSelection);
        ensureCommitProtectionIsIdle(repo);
      };
      ensureActive();
      return { success: true, data: await service.apply(request, ensureActive) };
    } catch (error) {
      return { success: false, error: redactGitSensitiveText(error instanceof Error ? error.message : 'Applying selected lines failed.') };
    }
  });
}
