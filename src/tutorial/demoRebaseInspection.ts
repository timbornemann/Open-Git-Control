import { COMMIT_HASH_RE, normalizeInteractiveRebaseTodo } from '@/shared/git/interactiveRebase';
import type { DemoCommit, DemoRepository } from './demoRepository';
import { resolveDemoCommit } from './demoHistory';
export type DemoRebaseAction = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop';
export type DemoRebaseInstruction = { action: DemoRebaseAction; source: DemoCommit; subject: string };
/** Resolve the complete original range before constructing replacement objects. */
export function inspectDemoRebase(repo: DemoRepository, baseHash: string, todoLines: unknown) {
  if (typeof baseHash !== 'string' || !COMMIT_HASH_RE.test(baseHash.trim())) throw new Error('Choose a valid practice rebase base hash.');
  const lines = normalizeInteractiveRebaseTodo(todoLines);
  if (!repo.branch || repo.rebaseState || repo.mergeState || repo.conflicted)
    throw new Error('Finish the pending operation and check out a practice branch before rebasing.');
  if (repo.staged.size || repo.modified.size) throw new Error('Commit or stash tracked practice changes before rebasing.');
  const base = resolveDemoCommit(repo, baseHash.trim()),
    head = repo.commits[0];
  if (!base?.files || !head?.files) throw new Error('The practice rebase base or HEAD is missing.');
  const range = new Map<string, DemoCommit>();
  let cursor: DemoCommit | undefined = head;
  while (cursor && cursor.hash !== base.hash && !range.has(cursor.hash)) {
    if (!cursor.files || cursor.parent.split(/\s+/).filter(Boolean).length !== 1)
      throw new Error('Choose a linear practice rebase range without merge commits.');
    range.set(cursor.hash, cursor);
    cursor = resolveDemoCommit(repo, cursor.parent);
    if (range.size > 500) throw new Error('The practice rebase range is too large.');
  }
  if (!cursor || cursor.hash !== base.hash || !range.size) throw new Error('Choose an ancestor before at least one practice commit.');
  const seen = new Set<string>();
  const instructions: DemoRebaseInstruction[] = lines.map((line) => {
    const [, action, reference, subject = ''] = /^(\S+) (\S+)(?: (.*))?$/.exec(line)!,
      source = resolveDemoCommit(repo, reference);
    if (!source || !range.has(source.hash) || seen.has(source.hash))
      throw new Error('Use each selected practice commit at most once and stay inside the rebase range.');
    seen.add(source.hash);
    return { action: action as DemoRebaseAction, source, subject };
  });
  return { base, head, instructions };
}
