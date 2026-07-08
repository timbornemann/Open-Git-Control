import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

  private createPrivateTempDir(prefix: string): string {
    const safePrefix = String(prefix || 'ogc-temp-').replace(/[^a-z0-9_-]/gi, '-') || 'ogc-temp-';
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), safePrefix.endsWith('-') ? safePrefix : `${safePrefix}-`));
    try {
      fs.chmodSync(tempDir, 0o700);
    } catch {
      // Some platforms ignore chmod for temp directories.
    }
    return tempDir;
  }

  private writePrivateTempFile(filePath: string, content: string): void {
    fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // Some platforms ignore chmod for temp files.
    }
  }

  private cleanupPrivateTempDir(tempDir: string | null): void {
    if (!tempDir) return;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup: the directory is private and will be retried by the OS temp cleaner.
    }
  }

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

    const tempDir = this.createPrivateTempDir(tempPrefix);
    const pathspecFile = path.join(tempDir, 'paths.nul');
    this.writePrivateTempFile(pathspecFile, `${entries.join('\0')}\0`);
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

    const tempDir = this.createPrivateTempDir('ogc-commit-message-');
    const messageFile = path.join(tempDir, 'message.txt');
    this.writePrivateTempFile(messageFile, message);
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
      this.cleanupPrivateTempDir(tempDir);
      this.cleanupPrivateTempDir(pathspecTempDir);
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
      this.cleanupPrivateTempDir(pathspec.tempDir);
    }
  }
}
