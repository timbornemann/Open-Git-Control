import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { AutoCommitGitRead } from './AutoCommitSnapshot';
import type { GitService } from '../GitService';

type Journal = {
  version: 1;
  head: string | null;
  ref: string | null;
  tree: string;
  action: string;
  originalIndexHash: string | null;
  preparedIndexHash: string;
};
const fileHash = (file: string): string | null => (fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null);

/** Stored beside the worktree's index; no renderer-supplied paths are trusted. */
export class AutoCommitJournal {
  private readonly journalPath: string;
  constructor(private readonly indexPath: string) {
    this.journalPath = path.join(path.dirname(indexPath), 'ogc-ai-autocommit.json');
  }
  prepare(value: Pick<Journal, 'head' | 'ref' | 'tree' | 'action'>): void {
    const indexFd = fs.openSync(`${this.indexPath}.lock`, 'r+');
    try {
      fs.fsyncSync(indexFd);
    } finally {
      fs.closeSync(indexFd);
    }
    const record: Journal = { ...value, version: 1, originalIndexHash: fileHash(this.indexPath), preparedIndexHash: fileHash(`${this.indexPath}.lock`)! };
    const fd = fs.openSync(this.journalPath, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(record));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
  clear(): void {
    fs.rmSync(this.journalPath, { force: true });
  }

  async recover(run: AutoCommitGitRead): Promise<boolean> {
    if (!fs.existsSync(this.journalPath)) return false;
    const blocked = () => new Error(`An interrupted AI commit needs inspection. HEAD/index differ from ${this.journalPath}; no files or refs were changed.`);
    let record: Journal;
    try {
      record = JSON.parse(fs.readFileSync(this.journalPath, 'utf8'));
    } catch {
      throw blocked();
    }
    if (
      !record ||
      record.version !== 1 ||
      !(record.head === null || (typeof record.head === 'string' && /^[0-9a-f]{40,64}$/.test(record.head))) ||
      !(record.ref === null || (typeof record.ref === 'string' && record.ref.startsWith('refs/heads/'))) ||
      !/^[0-9a-f]{40,64}$/.test(record.tree) ||
      !/^open-git-control-ai-/.test(record.action) ||
      !/^[0-9a-f]{64}$/.test(record.preparedIndexHash)
    )
      throw blocked();
    const read = (args: string[]) =>
      run(args).then(
        (value) => value.trim(),
        () => null,
      );
    const head = await read(['rev-parse', '--verify', 'HEAD']);
    const ref = await read(['symbolic-ref', '-q', 'HEAD']);
    if (ref !== record.ref) throw blocked();
    const lock = `${this.indexPath}.lock`;
    const ownsLock = fileHash(lock) === record.preparedIndexHash;
    if (head === record.head) {
      if (fileHash(this.indexPath) !== record.originalIndexHash || (fs.existsSync(lock) && !ownsLock)) throw blocked();
      if (ownsLock) fs.rmSync(lock);
      this.clear();
      return true;
    }
    if (!head) throw blocked();
    const parents = (await run(['rev-list', '--parents', '-n', '1', head])).trim().split(/\s+/).slice(1);
    const tree = await read(['rev-parse', `${head}^{tree}`]);
    const action = await read(['reflog', 'show', '-1', '--format=%gs', record.ref || 'HEAD']);
    if (
      tree !== record.tree ||
      parents.length !== (record.head ? 1 : 0) ||
      (parents[0] || null) !== record.head ||
      !(action === record.action || action?.startsWith(`${record.action}:`))
    )
      throw blocked();
    if (ownsLock && fileHash(this.indexPath) === record.originalIndexHash) fs.renameSync(lock, this.indexPath);
    else if (fs.existsSync(lock) || fileHash(this.indexPath) !== record.preparedIndexHash) throw blocked();
    this.clear();
    return true;
  }
}

export async function recoverAutoCommitAtPath(git: GitService, repoPath: string): Promise<boolean> {
  if (!git.runner?.withExclusiveWrite) return false;
  return git.runner.withExclusiveWrite(repoPath, 'recover AI commit index', async (read) => {
    const run = (args: string[]) => read.run(repoPath, args);
    const index = (await run(['rev-parse', '--path-format=absolute', '--git-path', 'index'])).replace(/\r?\n$/, '');
    return new AutoCommitJournal(index).recover(run);
  });
}
