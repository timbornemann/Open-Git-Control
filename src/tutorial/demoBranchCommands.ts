import type { DemoCommit, DemoRepository } from './demoRepository';
import type { IpcResult } from '@/types/ipc';
import { validateBranchName } from '@/utils/gitRefValidation';
import { isPrimaryBranchName, PROTECTED_BRANCH_ERROR } from '@/shared/git/branchProtection';
import { resolveDemoCommit } from './demoHistory';
import { reachableDemoCommits } from './demoBranchRefs';
import { getDemoBlob, setDemoBlob, sameDemoBlob, isDemoGitlink, type DemoFiles } from './demoBlob';
import { refreshDemoFiles } from './demoFiles';
import { demoDirectorySet, validDemoTreePath } from './demoDirectories';
import { cleanupPatternMatches } from '@/shared/git/branchCleanupProtection';
import { recordDemoHead } from './demoReflog';
const ok = (data = ''): IpcResult<string> => ({ success: true, data });
const fail = (error: string): IpcResult<string> => ({ success: false, error });
const validName = (name: string) => name === name.trim() && !validateBranchName(name) && !name.startsWith('-') && name !== 'HEAD';
const duplicate = (repo: DemoRepository, name: string, ignored?: string) =>
  repo.branches.some((existing) => existing !== ignored && (existing === name || existing.startsWith(name + '/') || name.startsWith(existing + '/')));
const error = (message: string) => new Error(message);
const containsDemoCommit = (repo: DemoRepository, reference: string, hash: string | undefined) =>
  reachableDemoCommits(repo, [resolveDemoCommit(repo, reference)?.hash || '']).some((commit) => commit.hash === hash);
type Checkout = { branch: string; commit: DemoCommit; create: boolean; upstream?: string };
export function inspectDemoCheckout(repo: DemoRepository, args: readonly string[]): Checkout {
  const createAt = args.indexOf('-b');
  const tracking = args.includes('--track');
  const positional = args.filter((arg, index) => index !== createAt && !['--track', '--detach'].includes(arg));
  const created = createAt >= 0 ? args[createAt + 1] : undefined;
  const reference = created ? args.filter((arg, index) => index > createAt + 1 && arg !== '--track')[0] || 'HEAD' : positional[0];
  if (!reference || args.some((arg) => arg.startsWith('-') && !['-b', '--track', '--detach'].includes(arg)))
    throw error('Choose a supported practice checkout.');
  if (createAt >= 0 && (!created || !validName(created) || duplicate(repo, created))) throw error('Invalid or existing practice branch name.');
  const remote = reference.replace(/^(?:refs\/)?remotes\//, '');
  const upstream = tracking && repo.remoteHeads.has(remote) ? remote : undefined;
  const branch = created || (tracking ? remote.slice(remote.indexOf('/') + 1) : reference);
  const detached =
    args.includes('--detach') || (!created && !tracking && !repo.branches.includes(reference) && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(reference));
  if (tracking && !upstream) throw error('The requested remote-tracking practice branch does not exist.');
  if (tracking && !created && (!validName(branch) || duplicate(repo, branch))) throw error('This local practice branch already exists.');
  if (!created && !tracking && !detached && !repo.branches.includes(branch)) throw error('The requested local practice branch does not exist.');
  const commit = resolveDemoCommit(repo, reference);
  if (!commit?.files) throw error('The requested practice revision does not exist.');
  return { branch: detached ? '' : branch, commit, create: Boolean(created || tracking), upstream };
}
export function prepareDemoCheckoutFiles(repo: Pick<DemoRepository, 'files' | 'indexFiles' | 'headFiles' | 'untracked'>, target: DemoFiles) {
  const files = structuredClone(repo.files),
    index = structuredClone(repo.indexFiles);
  for (const path of repo.untracked) {
    const normalized = path.toLocaleLowerCase();
    if (
      Object.keys(target).some((candidate) => {
        const next = candidate.toLocaleLowerCase();
        return normalized === next || next.startsWith(normalized + '/') || normalized.startsWith(next + '/');
      })
    )
      throw error('An untracked practice path would be overwritten by checkout.');
  }
  for (const path of new Set([...Object.keys(repo.headFiles), ...Object.keys(target), ...Object.keys(index), ...Object.keys(files)])) {
    const before = getDemoBlob(repo.headFiles, path),
      next = getDemoBlob(target, path);
    if (sameDemoBlob(before, next)) continue;
    const staged = getDemoBlob(index, path),
      work = getDemoBlob(files, path);
    if (isDemoGitlink(before) && isDemoGitlink(next) && isDemoGitlink(work)) {
      if (!sameDemoBlob(before, staged)) throw error('Staged practice submodule changes would be overwritten by checkout.');
      setDemoBlob(index, path, next);
      continue; // Non-recursive checkout changes the parent index, not the child's HEAD.
    }
    const clean = sameDemoBlob(before, staged) && sameDemoBlob(staged, work);
    const alreadyTarget = before !== undefined && sameDemoBlob(staged, next) && sameDemoBlob(staged, work);
    if (!clean && !alreadyTarget) throw error('Local practice changes would be overwritten by checkout. Commit or stash them first.');
    if (next === undefined) {
      delete index[path];
      delete files[path];
    } else {
      setDemoBlob(index, path, next);
      setDemoBlob(files, path, next);
    }
  }
  return { files, index };
}
export function demoCheckout(repo: DemoRepository, args: readonly string[]): IpcResult<string> {
  try {
    const choice = inspectDemoCheckout(repo, args);
    if (repo.conflicted || repo.mergeState || repo.rebaseState) return fail('Finish or abort the pending practice operation before switching branches.');
    const { files, index } = prepareDemoCheckoutFiles(repo, choice.commit.files!);
    if (choice.create) {
      repo.branches.push(choice.branch);
      repo.branchHeads.set(choice.branch, choice.commit.hash);
      if (choice.upstream) repo.branchUpstreams.set(choice.branch, choice.upstream);
    }
    const previous = repo.branch || repo.commits[0]?.hash || 'HEAD';
    repo.branch = choice.branch;
    repo.commits = [choice.commit, ...repo.commits.filter((commit) => commit.hash !== choice.commit.hash)];
    repo.files = files;
    repo.indexFiles = index;
    repo.headFiles = structuredClone(choice.commit.files!);
    repo.tracked = new Set(Object.keys(repo.headFiles));
    repo.directories = demoDirectorySet(Object.keys(files), [...repo.directories]);
    refreshDemoFiles(repo);
    recordDemoHead(repo, 'checkout: moving from ' + previous + ' to ' + (choice.branch || choice.commit.hash));
    if (choice.create) repo.mark('branch-created');
    repo.mark('branch-switched');
    repo.emitChannel('tree', repo.activeRepo);
    return ok('Switched to practice branch ' + choice.branch);
  } catch (cause) {
    return fail(cause instanceof Error ? cause.message : String(cause));
  }
}
export function demoCheckoutFiles(repo: DemoRepository, reference: string, paths: readonly string[]): IpcResult<string> {
  const commit = resolveDemoCommit(repo, reference);
  if (!commit?.files || !paths.length || paths.some((path) => !validDemoTreePath(path) || getDemoBlob(commit.files!, path) === undefined))
    return fail('Choose an existing saved practice file and revision.');
  const existing = [...new Set([...Object.keys(repo.files), ...Object.keys(repo.indexFiles)])];
  if (
    paths.some((path) =>
      existing.some(
        (other) =>
          other !== path &&
          (other.toLocaleLowerCase() === path.toLocaleLowerCase() ||
            other.toLocaleLowerCase().startsWith(path.toLocaleLowerCase() + '/') ||
            path.toLocaleLowerCase().startsWith(other.toLocaleLowerCase() + '/')),
      ),
    )
  )
    return fail('A practice path would collide with an existing file or directory.');
  for (const path of new Set(paths)) {
    setDemoBlob(repo.files, path, structuredClone(commit.files[path]));
    setDemoBlob(repo.indexFiles, path, structuredClone(commit.files[path]));
    repo.mergeState?.conflicts.delete(path);
  }
  if (repo.mergeState) repo.conflicted = Boolean(repo.mergeState.conflicts.size);
  repo.directories = demoDirectorySet(Object.keys(repo.files), [...repo.directories]);
  refreshDemoFiles(repo);
  repo.mark('file-restored');
  repo.emitChannel('tree', repo.activeRepo);
  return ok();
}
function renameCurrentBranch(repo: DemoRepository, oldName: string, newName: string) {
  if (repo.branch !== oldName) return;
  repo.branch = newName;
  if (repo.mergeState?.targetBranch === oldName) repo.mergeState.targetBranch = newName;
}
export function demoBranchCommand(repo: DemoRepository, args: readonly string[]): IpcResult<string> {
  const flags = args.filter((arg) => arg.startsWith('-')),
    names = args.filter((arg) => !arg.startsWith('-'));
  if (!args.length || flags.some((flag) => ['-a', '-r', '--list'].includes(flag))) {
    const locals = args.includes('-r') ? [] : repo.branches.map((name) => (name === repo.branch ? '* ' : '  ') + name);
    const remotes = args.includes('-a') || args.includes('-r') ? [...repo.remoteHeads.keys()].map((name) => '  remotes/' + name) : [];
    return ok([...locals, ...remotes].join('\n'));
  }
  if (args.includes('--show-current')) return ok(repo.branch);
  if (flags.some((flag) => ['-d', '-D'].includes(flag))) {
    const name = names[0];
    if (names.length !== 1 || !repo.branches.includes(name)) return fail('The requested local practice branch does not exist.');
    if (isPrimaryBranchName(name) || repo.branchProtectionPatterns.some((pattern) => cleanupPatternMatches(name, pattern)))
      return fail(PROTECTED_BRANCH_ERROR + ' The practice branch is protected.');
    if (name === repo.branch) return fail('Cannot delete the checked-out practice branch.');
    const hash = repo.branchHeads.get(name);
    const upstream = repo.branchUpstreams.get(name);
    const mergeTarget = upstream && repo.remoteHeads.has(upstream) ? upstream : 'HEAD';
    if (!args.includes('-D') && !containsDemoCommit(repo, mergeTarget, hash)) return fail("error: the branch '" + name + "' is not fully merged.");
    repo.branches = repo.branches.filter((branch) => branch !== name);
    repo.branchHeads.delete(name);
    repo.branchUpstreams.delete(name);
    repo.mark('branch-deleted');
    return ok();
  }
  if (args.includes('-m')) {
    const [oldName, newName] = names.length === 1 ? [repo.branch, names[0]] : names;
    if (names.length < 1 || names.length > 2 || !repo.branches.includes(oldName) || !validName(newName) || duplicate(repo, newName, oldName))
      return fail('Invalid or existing practice branch name.');
    const hash = repo.branchHeads.get(oldName);
    repo.branches = repo.branches.map((name) => (name === oldName ? newName : name));
    repo.branchHeads.delete(oldName);
    if (hash) repo.branchHeads.set(newName, hash);
    const upstream = repo.branchUpstreams.get(oldName);
    repo.branchUpstreams.delete(oldName);
    if (upstream) repo.branchUpstreams.set(newName, upstream);
    renameCurrentBranch(repo, oldName, newName);
    repo.mark('branch-renamed');
    return ok();
  }
  if (flags.length || names.length < 1 || names.length > 2 || !validName(names[0]) || duplicate(repo, names[0]))
    return fail('Invalid or existing practice branch name.');
  const commit = resolveDemoCommit(repo, names[1] || 'HEAD');
  if (!commit) return fail('The requested practice revision does not exist.');
  repo.branches.push(names[0]);
  repo.branchHeads.set(names[0], commit.hash);
  repo.mark('branch-created');
  return ok();
}
