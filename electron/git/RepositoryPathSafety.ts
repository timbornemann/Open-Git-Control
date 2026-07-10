import * as fs from 'fs';
import * as path from 'path';

const CONTROL_CHARACTERS = /[\0\r\n]/;

/**
 * Validates a path supplied by the renderer before it is used as a Git
 * pathspec or as a working-tree path. Callers that use the value as a Git
 * pathspec must wrap it with toLiteralPathspec; a real filename may itself
 * legitimately start with pathspec-looking text such as `:(glob)`.
 */
export function normalizeRepositoryRelativePath(value: unknown, label = 'File path'): string {
  const rawPath = String(value || '').trim();
  if (!rawPath) {
    throw new Error(`${label} is required.`);
  }

  const normalizedPath = rawPath.replace(/\\/g, '/');
  const segments = normalizedPath.split('/');
  if (
    path.isAbsolute(rawPath) ||
    path.win32.isAbsolute(rawPath) ||
    normalizedPath.startsWith('/') ||
    segments.includes('..') ||
    CONTROL_CHARACTERS.test(rawPath)
  ) {
    throw new Error(`${label} must be repository-relative.`);
  }

  return normalizedPath;
}

export function toLiteralPathspec(value: unknown, label = 'Pathspec'): string {
  return `:(literal)${normalizeRepositoryRelativePath(value, label)}`;
}

const isInside = (rootPath: string, targetPath: string, allowRoot = false): boolean => {
  const relative = path.relative(rootPath, targetPath);
  if (relative === '') return allowRoot;
  return !relative.startsWith('..') && !path.isAbsolute(relative);
};

/**
 * Resolves a repository-relative, existing path through all symlinks and
 * rejects targets outside of the physical repository root.
 */
export function resolveExistingRepositoryPath(repoPath: string, relativePath: unknown, label = 'File path'): string {
  const normalizedPath = normalizeRepositoryRelativePath(relativePath, label);
  const physicalRepoPath = fs.realpathSync(repoPath);
  const candidatePath = path.resolve(physicalRepoPath, normalizedPath);
  const physicalTargetPath = fs.realpathSync(candidatePath);

  if (!isInside(physicalRepoPath, physicalTargetPath)) {
    throw new Error(`${label} is outside the current repository.`);
  }

  return physicalTargetPath;
}

/**
 * Resolves a possibly not-yet-existing path while checking the closest
 * existing parent. This is required for safe creation inside a repository.
 */
export function resolveRepositoryPathForCreate(repoPath: string, relativePath: unknown, label = 'File path'): string {
  const normalizedPath = normalizeRepositoryRelativePath(relativePath, label);
  const physicalRepoPath = fs.realpathSync(repoPath);
  const candidatePath = path.resolve(physicalRepoPath, normalizedPath);

  let existingParent = candidatePath;
  while (!fs.existsSync(existingParent)) {
    const parent = path.dirname(existingParent);
    if (parent === existingParent) {
      throw new Error(`${label} is outside the current repository.`);
    }
    existingParent = parent;
  }

  const physicalParent = fs.realpathSync(existingParent);
  if (!isInside(physicalRepoPath, physicalParent, true)) {
    throw new Error(`${label} is outside the current repository.`);
  }

  return candidatePath;
}
