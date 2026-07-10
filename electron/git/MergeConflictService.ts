import type { GitRunner } from './GitRunner';
import { toLiteralPathspec } from './RepositoryPathSafety';

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

  markFileResolved(filePath: string): Promise<string> {
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
