import type { ActiveRepoCommand } from './MergeConflictService';

const STASH_REF_RE = /^stash@\{\d+\}$/;

export class StashService {
  constructor(
    private readonly runCommand: ActiveRepoCommand,
    private readonly runCommandAtPath?: (repoPath: string, args: string[]) => Promise<string>,
  ) {}

  getStashes(limit: number = 200): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 200;
    // A machine-readable format keeps custom and localized stash subjects
    // parseable; Git's default `On/WIP on <branch>:` text is locale-dependent.
    return this.runCommand(['stash', 'list', '--format=%gd%x1f%H%x1f%gs%x00', `--max-count=${safeLimit}`]);
  }

  async createBranchFromStash(stashName: string, branchName: string): Promise<string> {
    return this.createBranchFromStashWithRunner(stashName, branchName, this.runCommand);
  }

  async createBranchFromStashAtPath(repoPath: string, stashName: string, branchName: string): Promise<string> {
    if (!this.runCommandAtPath) throw new Error('Repository-scoped stash operations are unavailable.');
    return this.createBranchFromStashWithRunner(stashName, branchName, (args) => this.runCommandAtPath!(repoPath, args));
  }

  private async createBranchFromStashWithRunner(stashName: string, branchName: string, runCommand: ActiveRepoCommand): Promise<string> {
    const normalizedStashName = String(stashName || '').trim();
    const normalizedBranchName = String(branchName || '').trim();
    if (!STASH_REF_RE.test(normalizedStashName)) {
      throw new Error('Invalid stash reference.');
    }
    if (!normalizedBranchName) {
      throw new Error('Branch name is required.');
    }

    await runCommand(['check-ref-format', '--branch', normalizedBranchName]);
    return runCommand(['stash', 'branch', normalizedBranchName, normalizedStashName]);
  }
}
