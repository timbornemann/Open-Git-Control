import * as path from 'path';

const repositoryPathKey = (repoPath: string): string => {
  const resolved = path.resolve(String(repoPath || '').trim() || '.');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

/**
 * Tracks the bare status of the active repository. The active repository's
 * status is cached, while any explicit different path is probed directly so it
 * never inherits the active repository's cached bare flag.
 */
export class RepositoryBareState {
  private activePath: string | null = null;
  private activeIsBare: boolean | null = null;

  constructor(private readonly detect: (repoPath: string) => boolean) {}

  setActive(repoPath: string, isBare: boolean): void {
    this.activePath = repoPath;
    this.activeIsBare = isBare;
  }

  clear(): void {
    this.activePath = null;
    this.activeIsBare = null;
  }

  isBareAtPath(repoPath: string): boolean {
    const normalized = String(repoPath || '').trim();
    if (!normalized) return false;
    const isActive = Boolean(this.activePath) && repositoryPathKey(normalized) === repositoryPathKey(this.activePath as string);
    if (!isActive) return this.detect(normalized);
    if (typeof this.activeIsBare === 'boolean') return this.activeIsBare;
    this.activeIsBare = this.detect(normalized);
    return this.activeIsBare;
  }
}
