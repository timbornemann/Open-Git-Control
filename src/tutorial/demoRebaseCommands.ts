import type { DemoCommit, DemoRepository } from './demoRepository';
import type { DemoRebaseState } from './demoRebaseState';
import { REBASE_PENDING_PREFIX, planDemoRebase, squashRebaseBody } from './demoRebasePlan';
import { prepareDemoRebaseFiles, publishDemoRebase } from './demoRebasePublication';
import { prepareDemoHardResetFiles } from './demoHardReset';
import { resolveDemoCommit, demoTreeChanges } from './demoHistory';
import { refreshDemoFiles } from './demoFiles';
import { demoDirectorySet } from './demoDirectories';
import { recordDemoHead } from './demoReflog';
function inspectPause(repo: DemoRepository, args: readonly string[]): DemoRebaseState {
  const state = repo.rebaseState;
  if (args.length || !state) throw new Error('There is no matching pending practice rebase.');
  if (repo.branch || repo.commits[0]?.hash !== state.expectedHead || repo.branchHeads.get(state.originalBranch) !== state.originalHead)
    throw new Error('The practice rebase HEAD or original branch changed.');
  return state;
}
function resumeBase(repo: DemoRepository, state: DemoRebaseState): DemoCommit {
  const head = repo.commits[0];
  if (repo.modified.size || repo.conflicted) throw new Error('Resolve and stage all tracked practice changes before continuing the rebase.');
  if (state.phase === 'edit') {
    return repo.staged.size ? { ...structuredClone(head), hash: REBASE_PENDING_PREFIX + 'staged', files: structuredClone(repo.indexFiles) } : head;
  }
  if (repo.mergeState?.operation !== 'rebase' || repo.mergeState.conflicts.size) throw new Error('Resolve the pending practice rebase conflict first.');
  if (!demoTreeChanges(repo.headFiles, repo.indexFiles).length)
    throw new Error('The resolved rebase patch is empty. Abort or add the intended practice change.');
  const { action, source, subject } = state.instruction,
    combined = action === 'squash' || action === 'fixup';
  return {
    ...structuredClone(combined ? head : source),
    hash: REBASE_PENDING_PREFIX + 'resolved',
    parent: combined ? head.parent : head.hash,
    files: structuredClone(repo.indexFiles),
    ...(action === 'reword' ? { subject } : {}),
    ...(action === 'squash' ? { body: squashRebaseBody(head, source) } : {}),
  };
}
function abort(repo: DemoRepository, state: DemoRebaseState) {
  const original = resolveDemoCommit(repo, state.originalHead);
  if (!original?.files) throw new Error('The original practice rebase tree is missing.');
  const head = structuredClone(original.files),
    index = structuredClone(original.files),
    files = prepareDemoHardResetFiles(repo, original.files);
  repo.branch = state.originalBranch;
  repo.commits = [original, ...repo.commits.filter((commit) => commit.hash !== original.hash)];
  repo.headFiles = head;
  repo.indexFiles = index;
  repo.files = files;
  repo.tracked = new Set(Object.keys(head));
  repo.mergeState = null;
  repo.rebaseState = null;
  repo.conflicted = false;
  repo.directories = demoDirectorySet(Object.keys(files), [...repo.directories]);
  refreshDemoFiles(repo);
  recordDemoHead(repo, 'rebase (abort): returning to refs/heads/' + state.originalBranch);
  repo.mark('aborted');
  repo.emitChannel('tree', repo.activeRepo);
  return { success: true as const, data: 'Aborted the practice rebase.' };
}
export function demoRebaseCommand(repo: DemoRepository, name: 'rebaseContinue' | 'rebaseAbort', args: readonly string[]) {
  try {
    const state = inspectPause(repo, args);
    if (name === 'rebaseAbort') return abort(repo, state);
    const current = resumeBase(repo, state),
      planned = planDemoRebase(repo, current, state.remaining, [current]);
    return publishDemoRebase(repo, planned, state, prepareDemoRebaseFiles(repo, planned, true));
  } catch (cause) {
    return { success: false as const, error: cause instanceof Error ? cause.message : String(cause) };
  }
}
