import * as path from 'path';

export const repositoryPathKey = (value: string): string => {
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
  const activeKey = repositoryPathKey(activePath);
  const requestedKey = repositoryPathKey(requestedPath);
  // Older saved entries (and folder-picker selections) may point at a
  // subdirectory while Git canonicalizes the backend path to the repository
  // root. A descendant still identifies this same active repository and grants
  // no authority outside that root.
  const relativeToActive = path.relative(activeKey, requestedKey);
  const escapesActiveRepository = relativeToActive === '..' || relativeToActive.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToActive);
  const identifiesActiveRepository = requestedKey === activeKey || (relativeToActive.length > 0 && !escapesActiveRepository);
  if (!requestedPath || !identifiesActiveRepository) {
    throw new Error('Requested repository is not the active repository.');
  }

  return activePath;
}
