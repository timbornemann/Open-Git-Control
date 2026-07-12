import * as fs from 'fs';
import type { GitRunner } from './GitRunner';
import { resolveExistingRepositoryPath, toLiteralPathspec } from './RepositoryPathSafety';

export type ActiveRepoCommand = (args: string[]) => Promise<string>;

export const hasUnresolvedConflictMarkers = (contents: string): boolean => /^<{7,}(?: .*)?\r?$/m.test(contents) && /^>{7,}(?: .*)?\r?$/m.test(contents);

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
    const resolvedPath = resolveExistingRepositoryPath(this.getRepoPath(), filePath, 'Conflict file path');
    const contents = await fs.promises.readFile(resolvedPath, 'utf8');
    // A real unresolved conflict has BOTH an opening (`<<<<<<<`) and a closing
    // (`>>>>>>>`) marker. Requiring both avoids false-positives on a legitimate
    // lone `=======` line (e.g. a Markdown setext heading rule), which must not
    // block marking the file as resolved.
    if (hasUnresolvedConflictMarkers(contents)) {
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
