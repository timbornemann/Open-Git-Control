import type { GitService } from '../../../GitService';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';

/** Asynchronous filesystem mutations share Git's write lane, including rollback. */
export async function withWorkingDirectoryWrite<T>(
  gitService: GitService,
  repoPath: string,
  operation: string,
  ensureWriteAllowed: (repoPath: string) => void,
  work: (ensureContext: () => void) => Promise<T>,
): Promise<T> {
  const ensureContext = () => {
    requireActiveRepositoryPath(repoPath, gitService.getRepoPath(), operation);
    ensureWriteAllowed(repoPath);
  };
  ensureContext();
  const execute = async () => {
    ensureContext();
    return work(ensureContext);
  };
  // Minimal injected Git services in handler tests do not own a scheduler.
  return gitService.runner?.withExclusiveWrite ? gitService.runner.withExclusiveWrite(repoPath, operation, execute) : execute();
}
