import * as fs from 'fs';
import { createRepoUnavailableErrorMessage } from '../../src/shared/git/errors';

export const isRepoPathAccessible = (repoPath: string): boolean => {
  try {
    const stat = fs.statSync(repoPath);
    return stat.isDirectory();
  } catch (error) {
    // Only a genuinely missing path means the repository is gone. Transient OS
    // errors (a briefly locked handle, too many open files, or a permission
    // blip under heavy filesystem load) must NOT be reported as "unavailable":
    // that verdict feeds the renderer's repo-unavailable workflow, which would
    // otherwise remove a perfectly valid repository from the list. Let the
    // actual Git command run and surface a real error if the repo is broken.
    const code = (error as NodeJS.ErrnoException | null)?.code;
    return code !== 'ENOENT' && code !== 'ENOTDIR';
  }
};

export const assertRepoPathAvailable = (repoPath: string): void => {
  if (!isRepoPathAccessible(repoPath)) {
    throw new Error(createRepoUnavailableErrorMessage());
  }
};
