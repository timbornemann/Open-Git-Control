import { readGitProcessErrorText } from './GitProcessTypes';

export const INDEX_LOCK_RETRY_MAX_ATTEMPTS = 6;
const INDEX_LOCK_RETRY_BASE_DELAY_MS = 75;
const INDEX_LOCK_RETRY_MAX_DELAY_MS = 600;

export class GitIndexLockRecovery {
  isIndexLockError(error: unknown): boolean {
    const text = `${readGitProcessErrorText(error, 'stderr')}\n${readGitProcessErrorText(error, 'stdout')}\n${readGitProcessErrorText(error, 'message')}`;
    return /index\.lock/i.test(text) && /file exists/i.test(text);
  }

  retryDelayMs(retryAttempt: number): number {
    return Math.min(INDEX_LOCK_RETRY_MAX_DELAY_MS, INDEX_LOCK_RETRY_BASE_DELAY_MS * 2 ** retryAttempt);
  }

  removeStaleIndexLockIfSafe(_repoPath: string, _args: string[]): boolean {
    // Git's index.lock contains no portable owner identity. Age alone cannot
    // prove that another slow or suspended Git process no longer owns it, so
    // automatic deletion risks corrupting an active index transaction.
    return false;
  }
}
