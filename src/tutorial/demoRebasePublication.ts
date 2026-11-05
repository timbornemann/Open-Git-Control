import type { DemoRepository } from './demoRepository';
import type { DemoRebaseState } from './demoRebaseState';
import type { DemoRebasePlan } from './demoRebasePlan';
import { isPendingRebaseCommit } from './demoRebasePlan';
import { prepareDemoCheckoutFiles } from './demoBranchCommands';
import { prepareDemoConflictIndex } from './demoConflictCommands';
import { demoDirectorySet } from './demoDirectories';
import { refreshDemoFiles } from './demoFiles';
import { recordDemoHead } from './demoReflog';
export type DemoRebaseOrigin = Pick<DemoRebaseState, 'originalBranch' | 'originalHead'>;
/** Continue consumes explicitly staged contents; they are its new clean base. */
export function prepareDemoRebaseFiles(repo: DemoRepository, plan: DemoRebasePlan, consumeIndex = false) {
  const view = consumeIndex ? { ...repo, headFiles: repo.indexFiles } : repo;
  return prepareDemoCheckoutFiles(view, plan.stop?.phase === 'conflict' ? plan.stop.tree.files : plan.head.files!);
}
/** Publish one verified segment, including its actual detached/pending state. */
export function publishDemoRebase(repo: DemoRepository, plan: DemoRebasePlan, origin: DemoRebaseOrigin, prepared: ReturnType<typeof prepareDemoRebaseFiles>) {
  const pending = plan.commits.filter(isPendingRebaseCommit);
  const allocation = pending.length ? repo.commitSequence.plan(repo.commits, pending.length) : null;
  const mapping = new Map(pending.map((commit, index) => [commit.hash, allocation!.hashes[index]]));
  const rewritten = pending.map((commit) => ({ ...commit, hash: mapping.get(commit.hash)!, parent: mapping.get(commit.parent) || commit.parent }));
  const headHash = mapping.get(plan.head.hash) || plan.head.hash;
  const head = rewritten.find((commit) => commit.hash === headHash) || plan.head;
  const headFiles = structuredClone(head.files!);
  const state: DemoRebaseState | null = plan.stop
    ? {
        ...origin,
        expectedHead: headHash,
        phase: plan.stop.phase,
        instruction: structuredClone(plan.stop.instruction),
        remaining: structuredClone(plan.stop.remaining),
      }
    : null;
  if (allocation) repo.commitSequence.publish(allocation);
  repo.commits = [
    head,
    ...rewritten
      .slice()
      .reverse()
      .filter((commit) => commit.hash !== headHash),
    ...repo.commits.filter((commit) => commit.hash !== headHash),
  ];
  repo.branch = state ? '' : origin.originalBranch;
  if (!state) repo.branchHeads.set(repo.branch, headHash);
  repo.rebaseState = state;
  repo.headFiles = headFiles;
  repo.indexFiles = prepared.index;
  repo.files = prepared.files;
  repo.tracked = new Set(Object.keys(headFiles));
  repo.mergeState =
    plan.stop?.phase === 'conflict'
      ? {
          operation: 'rebase',
          mode: 'default',
          source: plan.stop.instruction.source.hash,
          sourceHash: plan.stop.instruction.source.hash,
          targetHash: headHash,
          targetBranch: '',
          originalIndex: structuredClone(headFiles),
          conflicts: structuredClone(plan.stop.tree.conflicts),
        }
      : null;
  if (repo.mergeState) prepareDemoConflictIndex(repo, repo.indexFiles);
  repo.conflicted = Boolean(repo.mergeState?.conflicts.size);
  repo.directories = demoDirectorySet(Object.keys(repo.files), [...repo.directories]);
  refreshDemoFiles(repo);
  recordDemoHead(repo, state ? 'rebase (' + state.phase + '): ' + state.instruction.source.subject : 'rebase (finish): returning to refs/heads/' + repo.branch);
  try {
    repo.mark(state ? (state.phase === 'edit' ? 'rebase-paused' : 'rebase-conflict') : 'rebased');
    repo.emitChannel('tree', repo.activeRepo);
  } catch {
    /* Observer failures cannot undo a confirmed practice segment. */
  }
  if (state?.phase === 'conflict')
    return { success: false as const, error: 'The practice rebase stopped at a conflict. Resolve it, then continue or abort the rebase.' };
  return { success: true as const, data: state ? 'Stopped for editing the practice commit.' : 'Successfully rebased the practice branch.' };
}
