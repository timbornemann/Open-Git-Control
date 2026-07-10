import type { GitRunner } from './GitRunner';

export class CherryPickService {
  constructor(
    private readonly getRepoPath: () => string,
    private readonly runGit: Pick<GitRunner, 'run'>,
  ) {}

  async continueCherryPick(): Promise<string> {
    return this.runGit.run(this.getRepoPath(), ['cherry-pick', '--continue'], {
      envOverrides: {
        GIT_EDITOR: 'true',
      },
    });
  }

  async abortCherryPick(): Promise<string> {
    return this.runGit.run(this.getRepoPath(), ['cherry-pick', '--abort']);
  }
}
