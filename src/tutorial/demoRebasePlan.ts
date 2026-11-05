import type { DemoCommit, DemoRepository } from './demoRepository';
import type { DemoRebaseInstruction } from './demoRebaseInspection';
import type { DemoMergeTree } from './demoMergeTrees';
import { mergeDemoFileTrees } from './demoMergeTrees';
import { resolveDemoCommit, demoTreeChanges } from './demoHistory';
export const REBASE_PENDING_PREFIX = 'practice-rebase-pending-';
export const isPendingRebaseCommit = (commit: DemoCommit) => commit.hash.startsWith(REBASE_PENDING_PREFIX);
export const squashRebaseBody = (first: DemoCommit, second: DemoCommit) => [first.body || '', second.subject, second.body || ''].filter(Boolean).join('\n\n');
export type DemoRebasePlan = {
  commits: DemoCommit[];
  head: DemoCommit;
  stop?: { phase: 'edit' | 'conflict'; instruction: DemoRebaseInstruction; remaining: DemoRebaseInstruction[]; tree: DemoMergeTree };
};
/** Plan against original parents. Nothing is published until the whole segment is valid. */
export function planDemoRebase(
  repo: DemoRepository,
  base: DemoCommit,
  instructions: readonly DemoRebaseInstruction[],
  seed: DemoCommit[] = [],
): DemoRebasePlan {
  const commits = [...seed];
  let current = base,
    next = 0;
  for (const [index, instruction] of instructions.entries()) {
    const { action, source } = instruction;
    if (action === 'drop') continue;
    if ((action === 'squash' || action === 'fixup') && !commits.length) throw new Error('Squash and fixup need a preceding retained practice commit.');
    const parent = resolveDemoCommit(repo, source.parent);
    if (!parent?.files || !source.files || !current.files) throw new Error('An original practice tree is missing.');
    const tree = mergeDemoFileTrees(parent.files, current.files, source.files, source.hash.slice(0, 7) + ' (' + source.subject + ')');
    const remaining = structuredClone(instructions.slice(index + 1));
    if (tree.conflicts.size) return { commits, head: current, stop: { phase: 'conflict', instruction: structuredClone(instruction), remaining, tree } };
    if (!demoTreeChanges(current.files, tree.files).length) throw new Error('This replay would become empty. Choose a supported practice todo.');
    if (action === 'squash' || action === 'fixup') {
      commits.pop();
      current = {
        ...structuredClone(current),
        hash: REBASE_PENDING_PREFIX + next++,
        files: tree.files,
        body: action === 'squash' ? squashRebaseBody(current, source) : current.body,
      };
    } else if ((action === 'pick' || action === 'edit') && source.parent === current.hash) current = structuredClone(source);
    else
      current = {
        ...structuredClone(source),
        hash: REBASE_PENDING_PREFIX + next++,
        parent: current.hash,
        files: tree.files,
        ...(action === 'reword' ? { subject: instruction.subject } : {}),
      };
    commits.push(current);
    if (action === 'edit') return { commits, head: current, stop: { phase: 'edit', instruction: structuredClone(instruction), remaining, tree } };
  }
  return { commits, head: current };
}
