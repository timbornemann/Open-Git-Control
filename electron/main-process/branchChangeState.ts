import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { workSha, type WorkGit } from './plannerWorkInspection';
import { workDigest } from './PlannerWorkStore';
import { physicalPathKey } from '../git/RepositoryCommonDirectory';
import type { BranchChangeFile, BranchChangeProgress } from '../../src/shared/ipc/branchChange';

export type BranchChangeReporter = (message: string, progress?: BranchChangeProgress) => void;

export async function branchFileDigest(repo: string, relative: string, format = 'sha1') {
  const root = fs.realpathSync(repo);
  const file = path.resolve(root, relative);
  const inside = path.relative(root, file);
  if (!inside || inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) throw new Error('Unsafe working-tree path.');
  let parent = path.dirname(file);
  while (parent !== root) {
    if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) throw new Error('Redirected working-tree path.');
    parent = path.dirname(parent);
  }
  try {
    const stat = await fs.promises.lstat(file);
    if (stat.isSymbolicLink()) {
      const target = Buffer.from(await fs.promises.readlink(file));
      return {
        digest: createHash('sha256').update(target).digest('hex'),
        blob: createHash(format).update(`blob ${target.length}\0`).update(target).digest('hex'),
        link: true,
        binary: false,
      };
    }
    if (!stat.isFile()) return { digest: `directory:${stat.mtimeMs}`, binary: false };
    const hash = createHash('sha256');
    const blob = createHash(format).update(`blob ${stat.size}\0`);
    let binary = false;
    const handle = await fs.promises.open(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
      const opened = await handle.stat();
      if (
        opened.ino !== stat.ino ||
        opened.dev !== stat.dev ||
        !opened.isFile() ||
        physicalPathKey(fs.realpathSync(path.dirname(file))) !== physicalPathKey(path.dirname(file))
      )
        throw new Error('The file path changed during inspection.');
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        hash.update(chunk);
        blob.update(chunk);
        if ((chunk as Buffer).includes(0)) binary = true;
      }
    } finally {
      await handle.close();
    }
    return { digest: hash.digest('hex'), blob: blob.digest('hex'), binary };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { digest: 'removed', binary: false };
    throw error;
  }
}
export function branchChangeFiles(status: string): BranchChangeFile[] {
  const rows = status.split('\0');
  const files: BranchChangeFile[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const entry: BranchChangeFile = { path: row.slice(3), index: row[0], worktree: row[1], binary: false };
    if (/^[RC]|^.[RC]/.test(row)) entry.previousPath = rows[++i];
    files.push(entry);
  }
  return files;
}
export const changeDiffOptions = ['--binary', '--no-ext-diff', '--no-textconv', '--no-renames'];
export async function readBranchChangeState(git: WorkGit, repo: string, progress?: BranchChangeReporter) {
  progress?.('Reading repository and worktrees', { phase: 'repository' });
  const head = await workSha(git, repo, 'HEAD');
  const branch = (await git.run(repo, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => '')).trim();
  const status = await git.run(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const worktrees = await git.run(repo, ['worktree', 'list', '--porcelain', '-z']);
  const gitDir = path.resolve(repo, (await git.run(repo, ['rev-parse', '--absolute-git-dir'])).trim());
  const files = branchChangeFiles(status);
  const format = (await git.run(repo, ['rev-parse', '--show-object-format'])).trim();
  const identities = [];
  let lastUpdate = 0;
  for (const file of files) {
    if (!identities.length || Date.now() - lastUpdate >= 150) {
      progress?.('Checking changed file contents', { phase: 'files', processedFiles: identities.length, totalFiles: files.length, path: file.path });
      lastUpdate = Date.now();
    }
    const identity = await branchFileDigest(repo, file.path, format);
    file.binary = identity.binary;
    const blob = file.index === '?' ? await branchFileOid(git, repo, file.path, identity) : 'blob' in identity ? identity.blob : '';
    identities.push([file.path, identity.digest, blob]);
  }
  progress?.('Checking changed file contents', { phase: 'files', processedFiles: files.length, totalFiles: files.length });
  if (files.some((file) => file.index === 'D' || file.worktree === 'D')) {
    for (const options of [[], ['--cached']]) {
      const rows = (await git.run(repo, ['diff', ...options, '--numstat', '--no-renames', '--no-ext-diff', '--no-textconv', '-z'])).split('\0');
      for (const file of files) file.binary ||= rows.includes(`-\t-\t${file.path}`);
    }
  }
  progress?.('Checking index and working changes', { phase: 'safety' });
  const index = await git.run(repo, ['ls-files', '--stage', '-z']);
  const workPatch = head ? await git.run(repo, ['diff', ...changeDiffOptions, head]) : '';
  const indexPatch = head ? await git.run(repo, ['diff', '--cached', ...changeDiffOptions, head]) : '';
  const state = { head, branch, files, worktrees, gitDir, identities, workPatch: workDigest(workPatch), indexPatch: workDigest(indexPatch) };
  return { ...state, digest: workDigest([head, branch, status, index, identities, worktrees, state.workPatch, state.indexPatch]) };
}
export type BranchChangeState = Awaited<ReturnType<typeof readBranchChangeState>>;
export async function branchFileOid(git: WorkGit, repo: string, relative: string, identity: Awaited<ReturnType<typeof branchFileDigest>>) {
  if (!('blob' in identity)) return '';
  if ('link' in identity) return identity.blob;
  return (await git.run(repo, ['hash-object', `--path=${relative}`, '--', relative])).trim();
}
