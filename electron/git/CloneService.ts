import * as fs from 'fs';
import * as path from 'path';
import type { GitRunner } from './GitRunner';

export type CloneRepositoryResult = {
  success: boolean;
  repoPath: string;
  error?: string;
};

export class CloneService {
  constructor(private readonly gitRunner: Pick<GitRunner, 'cloneWithProgress'>) {}

  private normalizeCloneSource(value: string): string {
    const source = String(value || '').trim();
    if (!source || source.length > 2_000 || /[\0\r\n]/.test(source)) {
      throw new Error('Clone source is invalid.');
    }
    return source;
  }

  sanitizeCloneTargetName(value: string): string {
    const normalized = String(value || '')
      .trim()
      .replace(/[\\/]+/g, '-')
      .replace(/[:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/\.+$/, '');
    return normalized || 'repo';
  }

  deriveCloneRepoName(cloneSource: string): string {
    const normalizedSource = String(cloneSource || '')
      .trim()
      .replace(/[\\]+/g, '/')
      .replace(/\/+$/, '');
    const withoutGitSuffix = normalizedSource.replace(/\.git$/i, '');
    const lastSegment = withoutGitSuffix.split('/').pop() || 'repo';
    return this.sanitizeCloneTargetName(lastSegment);
  }

  resolveCloneTargetPath(cloneSource: string, targetDir: string, targetName?: string): string {
    const rawTargetDir = String(targetDir || '').trim();
    if (!rawTargetDir) {
      throw new Error('Clone target directory is required.');
    }

    const resolvedTargetDir = path.resolve(rawTargetDir);
    let targetDirStats: fs.Stats;
    try {
      targetDirStats = fs.statSync(resolvedTargetDir);
    } catch {
      throw new Error(`Clone target directory does not exist: ${resolvedTargetDir}`);
    }
    if (!targetDirStats.isDirectory()) {
      throw new Error(`Clone target is not a directory: ${resolvedTargetDir}`);
    }

    const repoName = targetName ? this.sanitizeCloneTargetName(targetName) : this.deriveCloneRepoName(cloneSource);
    const repoPath = path.resolve(resolvedTargetDir, repoName);
    const relative = path.relative(resolvedTargetDir, repoPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Clone target name resolves outside of the selected directory.');
    }
    return repoPath;
  }

  cloneRepo(cloneUrl: string, targetDir: string, onProgress: (line: string) => void, targetName?: string): Promise<CloneRepositoryResult> {
    return new Promise((resolve) => {
      let repoPath = '';
      let normalizedCloneUrl = '';
      try {
        normalizedCloneUrl = this.normalizeCloneSource(cloneUrl);
        repoPath = this.resolveCloneTargetPath(normalizedCloneUrl, targetDir, targetName);
      } catch (error: any) {
        resolve({
          success: false,
          repoPath: targetDir ? path.resolve(String(targetDir)) : '',
          error: error?.message || 'Invalid clone target.',
        });
        return;
      }

      if (fs.existsSync(repoPath)) {
        resolve({
          success: false,
          repoPath,
          error: `Destination path already exists: ${repoPath}`,
        });
        return;
      }

      void this.gitRunner.cloneWithProgress(normalizedCloneUrl, repoPath, onProgress).then((result) => {
        resolve({
          success: result.success,
          repoPath,
          error: result.error,
        });
      });
    });
  }
}
