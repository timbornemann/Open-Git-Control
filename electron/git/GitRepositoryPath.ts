import * as fs from 'fs';
import { createRepoUnavailableErrorMessage } from '../../src/shared/git/errors';

export const isRepoPathAccessible = (repoPath: string): boolean => {
  try {
    const stat = fs.statSync(repoPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
};

export const assertRepoPathAvailable = (repoPath: string): void => {
  if (!isRepoPathAccessible(repoPath)) {
    throw new Error(createRepoUnavailableErrorMessage());
  }
};
