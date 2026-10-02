import { repositoryPathKey } from './activeRepositoryAuthorization';
import { repositoryCommonDirectory } from '../git/RepositoryCommonDirectory';

const locks = new Set<string>();
export const COMMIT_PROTECTION_BUSY_ERROR = 'A protected commit operation is running. Wait for it to finish before changing repository state.';
const keyFor = (repoPath: string) => repositoryPathKey(repositoryCommonDirectory(repoPath) || repoPath);

export function beginCommitProtection(repoPath: string): (() => void) | null {
  const key = keyFor(repoPath);
  if (locks.has(key)) return null;
  locks.add(key);
  return () => {
    locks.delete(key);
  };
}

export function ensureCommitProtectionIsIdle(repoPath: string): void {
  if (locks.has(keyFor(repoPath))) throw new Error(COMMIT_PROTECTION_BUSY_ERROR);
}
