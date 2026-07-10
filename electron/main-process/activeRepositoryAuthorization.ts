import * as path from 'path';

const repositoryPathKey = (value: string): string => {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

/**
 * Renderer supplied repository paths are context only, never authority. Keep
 * repository-scoped IPC operations pinned to the repository selected by the
 * main process.
 */
export function requireActiveRepositoryPath(requestedRepoPath: unknown, activeRepoPath: string | null | undefined): string {
  const activePath = String(activeRepoPath || '').trim();
  if (!activePath) {
    throw new Error('No repository selected.');
  }

  const requestedPath = String(requestedRepoPath || activePath).trim();
  if (!requestedPath || repositoryPathKey(requestedPath) !== repositoryPathKey(activePath)) {
    throw new Error('Requested repository is not the active repository.');
  }

  return activePath;
}
