import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { readGitProcessErrorText } from './GitProcessTypes';

const STALE_INDEX_LOCK_MAX_AGE_MS = 45_000;
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

  removeStaleIndexLockIfSafe(repoPath: string, args: string[]): boolean {
    const lockPath = this.resolveIndexLockPath(repoPath);
    if (!fs.existsSync(lockPath)) {
      return false;
    }

    try {
      const stat = fs.statSync(lockPath);
      const ageMs = Date.now() - stat.mtimeMs;
      if (!Number.isFinite(ageMs) || ageMs < STALE_INDEX_LOCK_MAX_AGE_MS) {
        return false;
      }

      fs.rmSync(lockPath, { force: true });
      console.warn(`Removed stale git index lock (${lockPath}) and retrying: git ${args.join(' ')}`);
      return true;
    } catch {
      return false;
    }
  }

  private resolveIndexLockPath(repoPath: string): string {
    try {
      const gitDirRaw = execFileSync('git', ['rev-parse', '--git-dir'], {
        cwd: repoPath,
        windowsHide: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const gitDirPath = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.resolve(repoPath, gitDirRaw || '.git');
      return path.join(gitDirPath, 'index.lock');
    } catch {
      return path.join(repoPath, '.git', 'index.lock');
    }
  }
}
