import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PlannerWorkBase, PlannerWorktree } from '../../src/types/plannerWork';
import type { PlannerItem } from '../../src/types/projectPlanner';
import { workDigest } from './PlannerWorkStore';

export type WorkGit = { run(repo: string, args: string[]): Promise<string> };
export const WORK_OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
export async function workSha(git: WorkGit, repo: string, ref: string) {
  if (!ref || ref.startsWith('-') || /[\0\r\n]/.test(ref)) throw new Error('Invalid Git reference.');
  try {
    const sha = (await git.run(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])).trim();
    return WORK_OID.test(sha) ? sha : '';
  } catch {
    return '';
  }
}
export async function workAncestor(git: WorkGit, repo: string, ancestor: string, tip: string) {
  try {
    await git.run(repo, ['merge-base', '--is-ancestor', ancestor, tip]);
    return true;
  } catch {
    return false;
  }
}
export function suggestWorkBranch(item: PlannerItem) {
  const slug =
    item.title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'work';
  return `task/${workDigest(item.id).slice(0, 8)}-${slug}`.slice(0, 80).replace(/-+$/, '');
}
export async function workState(git: WorkGit, repo: string) {
  const [head, status, diff, staged, tree] = await Promise.all([
    workSha(git, repo, 'HEAD'),
    git.run(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    git.run(repo, ['diff', '--binary', '--no-ext-diff', '--no-textconv']),
    git.run(repo, ['diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv']),
    git.run(repo, ['worktree', 'list', '--porcelain', '-z']),
  ]);
  const changes: string[] = [];
  const tokens = status.split('\0');
  for (let index = 0; index < tokens.length; index++) {
    const row = tokens[index];
    if (!row) continue;
    changes.push(row.slice(3));
    if (/^[RC]|^.[RC]/.test(row)) index++;
  }
  const identities = changes.map((relative) => {
    const file = path.resolve(repo, relative);
    if (!file.startsWith(path.resolve(repo) + path.sep)) throw new Error('Unsafe working-tree path.');
    try {
      const parent = fs.realpathSync(path.dirname(file));
      const root = fs.realpathSync(repo);
      const inside = path.relative(root, parent);
      if (inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) throw new Error('Unsafe working-tree path.');
      const stat = fs.lstatSync(file);
      return [
        relative,
        stat.size,
        stat.mtimeMs,
        stat.isSymbolicLink()
          ? fs.readlinkSync(file)
          : stat.isFile() && stat.size <= 1024 ** 2
            ? workDigest(fs.readFileSync(file).toString('base64'))
            : stat.ctimeMs,
      ];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [relative, 'removed'];
      throw error;
    }
  });
  const worktrees: PlannerWorktree[] = [];
  let directory = '';
  for (const token of tree.split('\0')) {
    if (token.startsWith('worktree ')) directory = token.slice(9);
    if (token.startsWith('branch refs/heads/')) worktrees.push({ branch: token.slice(18), path: directory });
  }
  return { head, changes, worktrees, digest: workDigest([head, status, diff, staged, identities, tree]) };
}
export const WORK_OPERATION_MARKERS = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer', 'BISECT_LOG'];
export async function assertWorkIdle(git: WorkGit, repo: string) {
  for (const name of WORK_OPERATION_MARKERS) {
    const file = (await git.run(repo, ['rev-parse', '--git-path', name])).trim();
    if (fs.existsSync(path.resolve(repo, file))) throw new Error('Finish the active Git operation before starting task work.');
  }
}
export async function workBases(git: WorkGit, repo: string): Promise<{ bases: PlannerWorkBase[]; defaultBase: string }> {
  const rows = (await git.run(repo, ['for-each-ref', '--format=%(refname)%09%(objectname)', 'refs/heads', 'refs/remotes'])).trim().split('\n').filter(Boolean);
  const bases = rows
    .map((row) => {
      const [ref, sha] = row.split('\t');
      return { ref, sha };
    })
    .filter((entry) => WORK_OID.test(entry.sha) && !entry.ref.endsWith('/HEAD'));
  const defaults: string[] = [];
  for (const remote of (await git.run(repo, ['remote'])).trim().split('\n').filter(Boolean)) {
    try {
      defaults.push((await git.run(repo, ['symbolic-ref', `refs/remotes/${remote}/HEAD`])).trim());
    } catch {
      /* Offline repositories may not advertise a default. */
    }
  }
  const known = [...new Set(defaults)];
  let defaultBase = known.length === 1 ? known[0] : '';
  if (!defaultBase && !known.length) {
    const names = ['main', 'master'].map((name) => `refs/heads/${name}`).filter((ref) => bases.some((entry) => entry.ref === ref));
    if (names.length === 1) defaultBase = names[0];
  }
  if (defaultBase.startsWith('refs/remotes/')) {
    const local = bases.find((entry) => entry.ref === `refs/heads/${defaultBase.split('/').slice(3).join('/')}`);
    const remote = bases.find((entry) => entry.ref === defaultBase);
    if (local && remote) {
      if (await workAncestor(git, repo, remote.sha, local.sha)) defaultBase = local.ref;
      else if (!(await workAncestor(git, repo, local.sha, remote.sha))) defaultBase = '';
    }
  }
  return { bases, defaultBase };
}
