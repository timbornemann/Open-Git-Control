import type { GitCommandName } from '@/shared/ipc/gitCommands';
import type { IpcResult } from '@/types/ipc';
import type { GitMergeMode } from '@/types/git';
import { hasUnresolvedConflictMarkers } from '@/shared/git/conflictMarkers';
import type { DemoRepository } from './demoRepository';
import { demoBlobText, getDemoBlob, setDemoBlob, type DemoFiles } from './demoBlob';
import type { DemoMergeTree } from './demoMergeTrees';
import { refreshDemoFiles, stageDemoFiles } from './demoFiles';
import { demoSequencerCommand } from './demoSequencerCommands';

const ok = (data = ''): IpcResult<string> => ({ success: true, data });
const fail = (error: string): IpcResult<string> => ({ success: false, error });
const copyPath = (into: DemoFiles, from: DemoFiles, path: string) => {
  const blob = getDemoBlob(from, path);
  if (blob === undefined) delete into[path];
  else setDemoBlob(into, path, structuredClone(blob));
};
const changed = (repo: DemoRepository, event: string) => {
  repo.conflicted = Boolean(repo.mergeState?.conflicts.size);
  refreshDemoFiles(repo);
  repo.mark(event);
  repo.emitChannel('tree', repo.activeRepo);
};

export function beginDemoMergeConflict(repo: DemoRepository, tree: DemoMergeTree, source: string, sourceHash: string, mode: GitMergeMode) {
  repo.mergeState = {
    mode,
    source,
    sourceHash,
    targetHash: repo.commits[0].hash,
    targetBranch: repo.branch,
    originalIndex: structuredClone(repo.indexFiles),
    conflicts: structuredClone(tree.conflicts),
  };
  repo.conflicted = true;
}

/** Restore index stage zero only for resolved files; markers stay in the work tree. */
export function prepareDemoConflictIndex(repo: DemoRepository, index: DemoFiles) {
  for (const path of repo.mergeState!.conflicts.keys()) copyPath(index, repo.headFiles, path);
}

export function demoConflictCommand(repo: DemoRepository, name: GitCommandName, args: readonly string[]): IpcResult<string> {
  const state = repo.mergeState;
  if (!state) return fail('There is no pending practice merge or conflict.');
  if (repo.branch !== state.targetBranch || repo.commits[0]?.hash !== state.targetHash) return fail('The practice merge target has changed.');
  if (['mergeContinue', 'mergeAbort', 'cherryPickContinue', 'cherryPickAbort'].includes(name)) return demoSequencerCommand(repo, name, args);
  const path = args[0],
    conflict = state.conflicts.get(path);
  if (args.length !== 1 || !conflict) return fail('Choose an unresolved practice conflict file.');
  if (name === 'conflictTakeOurs' || name === 'conflictTakeTheirs') {
    const blob = name === 'conflictTakeOurs' ? conflict.ours : conflict.theirs;
    if (blob === undefined) return fail('This conflict side deleted the practice file. Choose deletion explicitly.');
    setDemoBlob(repo.files, path, structuredClone(blob));
    changed(repo, 'conflict-version-loaded');
    return ok();
  }
  if (name === 'conflictTakeDeleted') {
    delete repo.files[path];
    delete repo.indexFiles[path];
    state.conflicts.delete(path);
    changed(repo, 'conflict-resolved');
    return ok();
  }
  if (name !== 'conflictMarkResolved') return fail('This conflict action is not available in the exercise.');
  const text = demoBlobText(getDemoBlob(repo.files, path));
  if (text === undefined || hasUnresolvedConflictMarkers(text))
    return fail('Conflict markers remain in the file. Resolve them before marking the file as resolved.');
  const result = stageDemoFiles(repo, [path]);
  if (result.success) repo.mark('conflict-resolved');
  return result;
}
