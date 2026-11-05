import type { DemoRepository } from './demoRepository';
import { resolveDemoCommit } from './demoHistory';
export type DemoReplayOperation = 'cherry-pick' | 'revert';
function parseReplayArgs(operation: DemoReplayOperation, args: readonly string[]) {
  const refs: string[] = [];
  let mainline: number | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (operation === 'revert' && arg === '--no-edit') continue;
    if (operation === 'revert' && (arg === '-m' || arg === '--mainline')) {
      const number = args[++index] || '';
      if (mainline !== undefined || !/^[1-9][0-9]*$/.test(number) || !Number.isSafeInteger(Number(number)))
        throw new Error('Choose one positive practice mainline parent number.');
      mainline = Number(number);
    } else if (arg.startsWith('-')) throw new Error('This replay option is not available in the practice project.');
    else refs.push(arg);
  }
  if (refs.length !== 1) throw new Error('Select one saved practice commit.');
  return { reference: refs[0], mainline };
}
/** Resolve the selected parent before preparing any index or working-file writes. */
export function inspectDemoReplay(repo: DemoRepository, operation: DemoReplayOperation, args: readonly string[]) {
  const { reference, mainline } = parseReplayArgs(operation, args);
  if (repo.rebaseState || repo.mergeState || repo.conflicted) throw new Error('Finish or abort the pending practice operation first.');
  if (repo.staged.size) throw new Error('Commit or stash staged practice changes before replaying a commit.');
  const source = resolveDemoCommit(repo, reference),
    head = repo.commits[0];
  if (!source?.files || !head?.files) throw new Error('Choose an existing saved practice commit and an existing HEAD.');
  const parents = source.parent.split(/\s+/).filter(Boolean);
  if (parents.length > 1 && mainline === undefined) throw new Error('Replaying a merge commit requires a mainline parent choice.');
  const parentNumber = mainline || 1;
  if (parentNumber > 1 && parentNumber > parents.length) throw new Error('The selected practice mainline parent does not exist.');
  const parentHash = parents[parentNumber - 1],
    parent = parentHash ? resolveDemoCommit(repo, parentHash) : undefined;
  if (parentHash && !parent?.files) throw new Error('The original practice parent commit is missing.');
  return {
    source,
    head,
    current: head.files,
    before: operation === 'revert' ? source.files : parent?.files || {},
    after: operation === 'revert' ? parent?.files || {} : source.files,
    mergeParentHash: parents.length > 1 ? parentHash : undefined,
  };
}
