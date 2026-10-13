import * as fs from 'node:fs';
import * as path from 'node:path';
import { indexFileHash, syncIndexFile } from '../git/IndexFileIO';
import { readRepositoryFileBytes } from '../git/RepositoryFileRead';
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

/** Stored beside the worktree's index; no renderer-supplied paths are trusted. */
export class AutoCommitJournal {
  private readonly journalPath: string;
  constructor(private readonly indexPath: string) {
    this.journalPath = path.join(path.dirname(indexPath), 'ogc-ai-autocommit.json');
  }
  async prepare(value: Pick<Journal, 'head' | 'ref' | 'tree' | 'action'>): Promise<void> {
    await syncIndexFile(`${this.indexPath}.lock`);
    const originalIndexHash = await indexFileHash(this.indexPath);
    const preparedIndexHash = await indexFileHash(`${this.indexPath}.lock`);
    if (!preparedIndexHash) throw new Error('The prepared Git index is missing.');
    const record: Journal = { ...value, version: 1, originalIndexHash, preparedIndexHash };
    const handle = await fs.promises.open(this.journalPath, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(record));
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  async clear(): Promise<void> {
    await fs.promises.rm(this.journalPath, { force: true });
  }

  async recover(run: AutoCommitGitRead): Promise<boolean> {
    const blocked = () => new Error(`An interrupted AI commit needs inspection. HEAD/index differ from ${this.journalPath}; no files or refs were changed.`);
    let record: Journal;
    try {
      record = JSON.parse((await readRepositoryFileBytes(this.journalPath, 64 * 1024)).data.toString('utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
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
    const lockHash = await indexFileHash(lock);
    const ownsLock = lockHash === record.preparedIndexHash;
    if (head === record.head) {
      if ((await indexFileHash(this.indexPath)) !== record.originalIndexHash || (lockHash !== null && !ownsLock)) throw blocked();
      if (ownsLock) await fs.promises.rm(lock);
      await this.clear();
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
    if (ownsLock && (await indexFileHash(this.indexPath)) === record.originalIndexHash) await fs.promises.rename(lock, this.indexPath);
    else if ((await indexFileHash(lock)) !== null || (await indexFileHash(this.indexPath)) !== record.preparedIndexHash) throw blocked();
    await this.clear();
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
