import type { DemoRepository } from './demoRepository';
import type { GitMergeMode } from '@/types/git';
import type { IpcResult } from '@/types/ipc';
import { MERGE_MODES, mergeModeFlags } from '@/shared/git/merge';
import { resolveDemoCommit } from './demoHistory';
import { reachableDemoCommits } from './demoBranchRefs';
import { prepareDemoCheckoutFiles, demoCheckout } from './demoBranchCommands';
import { refreshDemoFiles } from './demoFiles';
import { demoDirectorySet } from './demoDirectories';
import { mergeDemoTrees } from './demoMergeTrees';
import { beginDemoMergeConflict, prepareDemoConflictIndex } from './demoConflictCommands';
import { recordDemoHead } from './demoReflog';

const ok = (data = ''): IpcResult<string> => ({ success: true, data });
const fail = (error: string): IpcResult<string> => ({ success: false, error });
const failure = (cause: unknown) => fail(cause instanceof Error ? cause.message : String(cause));
const contained = (repo: DemoRepository, tip: string, ancestor: string) => reachableDemoCommits(repo, [tip]).some((commit) => commit.hash === ancestor);

/** Pure practice writes; unsupported merges never fall through to native Git. */
export function demoMerge(repo: DemoRepository, args: readonly string[]): IpcResult<string> {
  try {
    const sourceName = args.at(-1) || '';
    const flags = args.slice(0, -1);
    const mode: GitMergeMode = flags[0] === '--no-ff' ? 'noFf' : flags[0] === '--squash' ? 'squash' : flags[0] === '--ff-only' ? 'ffOnly' : 'default';
    if (!sourceName || sourceName.startsWith('-') || flags.length > 1 || flags.some((flag) => !['--no-ff', '--squash', '--ff-only'].includes(flag)))
      return fail('Choose one source and a supported practice merge mode.');
    const head = resolveDemoCommit(repo),
      source = resolveDemoCommit(repo, sourceName);
    if (!head?.files || !source?.files) return fail('The requested practice revision does not exist.');
    if (repo.rebaseState || repo.conflicted || repo.mergeState) return fail('Finish or abort the pending practice operation before merging again.');
    if (contained(repo, head.hash, source.hash)) return ok('Already up to date.');
    const fastForward = contained(repo, source.hash, head.hash);
    if (!fastForward && mode === 'ffOnly') return fail('fatal: Not possible to fast-forward; the practice branches have diverged.');
    if ((!fastForward || mode === 'noFf' || mode === 'squash') && repo.staged.size)
      return fail('Commit or stash staged practice changes before preparing this merge.');
    const tree = fastForward ? { files: source.files, conflicts: new Map() } : mergeDemoTrees(repo, head, source, sourceName);
    const prepared = prepareDemoCheckoutFiles(repo, tree.files);
    if (tree.conflicts.size) {
      beginDemoMergeConflict(repo, tree, sourceName, source.hash, mode);
      prepareDemoConflictIndex(repo, prepared.index);
    }
    repo.files = prepared.files;
    repo.indexFiles = prepared.index;
    repo.directories = demoDirectorySet(Object.keys(repo.files), [...repo.directories]);
    if (tree.conflicts.size) {
      refreshDemoFiles(repo);
      repo.mark('merge-conflict');
      repo.emitChannel('tree', repo.activeRepo);
      return fail('Automatic merge failed. Resolve the practice conflicts and then commit the result.');
    }
    if (mode === 'squash') {
      refreshDemoFiles(repo);
    } else if (mode === 'noFf' || !fastForward) {
      repo.saveCommit("Merge branch '" + sourceName + "' into " + (repo.branch || 'HEAD'), head.hash + ' ' + source.hash);
    } else {
      repo.commits = [source, ...repo.commits.filter((commit) => commit.hash !== source.hash)];
      if (repo.branch) repo.branchHeads.set(repo.branch, source.hash);
      repo.headFiles = structuredClone(source.files);
      repo.tracked = new Set(Object.keys(repo.headFiles));
      refreshDemoFiles(repo);
      recordDemoHead(repo, 'merge ' + sourceName + ': Fast-forward');
    }
    repo.mark('merged');
    repo.emitChannel('tree', repo.activeRepo);
    return ok(mode === 'squash' ? 'Squash changes prepared. Create a practice commit to save them.' : 'Practice merge completed.');
  } catch (cause) {
    return failure(cause);
  }
}

/** Captured local refs are checked before the automatic target checkout. */
export function demoMergeIntoBranch(repo: DemoRepository, args: readonly string[]): IpcResult<string> {
  const [source, target, mode, sourceOid, targetOid] = args;
  if (args.length !== 5 || !MERGE_MODES.includes(mode as GitMergeMode) || ![sourceOid, targetOid].every((oid) => /^[0-9a-f]{40}$/i.test(oid || '')))
    return fail('Invalid practice merge request.');
  if (source === target || repo.branch !== source || ![source, target].every((name) => repo.branches.includes(name)))
    return fail('Select a different local target from the active practice branch.');
  if (repo.branchHeads.get(source) !== sourceOid || repo.branchHeads.get(target) !== targetOid)
    return fail('A practice branch changed. Open the merge menu again.');
  if (repo.rebaseState || repo.conflicted || repo.mergeState || repo.changeCount())
    return fail('Finish pending practice operations and commit or stash open changes before switching to the merge target.');
  const checkout = demoCheckout(repo, [target]);
  if (!checkout.success) return checkout;
  return demoMerge(repo, [...mergeModeFlags(mode as GitMergeMode), source]);
}
