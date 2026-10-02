import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CommitMessageEditBlock } from '../../src/shared/ipc/commitMessageEdit';
import type { CommitEditGit } from './CommitEditGit';

export const OBJECT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
export const BACKUP_PREFIX = 'refs/ogc/commit-reword/';
export const CHECK_PREFIX = 'refs/ogc/reword-check/';

export class CommitEditBlockedError extends Error {
  constructor(
    public readonly reason: CommitMessageEditBlock,
    detail = '',
  ) {
    super(`Commit message edit blocked (${reason})${detail ? `: ${detail}` : '.'}`);
  }
}

export type CommitRecord = { hash: string; tree: string; parents: string[]; author: string; message: string; signed: boolean };
export type EditSnapshot = {
  head: string;
  branch: string;
  commits: CommitRecord[];
  refs: string;
  remoteConfig: string;
  gitDir: string;
  commonDir: string;
};

export const samePath = (a: string, b: string) => {
  const resolve = (p: string) => {
    const result = fs.realpathSync.native(p);
    return process.platform === 'win32' ? result.toLowerCase() : result;
  };
  return resolve(a) === resolve(b);
};

export async function readCommit(git: CommitEditGit, repo: string, hash: string): Promise<CommitRecord> {
  if (!OBJECT_ID.test(hash)) throw new Error('Invalid full commit hash.');
  const bytes = await git.buffer(repo, ['cat-file', 'commit', hash]);
  const raw = bytes.toString('utf8');
  if (!Buffer.from(raw, 'utf8').equals(bytes)) throw new CommitEditBlockedError('incomplete', 'Non-UTF-8 commit messages are not supported.');
  const separator = raw.indexOf('\n\n');
  if (separator < 0) throw new CommitEditBlockedError('incomplete');
  const headers = raw.slice(0, separator).split('\n');
  const tree = headers.find((line) => line.startsWith('tree '))?.slice(5) || '';
  const author = headers.find((line) => line.startsWith('author ')) || '';
  const parents = headers.filter((line) => line.startsWith('parent ')).map((line) => line.slice(7));
  if (!OBJECT_ID.test(tree) || !author || parents.some((parent) => !OBJECT_ID.test(parent))) throw new CommitEditBlockedError('incomplete');
  return { hash, tree, author, parents, message: raw.slice(separator + 2), signed: headers.some((line) => /^gpgsig(?:-sha256)? /.test(line)) };
}

export function splitMessage(message: string) {
  const normalized = message.replace(/\r\n/g, '\n').replace(/\n$/, '');
  const separator = normalized.indexOf('\n');
  return separator < 0
    ? { title: normalized, description: '' }
    : { title: normalized.slice(0, separator), description: normalized.slice(separator + 1).replace(/^\n/, '') };
}

export async function remoteConfig(git: CommitEditGit, repo: string): Promise<string> {
  // Read the complete effective config so URL rewrites and per-worktree config
  // changes are part of the race guard as well.
  return git.run(repo, ['config', '--null', '--list']);
}

export async function refsFingerprint(git: CommitEditGit, repo: string): Promise<string> {
  const refs = await git.run(repo, ['for-each-ref', '--format=%(refname) %(objectname) %(symref)']);
  return refs
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => !line.startsWith(CHECK_PREFIX) && !line.startsWith(BACKUP_PREFIX))
    .sort()
    .join('\n');
}

export async function assertUnreferenced(git: CommitEditGit, repo: string, hash: string, branch: string, ignoredWorktree?: string) {
  const containing = await git.run(repo, ['for-each-ref', `--contains=${hash}`, '--format=%(refname)']);
  for (const ref of containing.split('\n').filter(Boolean)) {
    if (ref === branch || ref.startsWith(BACKUP_PREFIX) || ref.startsWith(CHECK_PREFIX)) continue;
    if (ref.startsWith('refs/remotes/') || ref.startsWith('refs/ogc/remote-tags/')) throw new CommitEditBlockedError('published', ref);
    throw new CommitEditBlockedError('referenced', ref);
  }
  const stashRef = await git.run(repo, ['for-each-ref', '--format=%(refname)', 'refs/stash']);
  if (stashRef) {
    const stashes = (await git.run(repo, ['reflog', 'show', '--format=%H', 'refs/stash'])).split('\n').filter(Boolean);
    for (const stash of stashes) {
      if (!(await git.run(repo, ['rev-list', '-1', `${hash}^!`, '--not', stash]))) throw new CommitEditBlockedError('referenced', 'refs/stash');
    }
  }
  const worktrees = await git.run(repo, ['worktree', 'list', '--porcelain', '-z']);
  for (const record of worktrees.split('\0\0')) {
    const fields = record.split('\0');
    const worktree = fields.find((line) => line.startsWith('worktree '))?.slice(9);
    const head = fields.find((line) => line.startsWith('HEAD '))?.slice(5);
    if (!worktree || !head || !OBJECT_ID.test(head)) continue;
    if (samePath(worktree, repo) || (ignoredWorktree && samePath(worktree, ignoredWorktree))) continue;
    const reachable = await git.run(repo, ['rev-list', '-1', `${hash}^!`, '--not', head]);
    if (!reachable) throw new CommitEditBlockedError('worktree', worktree);
  }
}

export async function inspectSnapshot(git: CommitEditGit, repo: string, hash: string, ignoredWorktree?: string): Promise<EditSnapshot> {
  if ((await git.run(repo, ['rev-parse', '--is-bare-repository'])) === 'true') throw new CommitEditBlockedError('bare');
  if ((await git.run(repo, ['rev-parse', '--is-shallow-repository'])) === 'true') throw new CommitEditBlockedError('shallow');
  if ((await git.run(repo, ['rev-parse', '--show-ref-format'])) !== 'files')
    throw new CommitEditBlockedError('incomplete', 'Commit message editing currently requires the Git files ref backend.');
  const gitDir = path.resolve(repo, await git.run(repo, ['rev-parse', '--git-dir']));
  const commonDir = path.resolve(repo, await git.run(repo, ['rev-parse', '--git-common-dir']));
  if (
    ['rebase-merge', 'rebase-apply', 'sequencer', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'BISECT_LOG'].some((entry) =>
      fs.existsSync(path.join(gitDir, entry)),
    )
  ) {
    throw new CommitEditBlockedError('operation');
  }
  if (fs.existsSync(path.join(commonDir, 'info', 'grafts')) || (await git.run(repo, ['for-each-ref', 'refs/replace', '--format=%(refname)']))) {
    throw new CommitEditBlockedError('incomplete', 'Replace refs and grafts are not supported.');
  }
  const branch = await git.run(repo, ['symbolic-ref', '--quiet', 'HEAD']).catch(() => '');
  if (!branch.startsWith('refs/heads/')) throw new CommitEditBlockedError('detached');
  const head = await git.run(repo, ['rev-parse', '--verify', 'HEAD']);
  const status = await git.run(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none']);
  if (status) throw new CommitEditBlockedError('dirty');
  const absent = await git.run(repo, ['rev-list', '-1', `${hash}^!`, '--not', head]);
  if (absent) throw new CommitEditBlockedError('not-on-branch');
  const hashes = [hash, ...(await git.run(repo, ['rev-list', '--reverse', '--topo-order', `${hash}..${head}`])).split('\n').filter(Boolean)];
  const commits: CommitRecord[] = [];
  for (const current of hashes) {
    const record = await readCommit(git, repo, current);
    if (record.parents.length > 1 || (commits.length && record.parents[0] !== commits.at(-1)!.hash)) throw new CommitEditBlockedError('merge');
    commits.push(record);
  }
  if (commits.at(-1)?.hash !== head) throw new CommitEditBlockedError('not-on-branch');
  await assertUnreferenced(git, repo, hash, branch, ignoredWorktree);
  return { head, branch, commits, refs: await refsFingerprint(git, repo), remoteConfig: await remoteConfig(git, repo), gitDir, commonDir };
}
