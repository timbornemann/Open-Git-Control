import * as fs from 'fs';
import * as path from 'path';

const CONTROL_CHARACTERS = /[\0\r\n]/;

// Backslash is a directory separator on Windows but a legal filename character
// on POSIX. Only fold it to a forward slash on platforms where Git/the OS
// actually treat it as a separator, otherwise ` a\b ` names get mangled.
const BACKSLASH_IS_SEPARATOR = process.platform === 'win32';

/**
 * Validates a path supplied by the renderer before it is used as a Git
 * pathspec or as a working-tree path. Callers that use the value as a Git
 * pathspec must wrap it with toLiteralPathspec; a real filename may itself
 * legitimately start with pathspec-looking text such as `:(glob)`.
 *
 * Leading and trailing whitespace is preserved: ` target.txt` and `target.txt`
 * are distinct files in Git, so trimming would silently redirect reads/writes
 * to the wrong path.
 */
export function normalizeRepositoryRelativePath(value: unknown, label = 'File path'): string {
  const rawPath = typeof value === 'string' ? value : value == null ? '' : String(value);
  if (rawPath.length === 0) {
    throw new Error(`${label} is required.`);
  }

  const normalizedPath = BACKSLASH_IS_SEPARATOR ? rawPath.replace(/\\/g, '/') : rawPath;
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
