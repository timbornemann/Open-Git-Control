import * as fs from 'fs';
import * as path from 'path';
import { ipcMain } from 'electron';
import type { GitService } from '../../../GitService';
import { IpcChannel } from '../../../../src/types/ipcContract';
import type { GitSequencerOperationDto } from '../../../../src/types/gitDtos';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';

type PathExists = (candidatePath: string) => boolean;

export const detectSequencerOperationInGitDir = (gitDir: string, pathExists: PathExists = fs.existsSync): GitSequencerOperationDto | null => {
  // Rebase can internally use the sequencer as well, so its dedicated state
  // directories take precedence over the more general marker files.
  if (pathExists(path.join(gitDir, 'rebase-merge')) || pathExists(path.join(gitDir, 'rebase-apply'))) return 'rebase';
  if (pathExists(path.join(gitDir, 'CHERRY_PICK_HEAD'))) return 'cherry-pick';
  if (pathExists(path.join(gitDir, 'MERGE_HEAD'))) return 'merge';
  return null;
};

export const readSequencerOperation = async (gitService: GitService, repoPath: string): Promise<GitSequencerOperationDto | null> => {
  const rawGitDir = (await gitService.runPollingCommandAtPath(repoPath, ['rev-parse', '--git-dir'], `sequencer-state:${repoPath}`)).trim();
  if (!rawGitDir) throw new Error('Git directory could not be resolved.');
  const gitDir = path.isAbsolute(rawGitDir) ? rawGitDir : path.resolve(repoPath, rawGitDir);
  return detectSequencerOperationInGitDir(gitDir);
};

type RegisterGitOperationStateHandlerDeps = {
  gitService: GitService;
  readOperation?: typeof readSequencerOperation;
};

export const registerGitOperationStateHandler = ({ gitService, readOperation = readSequencerOperation }: RegisterGitOperationStateHandlerDeps): void => {
  ipcMain.handle(IpcChannel.GitSequencerState, async (_event: unknown, requestedRepoPath?: unknown) => {
    try {
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      const operation = await readOperation(gitService, repoPath);
      return { success: true, data: { operation } };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Could not determine the active Git operation.' };
    }
  });
};
