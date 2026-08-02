import * as path from 'path';

export const repositoryPathKey = (value: string): string => {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

const formatDiagnosticValue = (value: string): string => JSON.stringify(value || '(not provided)');

const formatAuthorizationError = (requestedPath: string, activePath: string, action?: string): string => {
  const actionContext = action ? ` while handling ${formatDiagnosticValue(action)}` : '';
  return `Requested repository is not the active repository${actionContext}. Requested repository: ${formatDiagnosticValue(requestedPath)}. Active repository: ${formatDiagnosticValue(activePath)}.`;
};

/**
 * Renderer supplied repository paths are context only, never authority. Keep
 * repository-scoped IPC operations pinned to the repository selected by the
 * main process.
 */
export function requireActiveRepositoryPath(requestedRepoPath: unknown, activeRepoPath: string | null | undefined, action?: string): string {
  const activePath = String(activeRepoPath || '').trim();
  if (!activePath) {
    const actionContext = action ? ` while handling ${formatDiagnosticValue(action)}` : '';
    throw new Error(`No repository selected${actionContext}. Requested repository: ${formatDiagnosticValue(String(requestedRepoPath || '').trim())}.`);
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
    throw new Error(formatAuthorizationError(requestedPath, activePath, action));
  }

  return activePath;
}
