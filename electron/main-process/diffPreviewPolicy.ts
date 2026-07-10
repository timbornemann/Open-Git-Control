import * as path from 'path';
import { sanitizeArg } from './gitCommandPolicy';
import { toLiteralPathspec } from '../git/RepositoryPathSafety';

const COMMIT_HASH_RE = /^[0-9a-f]{7,64}$/i;

function normalizeRepoRelativePath(value: unknown): string {
  const filePath = sanitizeArg(value);
  const normalizedForCheck = filePath.replace(/\\/g, '/');
  const segments = normalizedForCheck.split('/');

  if (
    path.isAbsolute(filePath) ||
    path.win32.isAbsolute(filePath) ||
    normalizedForCheck.startsWith('/') ||
    normalizedForCheck.startsWith(':(') ||
    segments.includes('..')
  ) {
    throw new Error('Diff path must be repository-relative.');
  }

  return toLiteralPathspec(filePath, 'Diff path');
}

export function normalizeDiffPreviewArgs(args: unknown): string[] {
  if (!Array.isArray(args)) {
    throw new Error('Diff arguments are required.');
  }

  const command = sanitizeArg(args[0]);
  if (command === 'diff') {
    if (args.length === 3 && sanitizeArg(args[1]) === '--') {
      return ['diff', '--', normalizeRepoRelativePath(args[2])];
    }

    if (args.length === 4 && sanitizeArg(args[1]) === '--cached' && sanitizeArg(args[2]) === '--') {
      return ['diff', '--cached', '--', normalizeRepoRelativePath(args[3])];
    }
  }

  if (command === 'show') {
    if (args.length === 6 && sanitizeArg(args[1]) === '--format=' && sanitizeArg(args[2]) === '--binary' && sanitizeArg(args[4]) === '--') {
      const commitHash = sanitizeArg(args[3]);
      if (!COMMIT_HASH_RE.test(commitHash)) {
        throw new Error('Invalid commit hash.');
      }
      return ['show', '--format=', '--binary', commitHash, '--', normalizeRepoRelativePath(args[5])];
    }
  }

  throw new Error('Unsupported diff preview command.');
}
