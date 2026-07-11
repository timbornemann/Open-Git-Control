import { normalizeRepositoryRelativePath, toLiteralPathspec } from './RepositoryPathSafety';

const COMMIT_HASH_RE = /^[0-9a-f]{7,64}$/i;

const normalizeOptionalCommitHash = (value: string | undefined): string | undefined => {
  const normalized = String(value || '').trim();
  if (!normalized) return undefined;
  if (!COMMIT_HASH_RE.test(normalized)) {
    throw new Error('Invalid commit hash.');
  }
  return normalized;
};

export type CommitStats = { files: number; additions: number; deletions: number };

export type FileTimelineChange = {
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  path: string;
  oldPath?: string;
};

export type FileTimelineCommit = {
  hash: string;
  author: string;
  date: string;
  subject: string;
  changes: FileTimelineChange[];
  /** Files present immediately before this commit. Set on the oldest returned commit. */
  baselineFiles?: string[];
};

export type RunGitCommand = (args: string[]) => Promise<string>;
export type RunGitCommandAtPathWithSignal = (repoPath: string, args: string[], signal: AbortSignal) => Promise<string>;
export type RunGitCommandAtPathWithInput = (repoPath: string, args: string[], input: Buffer) => Promise<string>;
export type ReadGitFileBufferAtPath = (repoPath: string, revisionSpec: string, maxBytes: number) => Promise<Buffer>;

const STAGED_BLAME_MAX_BYTES = 8 * 1024 * 1024;

export class HistoryService {
  constructor(
    private readonly runCommand: RunGitCommand,
    private readonly runCommandAtPathWithSignal: RunGitCommandAtPathWithSignal,
    private readonly runCommandAtPathWithInput?: RunGitCommandAtPathWithInput,
    private readonly readGitFileBufferAtPath?: ReadGitFileBufferAtPath,
  ) {}

  private execute(args: string[], repoPath?: string): Promise<string> {
    return repoPath ? this.runCommandAtPathWithSignal(repoPath, args, new AbortController().signal) : this.runCommand(args);
  }

  private getStructuredLogFormat(): string {
    return '%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%P%x1f%(decorate:prefix=,suffix=,separator=%x1d)%x00';
  }

  private async existsAtRevision(filePath: string, revision: string, repoPath?: string): Promise<boolean> {
    // `git blame <revision> -- <path>` reports a fatal error for a file deleted
    // in that revision (or newly added only in the index). ls-tree instead
    // returns an empty result, so callers can render an empty blame view.
    const output = await this.execute(['ls-tree', '-r', '--name-only', revision, '--', toLiteralPathspec(filePath)], repoPath);
    return output.trim().length > 0;
  }

  async getLog(limit: number = 50, includeAll: boolean = true, offset: number = 0, repoPath?: string): Promise<string> {
    const format = this.getStructuredLogFormat();
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
    const args = ['log', '--topo-order', '-z', '-' + limit, `--skip=${safeOffset}`, '--pretty=format:' + format, '--date=iso'];

    if (includeAll) {
      args.splice(1, 0, '--all');
    }

    return this.execute(args, repoPath);
  }

  async getForensicHistoryByString(search: string, filePath: string, limit: number = 200): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 200;
    const format = this.getStructuredLogFormat();
    return this.runCommand([
      'log',
      '-z',
      `-${safeLimit}`,
      '--date=iso',
      `--pretty=format:${format}`,
      '--numstat',
      '-S',
      search,
      '--',
      toLiteralPathspec(filePath),
    ]);
  }

  async getForensicHistoryByRegex(regex: string, filePath: string, limit: number = 200): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 200;
    const format = this.getStructuredLogFormat();
    return this.runCommand([
      'log',
      '-z',
      `-${safeLimit}`,
      '--date=iso',
      `--pretty=format:${format}`,
      '--numstat',
      '-G',
      regex,
      '--',
      toLiteralPathspec(filePath),
    ]);
  }

  async getForensicHistoryByLineRange(filePath: string, startLine: number, endLine: number, limit: number = 200): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 200;
    return this.runCommand([
      'log',
      `-${safeLimit}`,
      '--date=iso',
      // `git log -L` writes a patch between commit headers. Prefix every header
      // with an explicit record separator so the renderer never interprets a
      // patch plus the following header as one record.
      '--pretty=format:%x1e%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%P%x1f%x00',
      `-L${startLine},${endLine}:${normalizeRepositoryRelativePath(filePath)}`,
    ]);
  }

  async getReflog(limit: number = 300): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 1000)) : 300;
    const format = '%H%x1f%h%x1f%gd%x1f%gs%x1f%cd%x00';
    return this.runCommand(['reflog', '--date=iso', `--max-count=${safeLimit}`, '--pretty=format:' + format]);
  }

  async getCommitDetails(hash: string): Promise<string> {
    const normalizedHash = normalizeOptionalCommitHash(hash);
    if (!normalizedHash) throw new Error('Invalid commit hash.');
    const parentsRaw = await this.runCommand(['show', '-s', '--format=%P', normalizedHash]);
    const firstParent = parentsRaw.trim().split(/\s+/).filter(Boolean)[0];
    // A merge must be compared as two explicit trees. `diff-tree
    // --first-parent <merge>` only controls traversal and can emit no file
    // records at all for the merge commit.
    if (firstParent) {
      return this.runCommand(['diff', '--name-status', '-M', '-z', firstParent, normalizedHash]);
    }
    return this.runCommand(['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-M', '-z', normalizedHash]);
  }

  async getFileHistory(filePath: string, limit: number = 100, commitHash?: string, repoPath?: string): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 100;
    const format = '%H%x1f%h%x1f%an%x1f%ad%x1f%s%x00';
    const args = ['log', '--follow', '-z', `-${safeLimit}`, `--pretty=format:${format}`, '--date=iso'];

    const normalizedHash = normalizeOptionalCommitHash(commitHash);
    if (normalizedHash) {
      args.push(normalizedHash);
    }

    args.push('--', toLiteralPathspec(filePath));
    return this.execute(args, repoPath);
  }

  async getFileBlame(filePath: string, commitHash?: string, repoPath?: string): Promise<string> {
    const args = ['blame', '--line-porcelain'];
    const normalizedHash = normalizeOptionalCommitHash(commitHash);
    const revision = normalizedHash || 'HEAD';
    if (!(await this.existsAtRevision(filePath, revision, repoPath))) return '';
    if (normalizedHash) {
      args.push(normalizedHash);
    }
    args.push('--', normalizeRepositoryRelativePath(filePath));
    return this.execute(args, repoPath);
  }

  async getFileBlameRange(filePath: string, commitHash: string | undefined, startLine: number, lineCount: number, repoPath?: string): Promise<string> {
    const safeStart = Number.isFinite(startLine) ? Math.max(1, Math.floor(startLine)) : 1;
    // The renderer asks for one look-ahead line (501 total) to tell a full
    // page from the end of a file with exactly 500/1000/... lines.
    const safeCount = Number.isFinite(lineCount) ? Math.max(1, Math.min(Math.floor(lineCount), 501)) : 500;
    const endLine = safeStart + safeCount - 1;
    const args = ['blame', '--line-porcelain', `-L${safeStart},${endLine}`];
    const normalizedHash = normalizeOptionalCommitHash(commitHash);
    const revision = normalizedHash || 'HEAD';
    if (!(await this.existsAtRevision(filePath, revision, repoPath))) return '';
    if (normalizedHash) {
      args.push(normalizedHash);
    }
    // blame accepts a pathname after `--`, but does not interpret pathspec
    // magic such as `:(literal)`. Keep the same strict validation without
    // passing the magic prefix through to blame.
    args.push('--', normalizeRepositoryRelativePath(filePath));
    return this.execute(args, repoPath);
  }

  /**
   * Blames the exact index blob rather than the working-tree file. Git's
   * `--contents -` overlays these immutable bytes on HEAD, preserving correct
   * final line numbers while marking newly staged lines as uncommitted.
   */
  async getStagedFileBlame(filePath: string, repoPath: string): Promise<string> {
    return this.getStagedFileBlameInternal(filePath, repoPath);
  }

  async getStagedFileBlameRange(filePath: string, startLine: number, lineCount: number, repoPath: string): Promise<string> {
    const safeStart = Number.isFinite(startLine) ? Math.max(1, Math.floor(startLine)) : 1;
    const safeCount = Number.isFinite(lineCount) ? Math.max(1, Math.min(Math.floor(lineCount), 501)) : 500;
    return this.getStagedFileBlameInternal(filePath, repoPath, safeStart, safeCount);
  }

  private async getStagedFileBlameInternal(filePath: string, repoPath: string, startLine?: number, lineCount?: number): Promise<string> {
    if (!this.runCommandAtPathWithInput || !this.readGitFileBufferAtPath) {
      throw new Error('Staged blame is not available.');
    }

    const normalizedPath = normalizeRepositoryRelativePath(filePath);
    const indexEntry = await this.execute(['ls-files', '--stage', '-z', '--', toLiteralPathspec(normalizedPath)], repoPath);
    if (!indexEntry) return '';

    const stagedContents = await this.readGitFileBufferAtPath(repoPath, `:${normalizedPath}`, STAGED_BLAME_MAX_BYTES);
    const basePath = await this.resolveStagedBlameBasePath(normalizedPath, repoPath);
    let existsInHead = false;
    try {
      existsInHead = await this.existsAtRevision(basePath, 'HEAD', repoPath);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/needed a single revision|does not have any commits yet|unknown revision|ambiguous argument ['"]?HEAD/i.test(message)) throw error;
    }

    if (!existsInHead) {
      return this.buildUncommittedBlame(stagedContents, startLine, lineCount);
    }

    const args = ['blame', '--line-porcelain'];
    if (startLine !== undefined && lineCount !== undefined) {
      args.push(`-L${startLine},${startLine + lineCount - 1}`);
    }
    args.push('--contents', '-', 'HEAD', '--', basePath);
    return this.runCommandAtPathWithInput(repoPath, args, stagedContents);
  }

  private async resolveStagedBlameBasePath(filePath: string, repoPath: string): Promise<string> {
    const raw = await this.execute(['diff', '--cached', '--name-status', '-z', '-M'], repoPath);
    const tokens = raw.split('\x00');
    for (let index = 0; index < tokens.length;) {
      const status = tokens[index++] || '';
      if (status.startsWith('R') || status.startsWith('C')) {
        const oldPath = tokens[index++] || '';
        const newPath = tokens[index++] || '';
        if (newPath === filePath && oldPath) return normalizeRepositoryRelativePath(oldPath);
      } else {
        index += 1;
      }
    }
    return filePath;
  }

  private buildUncommittedBlame(contents: Buffer, startLine?: number, lineCount?: number): string {
    if (contents.includes(0)) return '';
    const text = contents.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const allLines = text.length === 0 ? [] : text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
    const firstLine = startLine ?? 1;
    const lastLineExclusive = lineCount === undefined ? allLines.length : Math.min(allLines.length, firstLine - 1 + lineCount);
    const zeroHash = '0'.repeat(40);
    const records: string[] = [];
    for (let index = firstLine - 1; index < lastLineExclusive; index += 1) {
      const lineNumber = index + 1;
      records.push(`${zeroHash} ${lineNumber} ${lineNumber} 1\nauthor Not Committed Yet\nauthor-time 0\nsummary Not Committed Yet\n\t${allLines[index]}`);
    }
    return records.join('\n');
  }

  async getCommitStatsAtPath(repoPath: string, hash: string, signal: AbortSignal): Promise<CommitStats> {
    const normalizedHash = String(hash || '').trim();
    if (!/^[0-9a-f]{7,64}$/i.test(normalizedHash)) {
      throw new Error('Invalid commit hash.');
    }

    // `-m` forces a per-parent diff and `--first-parent` restricts it to the
    // first parent. Bare `--first-parent` only implies a first-parent diff for
    // merges on Git >= 2.31; on older versions `git show <merge>` emits no file
    // records at all, so the stats would silently read as an empty change set.
    // `-m` is a no-op for non-merge and root commits.
    const raw = await this.runCommandAtPathWithSignal(
      repoPath,
      ['show', '--root', '-m', '--first-parent', '--format=', '--numstat', '-r', '-M', normalizedHash],
      signal,
    );
    const stats: CommitStats = { files: 0, additions: 0, deletions: 0 };

    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
      if (!match) continue;
      stats.files += 1;
      if (match[1] !== '-') stats.additions += Number(match[1]);
      if (match[2] !== '-') stats.deletions += Number(match[2]);
    }
    return stats;
  }

  async getFileTimelineData(limit: number = 2000, repoPath?: string): Promise<FileTimelineCommit[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 5000)) : 2000;
    const recordSeparator = '\x1e';
    const fieldSeparator = '\x1f';
    const format = `%x1e%H%x1f%an%x1f%ad%x1f%s%x00`;
    // A timeline must follow a real sequence of repository states. Flattening
    // every side branch from the commit DAG produces states that never existed.
    const args = ['log', '--first-parent', '--diff-merges=first-parent', `-${safeLimit}`, '-z', '--name-status', `--pretty=format:${format}`, '--date=iso'];
    const output = await this.execute(args, repoPath);
    const commits: FileTimelineCommit[] = [];

    for (const record of output.split(recordSeparator)) {
      const tokens = record.split('\x00').filter((token) => token.length > 0);
      if (tokens.length === 0) continue;

      const [hash = '', author = '', date = '', subject = ''] = tokens[0].replace(/^\r?\n/, '').split(fieldSeparator);
      if (!/^[0-9a-f]{7,64}$/i.test(hash)) continue;

      const currentCommit: FileTimelineCommit = {
        hash,
        author,
        date,
        subject,
        changes: [],
      };

      for (let i = 1; i < tokens.length;) {
        // Git separates the pretty header and name-status records with a line
        // break. Strip that framing only from the status token. Path tokens are
        // NUL-delimited and must remain byte-for-byte intact because leading or
        // trailing whitespace (including a newline) is legal in a filename.
        const statusToken = tokens[i].replace(/^(?:\r?\n)+/, '').trim();
        i += 1;
        if (!statusToken) continue;

        const statusChar = statusToken[0];

        // Both rename (`R###`) and copy (`C###`) statuses are followed by TWO
        // path tokens (source + destination). A copy must consume both, or the
        // destination path is misread as the next status token, producing a
        // phantom entry (e.g. a file named "M") and dropping the real copy.
        if (statusChar === 'R' || statusChar === 'C') {
          const oldPath = tokens[i] || '';
          const newPath = tokens[i + 1] || '';
          i += 2;
          if (newPath) {
            // A rename moves a file; a copy leaves the source and creates a new
            // file, so record the copy's destination as an added file.
            currentCommit.changes.push(statusChar === 'R' ? { status: 'renamed', path: newPath, oldPath } : { status: 'added', path: newPath });
          }
          continue;
        }

        let status: FileTimelineChange['status'] = 'modified';
        if (statusChar === 'A') status = 'added';
        else if (statusChar === 'D') status = 'deleted';

        const path = tokens[i] || '';
        i += 1;
        if (path) {
          currentCommit.changes.push({ status, path });
        }
      }

      commits.push(currentCommit);
    }

    const oldestCommit = commits.at(-1);
    if (oldestCommit) {
      // A limited history window cannot be reconstructed from an empty tree.
      // Seed it with the complete tree immediately before the oldest entry.
      // Root commits have no parent and correctly use an empty baseline.
      const parentsOutput = (await this.execute(['show', '-s', '--format=%P', oldestCommit.hash], repoPath)).trim();
      if (parentsOutput) {
        const parentHash = parentsOutput.split(/\s+/)[0];
        if (!COMMIT_HASH_RE.test(parentHash)) {
          throw new Error('Oldest timeline commit has no valid first parent.');
        }
        const baseline = await this.execute(['ls-tree', '-r', '--name-only', '-z', parentHash], repoPath);
        oldestCommit.baselineFiles = baseline.split('\x00').filter((filePath) => filePath.length > 0);
      }
    }

    return commits;
  }
}
