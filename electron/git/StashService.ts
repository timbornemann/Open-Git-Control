import type { ActiveRepoCommand } from './MergeConflictService';

const STASH_REF_RE = /^stash@\{\d+\}$/;

export class StashService {
  constructor(private readonly runCommand: ActiveRepoCommand) {}

  getStashes(limit: number = 200): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 200;
    return this.runCommand(['stash', 'list', `--max-count=${safeLimit}`]);
  }

  async createBranchFromStash(stashName: string, branchName: string): Promise<string> {
    const normalizedStashName = String(stashName || '').trim();
    const normalizedBranchName = String(branchName || '').trim();
    if (!STASH_REF_RE.test(normalizedStashName)) {
      throw new Error('Invalid stash reference.');
    }
    if (!normalizedBranchName) {
      throw new Error('Branch name is required.');
    }

    await this.runCommand(['check-ref-format', '--branch', normalizedBranchName]);
    return this.runCommand(['stash', 'branch', normalizedBranchName, normalizedStashName]);
  }
}
