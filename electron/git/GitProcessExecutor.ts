import { createRepoUnavailableErrorMessage } from '../../src/shared/git/errors';
import { GitErrorFormatter } from './GitErrorFormatter';
import { GitIndexLockRecovery, INDEX_LOCK_RETRY_MAX_ATTEMPTS } from './GitIndexLockRecovery';
import { isRepoPathAccessible } from './GitRepositoryPath';
import type { ExecFileAsyncRunner, GitExecFileOptions } from './GitProcessTypes';
import { createAbortError, readGitProcessErrorText } from './GitProcessTypes';

export class GitProcessExecutor {
  constructor(
    private readonly execFileAsyncRunner: ExecFileAsyncRunner,
    private readonly lockRecovery: GitIndexLockRecovery = new GitIndexLockRecovery(),
    private readonly errorFormatter: GitErrorFormatter = new GitErrorFormatter(),
  ) {}

  async run(repoPath: string, args: string[], execOptions: GitExecFileOptions): Promise<string> {
    let retryAttempt = 0;

    while (true) {
      try {
        const { stdout } = await this.execFileAsyncRunner('git', args, execOptions);
        return stdout.trimEnd();
      } catch (error: unknown) {
        const errorName = readGitProcessErrorText(error, 'name');
        const errorCode = readGitProcessErrorText(error, 'code');
        if (execOptions.signal?.aborted || errorName === 'AbortError' || errorCode === 'ABORT_ERR') {
          throw createAbortError('Git operation was aborted.');
        }

        if (errorCode === 'ENOENT' && !isRepoPathAccessible(repoPath)) {
          throw new Error(createRepoUnavailableErrorMessage());
        }

        if (errorCode === 'ENOENT' && /spawn\s+git\s+enoent/i.test(readGitProcessErrorText(error, 'message'))) {
          throw new Error('Git executable not found in PATH (spawn git ENOENT). Please install Git and restart the app.');
        }

        if (!this.lockRecovery.isIndexLockError(error)) {
          throw this.errorFormatter.normalizeGitError(error, args);
        }

        if (this.lockRecovery.removeStaleIndexLockIfSafe(repoPath, args)) {
          continue;
        }

        if (retryAttempt >= INDEX_LOCK_RETRY_MAX_ATTEMPTS) {
          throw this.errorFormatter.normalizeGitError(error, args);
        }

        await sleep(this.lockRecovery.retryDelayMs(retryAttempt));
        retryAttempt += 1;
      }
    }
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
