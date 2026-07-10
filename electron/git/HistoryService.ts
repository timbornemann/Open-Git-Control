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
};

export type RunGitCommand = (args: string[]) => Promise<string>;
export type RunGitCommandAtPathWithSignal = (repoPath: string, args: string[], signal: AbortSignal) => Promise<string>;

export class HistoryService {
  constructor(
    private readonly runCommand: RunGitCommand,
    private readonly runCommandAtPathWithSignal: RunGitCommandAtPathWithSignal,
  ) {}

  private getStructuredLogFormat(): string {
    return '%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%P%x1f%(decorate:prefix=,suffix=,separator=%x1d)%x00';
  }

  async getLog(limit: number = 50, includeAll: boolean = true, offset: number = 0): Promise<string> {
    const format = this.getStructuredLogFormat();
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
    const args = ['log', '--topo-order', '-z', '-' + limit, `--skip=${safeOffset}`, '--pretty=format:' + format, '--date=iso'];

    if (includeAll) {
      args.splice(1, 0, '--all');
    }

    return this.runCommand(args);
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
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%P%x1f%x00',
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
    return this.runCommand(['show', '--name-status', '--format=', normalizedHash]);
  }

  async getFileHistory(filePath: string, limit: number = 100, commitHash?: string): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 100;
    const format = '%H%x1f%h%x1f%an%x1f%ad%x1f%s%x00';
    const args = ['log', '--follow', '-z', `-${safeLimit}`, `--pretty=format:${format}`, '--date=iso'];

    const normalizedHash = normalizeOptionalCommitHash(commitHash);
    if (normalizedHash) {
      args.push(normalizedHash);
    }

    args.push('--', toLiteralPathspec(filePath));
    return this.runCommand(args);
  }

  async getFileBlame(filePath: string, commitHash?: string): Promise<string> {
    const args = ['blame', '--line-porcelain'];
    const normalizedHash = normalizeOptionalCommitHash(commitHash);
    if (normalizedHash) {
      args.push(normalizedHash);
    }
    args.push('--', toLiteralPathspec(filePath));
    return this.runCommand(args);
  }

  async getFileBlameRange(filePath: string, commitHash: string | undefined, startLine: number, lineCount: number): Promise<string> {
    const safeStart = Number.isFinite(startLine) ? Math.max(1, Math.floor(startLine)) : 1;
    const safeCount = Number.isFinite(lineCount) ? Math.max(1, Math.min(Math.floor(lineCount), 500)) : 500;
    const endLine = safeStart + safeCount - 1;
    const args = ['blame', '--line-porcelain', `-L${safeStart},${endLine}`];
    const normalizedHash = normalizeOptionalCommitHash(commitHash);
    if (normalizedHash) {
      args.push(normalizedHash);
    }
    args.push('--', toLiteralPathspec(filePath));
    return this.runCommand(args);
  }

  async getCommitStatsAtPath(repoPath: string, hash: string, signal: AbortSignal): Promise<CommitStats> {
    const normalizedHash = String(hash || '').trim();
    if (!/^[0-9a-f]{7,64}$/i.test(normalizedHash)) {
      throw new Error('Invalid commit hash.');
    }

    const raw = await this.runCommandAtPathWithSignal(
      repoPath,
      ['show', '--root', '--first-parent', '--format=', '--numstat', '-r', '-M', normalizedHash],
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

  async getFileTimelineData(limit: number = 2000): Promise<FileTimelineCommit[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 5000)) : 2000;
    const recordSeparator = '\x1e';
    const fieldSeparator = '\x1f';
    const format = `%x1e%H%x1f%an%x1f%ad%x1f%s%x00`;
    const args = ['log', `-${safeLimit}`, '-z', '--name-status', `--pretty=format:${format}`, '--date=iso'];
    const output = await this.runCommand(args);
    const commits: FileTimelineCommit[] = [];

    for (const record of output.split(recordSeparator)) {
      const tokens = record
        .split('\x00')
        .map((token) => token.replace(/^\r?\n/, ''))
        .filter((token) => token.length > 0);
      if (tokens.length === 0) continue;

      const [hash = '', author = '', date = '', subject = ''] = tokens[0].split(fieldSeparator);
      if (!/^[0-9a-f]{7,40}$/i.test(hash)) continue;

      const currentCommit: FileTimelineCommit = {
        hash,
        author,
        date,
        subject,
        changes: [],
      };

      for (let i = 1; i < tokens.length;) {
        const statusToken = tokens[i].trim();
        i += 1;
        if (!statusToken) continue;

        const statusChar = statusToken[0];
        let status: FileTimelineChange['status'] = 'modified';
        if (statusChar === 'A') status = 'added';
        else if (statusChar === 'D') status = 'deleted';
        else if (statusChar === 'R') status = 'renamed';

        if (status === 'renamed') {
          const oldPath = tokens[i] || '';
          const newPath = tokens[i + 1] || '';
          i += 2;
          if (newPath) {
            currentCommit.changes.push({ status, path: newPath, oldPath });
          }
          continue;
        }

        const path = tokens[i] || '';
        i += 1;
        if (path) {
          currentCommit.changes.push({ status, path });
        }
      }

      commits.push(currentCommit);
    }

    return commits;
  }
}
