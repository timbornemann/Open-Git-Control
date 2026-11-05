import * as fs from 'fs';
import type { GitRunner } from './GitRunner';
import { normalizeRepositoryRelativePath, resolveExistingRepositoryPathWithoutSymlinks, toLiteralPathspec } from './RepositoryPathSafety';
import { hasUnresolvedConflictMarkers, parseConflictMarkerSize } from '../../src/shared/git/conflictMarkers';
export { hasUnresolvedConflictMarkers, parseConflictMarkerSize } from '../../src/shared/git/conflictMarkers';

export type ActiveRepoCommand = (args: string[]) => Promise<string>;

export class MergeConflictService {
  constructor(
    private readonly getRepoPath: () => string,
    private readonly runCommand: ActiveRepoCommand,
    private readonly runGit: Pick<GitRunner, 'run'>,
  ) {}

  checkoutConflictVersion(filePath: string, side: 'ours' | 'theirs'): Promise<string> {
    return this.runCommand(['checkout', '--' + side, '--', toLiteralPathspec(filePath)]);
  }

  /**
   * Resolves a conflict by accepting the deletion side (e.g. a modify/delete
   * conflict where the other side removed the file). `git rm` stages the
   * removal and clears the unmerged entry; `-f` is required because the working
   * tree still holds the modified copy.
   */
  resolveConflictWithDeletion(filePath: string): Promise<string> {
    return this.runCommand(['rm', '-f', '--', toLiteralPathspec(filePath)]);
  }

  async markFileResolved(filePath: string): Promise<string> {
    const resolvedPath = resolveExistingRepositoryPathWithoutSymlinks(this.getRepoPath(), filePath, 'Conflict file path');
    const normalizedPath = normalizeRepositoryRelativePath(filePath, 'Conflict file path');
    const [contents, markerSizeRaw] = await Promise.all([
      fs.promises.readFile(resolvedPath, 'utf8'),
      this.runCommand(['check-attr', '-z', 'conflict-marker-size', '--', normalizedPath]),
    ]);
    if (hasUnresolvedConflictMarkers(contents, parseConflictMarkerSize(markerSizeRaw))) {
      throw new Error('Conflict markers remain in the file. Resolve them before marking the file as resolved.');
    }
    return this.runCommand(['add', '--', toLiteralPathspec(filePath)]);
  }

  continueMerge(): Promise<string> {
    return this.runGit.run(this.getRepoPath(), ['merge', '--continue'], {
      envOverrides: {
        GIT_EDITOR: 'true',
        GIT_MERGE_AUTOEDIT: 'no',
      },
    });
  }

  abortMerge(): Promise<string> {
    return this.runCommand(['merge', '--abort']);
  }
}
