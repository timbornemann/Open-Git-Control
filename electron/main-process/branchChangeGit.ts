import { physicalPathKey } from '../git/RepositoryCommonDirectory';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CommitEditGit } from '../git/CommitEditGit';
import type { BranchChangeTarget, BranchChangeFile } from '../../src/shared/ipc/branchChange';
import { WORK_OPERATION_MARKERS, workSha, type WorkGit } from './plannerWorkInspection';
import { branchFileDigest, branchFileOid, changeDiffOptions, type BranchChangeState } from './branchChangeState';
import { workDigest } from './PlannerWorkStore';

export async function inspectChangeTarget(git: WorkGit, repo: string, target: BranchChangeTarget, state: BranchChangeState) {
  if (!target || !['existing', 'create', 'detached'].includes(target.kind)) throw new Error('Invalid checkout target.');
  const ref = target.kind === 'detached' ? target.ref : target.branch;
  if (!ref || ref.startsWith('-') || /[\0\r\n]/.test(ref)) throw new Error('Invalid checkout target.');
  if (target.kind !== 'detached') await git.run(repo, ['check-ref-format', '--branch', target.branch]);
  const existing = target.kind === 'detached' ? '' : await workSha(git, repo, `refs/heads/${target.branch}`);
  if (target.kind === 'create' && existing) throw new Error('The branch name is already in use.');
  const sha = target.kind === 'create' ? await workSha(git, repo, target.startPoint) : target.kind === 'detached' ? await workSha(git, repo, ref) : existing;
  if (!sha) throw new Error('The checkout target is missing. Refresh the branch list.');
  let directory = '';
  let occupied: string | undefined;
  for (const token of state.worktrees.split('\0')) {
    if (token.startsWith('worktree ')) directory = token.slice(9);
    if (target.kind !== 'detached' && token === `branch refs/heads/${target.branch}` && physicalPathKey(directory) !== physicalPathKey(repo))
      occupied = directory;
  }
  return { sha, occupied };
}
export function safeBranchChangeGit(git: CommitEditGit): CommitEditGit {
  return {
    ...git,
    run: (repo, args, options) =>
      git.run(repo, args, { ...options, envOverrides: { ...options?.envOverrides, GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' } }),
  };
}
export async function branchChangeBlocks(git: WorkGit, repo: string, state: BranchChangeState) {
  const blocks: string[] = [];
  if (!state.head) blocks.push('Create the initial commit before parking changes.');
  if (state.identities.some(([, digest]) => typeof digest === 'string' && digest.startsWith('directory:')))
    blocks.push('Handle modified submodules or nested repositories before parking changes.');
  // The verified per-worktree Git directory is already in the snapshot. Avoid
  // starting a separate Git process for every operation marker on each check.
  if (WORK_OPERATION_MARKERS.some((name) => fs.existsSync(path.join(state.gitDir, name)))) {
    blocks.push('Finish the active Git operation first.');
  }
  if (state.files.some((file) => file.index === 'U' || file.worktree === 'U' || ['AA', 'DD'].includes(file.index + file.worktree)))
    blocks.push('Resolve existing conflicts first.');
  const porcelain = await git.run(repo, ['status', '--porcelain=v2', '-z', '--untracked-files=no']);
  if (
    porcelain
      .split('\0')
      .some((row) => (/^[12] /.test(row) && /^S.[^.]/.test(row.split(' ')[2] || '')) || (/^[12] /.test(row) && /^S..[^.]/.test(row.split(' ')[2] || '')))
  )
    blocks.push('Commit or stash changes inside modified submodules first.');
  return blocks;
}
export function changeCheckoutArgs(target: BranchChangeTarget) {
  if (target.kind === 'detached') return ['switch', '--no-overwrite-ignore', '--detach', target.ref];
  if (target.kind === 'existing') return ['switch', '--no-overwrite-ignore', target.branch];
  return ['switch', '--no-overwrite-ignore', ...(target.tracking ? ['--track'] : []), '-c', target.branch, target.startPoint];
}
export async function changeStashes(git: WorkGit, repo: string) {
  const raw = await git.run(repo, ['stash', 'list', '--format=%gd%x00%H%x00%gs%x00']);
  const rows = raw.split('\0');
  const entries: Array<{ ref: string; oid: string; subject: string }> = [];
  for (let i = 0; i + 2 < rows.length; i += 3) entries.push({ ref: rows[i].trim(), oid: rows[i + 1], subject: rows[i + 2] });
  return entries;
}
export async function savedChangeFiles(git: WorkGit, repo: string, oid: string) {
  const parents = { base: await workSha(git, repo, `${oid}^1`), index: await workSha(git, repo, `${oid}^2`), untracked: await workSha(git, repo, `${oid}^3`) };
  const files = new Map<string, BranchChangeFile>();
  for (const [column, from, to] of [
    ['index', parents.base, parents.index],
    ['worktree', parents.index, oid],
  ] as const) {
    const rows = (await git.run(repo, ['diff', '--name-status', '--no-renames', '-z', from, to])).split('\0');
    const binary = (await git.run(repo, ['diff', '--numstat', '--no-renames', '-z', from, to])).split('\0');
    for (let i = 0; i + 1 < rows.length; i += 2) {
      const file = files.get(rows[i + 1]) || { path: rows[i + 1], index: ' ', worktree: ' ', binary: false };
      file[column] = rows[i];
      file.binary ||= binary.includes(`-\t-\t${file.path}`);
      files.set(file.path, file);
    }
  }
  if (parents.untracked) {
    const binary = (
      await git.run(repo, ['diff-tree', '--root', '--no-commit-id', '-r', '--numstat', '--no-ext-diff', '--no-textconv', '-z', parents.untracked])
    ).split('\0');
    for (const file of (await git.run(repo, ['ls-tree', '-r', '--name-only', '-z', parents.untracked])).split('\0').filter(Boolean))
      files.set(file, { path: file, index: '?', worktree: '?', binary: binary.includes(`-\t-\t${file}`) });
  }
  return { files: [...files.values()], parents };
}
export async function verifyChangeStash(git: CommitEditGit, repo: string, oid: string, state: BranchChangeState) {
  if ((await workSha(git, repo, `${oid}^1`)) !== state.head) throw new Error('The stash base changed during creation.');
  const work = await git.run(repo, ['diff', ...changeDiffOptions, `${oid}^1`, oid]);
  const index = await git.run(repo, ['diff', ...changeDiffOptions, `${oid}^1`, `${oid}^2`]);
  if (workDigest(work) !== state.workPatch || workDigest(index) !== state.indexPatch) throw new Error('The saved changes differ from the reviewed state.');
  const untracked = state.files.filter((file) => file.index === '?');
  const extra = await workSha(git, repo, `${oid}^3`);
  const paths = extra ? (await git.run(repo, ['ls-tree', '-r', '--name-only', '-z', extra])).split('\0').filter(Boolean).sort() : [];
  if (workDigest(paths) !== workDigest(untracked.map((file) => file.path).sort())) throw new Error('The saved new files differ from the reviewed state.');
  const saved = extra ? (await git.run(repo, ['ls-tree', '-r', '-z', extra])).split('\0').filter(Boolean) : [];
  for (const file of untracked) {
    const oid = saved
      .find((row) => row.slice(row.indexOf('\t') + 1) === file.path)
      ?.split('\t')[0]
      .split(' ')[2];
    if (oid !== state.identities.find(([name]) => name === file.path)?.[2])
      throw new Error('A new file changed while the stash was created. The stash is retained.');
  }
}
/** A successful apply must still be present before its only backup is removed. All checks are read-only. */
export async function verifyRestoredChange(git: CommitEditGit, repo: string, oid: string, head: string) {
  if ((await workSha(git, repo, 'HEAD')) !== head) throw new Error('The branch changed during restoration.');
  for (const [options, target] of [
    [[], oid],
    [['--cached'], `${oid}^2`],
  ] as const) {
    const patch = await git.buffer(repo, ['diff', ...changeDiffOptions, `${oid}^1`, target]);
    if (patch.length) await git.input(repo, ['apply', '--reverse', '--check', ...options], patch);
  }
  const extra = await workSha(git, repo, `${oid}^3`);
  if (!extra) return;
  const format = (await git.run(repo, ['rev-parse', '--show-object-format'])).trim();
  for (const row of (await git.run(repo, ['ls-tree', '-r', '-z', extra])).split('\0').filter(Boolean)) {
    const relative = row.slice(row.indexOf('\t') + 1);
    const expected = row.split('\t')[0].split(' ')[2];
    const actual = await branchFileDigest(repo, relative, format);
    if ((await branchFileOid(git, repo, relative, actual)) !== expected) throw new Error('A restored new file changed.');
  }
}
