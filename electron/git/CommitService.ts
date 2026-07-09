import * as path from 'path';
import { cleanupPrivateTempDir, createPrivateTempDir, writePrivateTempFile } from './PrivateTempFiles';

export type CommitMessageInput = {
  title: string;
  description?: string;
  amend?: boolean;
  signoff?: boolean;
  allowEmpty?: boolean;
};

export type ExecuteGitCommand = (repoPath: string, args: string[], envOverrides?: NodeJS.ProcessEnv) => Promise<string>;

const MAX_COMMIT_MESSAGE_FILE_LENGTH = 100_000;

export class CommitService {
  constructor(private readonly executeGit: ExecuteGitCommand) {}

  private normalizePathspecEntries(paths: string[]): string[] {
    const normalized = [...new Set(paths.map((filePath) => String(filePath || '').trim()).filter(Boolean))];
    if (normalized.some((filePath) => /[\0\r\n]/.test(filePath))) {
      throw new Error('Pathspec entries must not contain control characters.');
    }
    return normalized;
  }

  private createPathspecFile(tempPrefix: string, paths: string[]): { tempDir: string; pathspecFile: string } {
    const entries = this.normalizePathspecEntries(paths);
    if (entries.length === 0) {
      throw new Error('At least one path is required.');
    }

    const tempDir = createPrivateTempDir(tempPrefix);
    const pathspecFile = path.join(tempDir, 'paths.nul');
    writePrivateTempFile(pathspecFile, `${entries.join('\0')}\0`);
    return { tempDir, pathspecFile };
  }

  async commitWithMessageAtPath(repoPath: string, input: CommitMessageInput, paths?: string[]): Promise<string> {
    const normalizedPath = (repoPath || '').trim();
    if (!normalizedPath) {
      throw new Error('Repository path is required.');
    }

    const title = String(input.title || '').trim();
    const description = String(input.description || '').trim();
    if (!title) {
      throw new Error('Commit title is required.');
    }

    const message = description ? `${title}\n\n${description}` : title;
    if (message.length > MAX_COMMIT_MESSAGE_FILE_LENGTH) {
      throw new Error('Commit message is too long.');
    }

    const tempDir = createPrivateTempDir('ogc-commit-message-');
    const messageFile = path.join(tempDir, 'message.txt');
    writePrivateTempFile(messageFile, message);
    let pathspecTempDir: string | null = null;

    const args = ['commit'];
    if (input.amend) args.push('--amend');
    if (input.signoff) args.push('--signoff');
    if (input.allowEmpty) args.push('--allow-empty');
    args.push('-F', messageFile);
    if (paths) {
      const pathspec = this.createPathspecFile('ogc-commit-pathspec-', paths);
      pathspecTempDir = pathspec.tempDir;
      args.push(`--pathspec-from-file=${pathspec.pathspecFile}`, '--pathspec-file-nul');
    }

    try {
      return await this.executeGit(normalizedPath, args);
    } finally {
      cleanupPrivateTempDir(tempDir);
      cleanupPrivateTempDir(pathspecTempDir);
    }
  }

  async stagePathsAtPath(repoPath: string, paths: string[]): Promise<string> {
    return this.runPathspecCommand(repoPath, 'ogc-add-pathspec-', 'add', paths);
  }

  async unstagePathsAtPath(repoPath: string, paths: string[]): Promise<string> {
    return this.runPathspecCommand(repoPath, 'ogc-reset-pathspec-', 'reset', paths);
  }

  private async runPathspecCommand(repoPath: string, tempPrefix: string, commandName: 'add' | 'reset', paths: string[]): Promise<string> {
    const normalizedPath = (repoPath || '').trim();
    if (!normalizedPath) {
      throw new Error('Repository path is required.');
    }

    const normalized = this.normalizePathspecEntries(paths);
    if (normalized.length === 0) return '';

    const pathspec = this.createPathspecFile(tempPrefix, normalized);
    try {
      return await this.executeGit(normalizedPath, [commandName, `--pathspec-from-file=${pathspec.pathspecFile}`, '--pathspec-file-nul']);
    } finally {
      cleanupPrivateTempDir(pathspec.tempDir);
    }
  }
}
