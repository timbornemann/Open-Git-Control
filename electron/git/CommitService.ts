import * as path from 'path';
import { cleanupPrivateTempDir, createPrivateTempDir, writePrivateTempFile } from './PrivateTempFiles';
import { toLiteralPathspec } from './RepositoryPathSafety';

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
    return [
      ...new Set(
        paths
          // Preserve leading/trailing whitespace: it is significant in Git
          // filenames. Only drop entries that are entirely empty/nullish.
          .map((filePath) => (typeof filePath === 'string' ? filePath : filePath == null ? '' : String(filePath)))
          .filter((filePath) => filePath.length > 0)
          .map((filePath) => toLiteralPathspec(filePath)),
      ),
    ];
  }

  private createPathspecFile(tempPrefix: string, entries: string[]): { tempDir: string; pathspecFile: string } {
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
      const pathspec = this.createPathspecFile('ogc-commit-pathspec-', this.normalizePathspecEntries(paths));
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

    // The status snapshot the caller staged this batch from can go stale by
    // the time this command runs: a build tool or editor may have created and
    // already removed an untracked file (e.g. a transient *_wpftmp.csproj). A
    // single non-matching pathspec entry makes `git add`/`reset` abort the
    // whole batch, so retry without it instead of losing every other file in
    // the same click.
    let remaining = this.normalizePathspecEntries(paths);

    while (remaining.length > 0) {
      const pathspec = this.createPathspecFile(tempPrefix, remaining);
      try {
        return await this.executeGit(normalizedPath, [commandName, `--pathspec-from-file=${pathspec.pathspecFile}`, '--pathspec-file-nul']);
      } catch (error: unknown) {
        const vanishedEntry = this.findVanishedPathspecEntry(error, remaining);
        if (!vanishedEntry) throw error;
        remaining = remaining.filter((entry) => entry !== vanishedEntry);
      } finally {
        cleanupPrivateTempDir(pathspec.tempDir);
      }
    }
    return '';
  }

  /**
   * Detects Git's "pathspec did not match any files" failure for one of the
   * entries currently being submitted, so the caller can drop exactly that
   * entry and retry. Matches full known entries rather than parsing the
   * quoted text out of the error, since a filename could itself contain a
   * quote character.
   */
  private findVanishedPathspecEntry(error: unknown, candidates: string[]): string | null {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (!/did not match any files/i.test(message)) return null;
    return candidates.find((entry) => message.includes(`pathspec '${entry}' did not match any files`)) ?? null;
  }
}
