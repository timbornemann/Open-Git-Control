import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BranchCleanupPreferences } from '../../src/shared/ipc/branchCleanup';
import { writeTextFileAtomically } from '../main-process/atomicFile';
import { physicalPathKey, repositoryCommonDirectory } from './RepositoryCommonDirectory';

import { DEFAULT_CLEANUP_PROTECTION, normalizeCleanupPreferences } from '../../src/shared/git/branchCleanupProtection';
export { DEFAULT_CLEANUP_PROTECTION, normalizeCleanupPreferences, cleanupPatternMatches } from '../../src/shared/git/branchCleanupProtection';

export class BranchCleanupPreferencesStore {
  constructor(private readonly filePath: () => string) {}

  private key(repoPath: string) {
    const common = repositoryCommonDirectory(repoPath);
    if (!common) throw new Error('Repository common directory is unavailable.');
    return physicalPathKey(common);
  }

  private readStore(): Record<string, BranchCleanupPreferences> {
    if (!fs.existsSync(this.filePath())) return Object.create(null);
    const stored = JSON.parse(fs.readFileSync(this.filePath(), 'utf8')) as { version: number; repositories: Record<string, BranchCleanupPreferences> };
    if (stored.version !== 1 || !stored.repositories || typeof stored.repositories !== 'object' || Array.isArray(stored.repositories))
      throw new Error('Branch cleanup preferences could not be read. The existing file was preserved.');
    const result: Record<string, BranchCleanupPreferences> = Object.create(null);
    for (const [key, value] of Object.entries(stored.repositories)) result[key] = normalizeCleanupPreferences(value);
    return result;
  }

  read(repoPath: string): BranchCleanupPreferences {
    return this.readStore()[this.key(repoPath)] ?? { protectedPatterns: [...DEFAULT_CLEANUP_PROTECTION] };
  }

  write(repoPath: string, input: BranchCleanupPreferences): BranchCleanupPreferences {
    const preferences = normalizeCleanupPreferences(input);
    const store = this.readStore();
    store[this.key(repoPath)] = preferences;
    fs.mkdirSync(path.dirname(this.filePath()), { recursive: true });
    writeTextFileAtomically(this.filePath(), `${JSON.stringify({ version: 1, repositories: store }, null, 2)}\n`);
    return preferences;
  }
}
