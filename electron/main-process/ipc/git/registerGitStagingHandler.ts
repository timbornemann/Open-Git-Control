import { ipcMain } from 'electron';
import type { GitService } from '../../../GitService';
import type { CommitStatsService } from '../../../CommitStatsService';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { createJobId } from '../../gitCommandPolicy';
import { ensureCommitProtectionIsIdle } from '../../RepositoryCommitProtection';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { emitJobEvent } from '../jobEvents';

export function registerGitStagingHandler(gitService: GitService, commitStatsService: CommitStatsService) {
  ipcMain.handle(IpcChannel.GitStagePaths, async (event, paths: unknown, requestedRepoPath?: unknown) => {
    const jobId = createJobId('git-stage-paths');
    emitJobEvent(event.sender, { id: jobId, operation: 'git:add', status: 'start', timestamp: Date.now() });
    try {
      const normalizedPaths = Array.isArray(paths) ? paths.map((filePath) => String(filePath || '')).slice(0, 100_000) : [];
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath(), IpcChannel.GitStagePaths);
      const assertReady = () => {
        requireActiveRepositoryPath(repoPath, gitService.getRepoPath(), IpcChannel.GitStagePaths);
        ensureCommitProtectionIsIdle(repoPath);
      };
      assertReady();
      commitStatsService.interruptBackgroundWork();
      const data = await gitService.staging.stagePathsAtPath(repoPath, normalizedPaths, assertReady);
      emitJobEvent(event.sender, { id: jobId, operation: 'git:add', status: 'done', details: { pathCount: normalizedPaths.length }, timestamp: Date.now() });
      return { success: true, data };
    } catch (error: any) {
      emitJobEvent(event.sender, { id: jobId, operation: 'git:add', status: 'failed', message: error.message, timestamp: Date.now() });
      return { success: false, error: error.message };
    }
  });
}
