import * as fs from 'fs';
import type { GitRunner } from './GitRunner';
import { resolveExistingRepositoryPath, toLiteralPathspec } from './RepositoryPathSafety';

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

  async markFileResolved(filePath: string): Promise<string> {
    const resolvedPath = resolveExistingRepositoryPath(this.getRepoPath(), filePath, 'Conflict file path');
    const contents = await fs.promises.readFile(resolvedPath, 'utf8');
    const hasStartMarker = /^<{7,}(?: .*)?\r?$/m.test(contents);
    const hasSeparatorMarker = /^={7,}\r?$/m.test(contents);
    const hasEndMarker = /^>{7,}(?: .*)?\r?$/m.test(contents);
    if (hasStartMarker || hasSeparatorMarker || hasEndMarker) {
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
