import type { GitCommandName } from '@/shared/ipc/gitCommands';
import type { IpcResult } from '@/types/ipc';
import type { DemoRepository } from './demoRepository';
import { conflictAbortDraftMessage } from '@/shared/tutorial/mergeExamples';
import { getDemoBlob, sameDemoBlob, setDemoBlob, type DemoFiles } from './demoBlob';
import { resolveDemoCommit, demoTreeChanges } from './demoHistory';
import { recordDemoHead } from './demoReflog';
import { refreshDemoFiles } from './demoFiles';
const ok = (data = ''): IpcResult<string> => ({ success: true, data });
const fail = (error: string): IpcResult<string> => ({ success: false, error });
const copyPath = (into: DemoFiles, from: DemoFiles, path: string) => {
  const blob = getDemoBlob(from, path);
  if (blob === undefined) delete into[path];
  else setDemoBlob(into, path, structuredClone(blob));
};
/** Validate the complete rollback before restoring any index or work path. */
export function demoSequencerCommand(repo: DemoRepository, name: GitCommandName, args: readonly string[]): IpcResult<string> {
  const state = repo.mergeState!;
  if (state.operation === 'rebase') return fail('Use Rebase continue or abort for the pending practice rebase.');
  const picked = state.operation === 'cherry-pick';
  const continuing = name === (picked ? 'cherryPickContinue' : 'mergeContinue');
  const aborting = name === (picked ? 'cherryPickAbort' : 'mergeAbort');
  if (args.length || state.mode === 'squash' || (!continuing && !aborting)) return fail('Choose the matching pending practice operation.');
  if (continuing) {
    if (state.conflicts.size) return fail('Resolve all practice conflict files before continuing the operation.');
    if (picked) {
      const source = resolveDemoCommit(repo, state.sourceHash);
      if (!source) return fail('The original practice cherry-pick commit is missing.');
      if (!demoTreeChanges(repo.headFiles, repo.indexFiles).length)
        return fail('The resolved cherry-pick is empty. Abort it or add the intended practice change.');
      repo.saveCommit(source.subject, state.targetHash, source.body || '', source, 'commit (cherry-pick)');
    } else repo.saveCommit("Merge branch '" + state.source + "' into " + (repo.branch || 'HEAD'), state.targetHash + ' ' + state.sourceHash);
    repo.mark(picked ? 'cherry-picked' : 'merged');
    return ok('Practice operation completed.');
  }
  const resetPaths = new Set(state.conflicts.keys());
  for (const path of new Set([...Object.keys(repo.indexFiles), ...Object.keys(state.originalIndex)]))
    if (!sameDemoBlob(getDemoBlob(repo.indexFiles, path), getDemoBlob(state.originalIndex, path))) resetPaths.add(path);
  for (const path of resetPaths)
    if (!state.conflicts.has(path) && !sameDemoBlob(getDemoBlob(repo.files, path), getDemoBlob(repo.indexFiles, path)))
      return fail(conflictAbortDraftMessage.join(' / '));
  for (const path of resetPaths) {
    copyPath(repo.files, state.originalIndex, path);
    copyPath(repo.indexFiles, state.originalIndex, path);
  }
  repo.mergeState = null;
  repo.conflicted = false;
  refreshDemoFiles(repo);
  if (picked) recordDemoHead(repo, 'reset: moving to ' + state.targetHash);
  repo.mark('aborted');
  repo.emitChannel('tree', repo.activeRepo);
  return ok();
}
