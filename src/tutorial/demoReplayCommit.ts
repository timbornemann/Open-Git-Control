import type { DemoRepository } from './demoRepository';
import { demoTreeChanges } from './demoHistory';
import { inspectDemoReplay, type DemoReplayOperation } from './demoReplayInspection';
import { mergeDemoFileTrees } from './demoMergeTrees';
import { prepareDemoCheckoutFiles } from './demoBranchCommands';
import { demoDirectorySet } from './demoDirectories';
import { beginDemoMergeConflict, prepareDemoConflictIndex } from './demoConflictCommands';
import { refreshDemoFiles } from './demoFiles';
const fail = (error: string) => ({ success: false as const, error });
/** Replays use the selected original parent as their explicit three-way base. */
export function replayDemoCommit(repo: DemoRepository, operation: DemoReplayOperation, args: readonly string[]) {
  try {
    const { source, head, current, before, after, mergeParentHash } = inspectDemoReplay(repo, operation, args);
    const merged = mergeDemoFileTrees(before, current, after, source.hash.slice(0, 7) + ' (' + source.subject + ')');
    if (merged.conflicts.size && operation === 'revert') return fail('This revert needs a conflict exercise. No practice files were changed.');
    if (!demoTreeChanges(current, merged.files).length) return fail('This replay has no new practice change to save.');
    const prepared = prepareDemoCheckoutFiles(repo, merged.files);
    if (merged.conflicts.size) {
      beginDemoMergeConflict(repo, merged, source.hash, source.hash, 'default');
      repo.mergeState!.operation = 'cherry-pick';
      prepareDemoConflictIndex(repo, prepared.index);
    }
    const title = operation === 'revert' ? 'Revert "' + source.subject + '"' : source.subject;
    const reverted = mergeParentHash
      ? 'This reverts commit ' + source.hash + ', reversing\nchanges made to ' + mergeParentHash + '.'
      : 'This reverts commit ' + source.hash + '.';
    const body = operation === 'revert' ? reverted : source.body || '';
    repo.files = prepared.files;
    repo.indexFiles = prepared.index;
    repo.directories = demoDirectorySet(Object.keys(repo.files), [...repo.directories]);
    if (merged.conflicts.size) {
      refreshDemoFiles(repo);
      repo.mark('cherry-pick-conflict');
      repo.emitChannel('tree', repo.activeRepo);
      return fail('The practice cherry-pick stopped at a conflict. Resolve it, then continue or abort the cherry-pick.');
    }
    return repo.saveCommit(title, head.hash, body, operation === 'cherry-pick' ? source : undefined, operation);
  } catch (cause) {
    return fail(cause instanceof Error ? cause.message : String(cause));
  }
}
