import type { ActiveRepoCommand } from './MergeConflictService';

export class SubmoduleService {
  constructor(private readonly runCommand: ActiveRepoCommand) {}

  async getSubmoduleStatus(): Promise<string> {
    try {
      return await this.runCommand(['submodule', 'status', '--recursive']);
    } catch (error: any) {
      if (/no submodule mapping found in \.gitmodules for path/i.test(String(error?.message || ''))) {
        return '';
      }
      throw error;
    }
  }

  updateInitRecursive(): Promise<string> {
    return this.runCommand(['submodule', 'update', '--init', '--recursive']);
  }

  syncRecursive(): Promise<string> {
    return this.runCommand(['submodule', 'sync', '--recursive']);
  }
}
