import type { GitFileBlameLineDto, GitFileHistoryEntryDto } from '@/types/git';
import type { CommitStatsDto } from '@/types/gitDtos';
import type { FileHistoryOptionsDto } from '@/shared/ipc/fileHistory';
import type { DemoCommit, DemoRepository } from './demoRepository';
import { getDemoBlob, sameDemoBlob, demoGitText, type DemoFiles } from './demoBlob';
import { demoLineEdits, demoTextLines } from './demoDiff';
import { namedDemoHash, reachableDemoCommits } from './demoBranchRefs';

export type DemoCommitChange = { status: 'A' | 'M' | 'D' | 'R'; path: string; previousPath?: string };
export const demoCommitAuthor = (commit: DemoCommit) => commit.author || 'Alex Beispiel';

export function resolveDemoCommit(repo: DemoRepository, reference = 'HEAD'): DemoCommit | undefined {
  const expression = /^(.+?)(?:\^(\d*)|~(\d+))?$/.exec(reference);
  if (!expression) return;
  const base = expression[1];
  let commit: DemoCommit | undefined;
  const named = namedDemoHash(repo, base);
  if (named) commit = repo.commits.find((entry) => entry.hash === named);
  else {
    const matches = repo.commits.filter((entry) => entry.hash.startsWith(base));
    if (matches.length === 1) commit = matches[0];
  }
  const tilde = expression[3] !== undefined;
  const parentNumber = Number(expression[2] || 1);
  const steps = tilde ? Math.min(1_000, Number(expression[3])) : expression[2] !== undefined && parentNumber !== 0 ? 1 : 0;
  for (let index = 0; commit && index < steps; index++) {
    const parent = commit.parent.split(/\s+/)[tilde ? 0 : parentNumber - 1];
    commit = repo.commits.find((entry) => entry.hash === parent);
  }
  return commit;
}

export function demoAncestors(repo: DemoRepository, reference = 'HEAD'): DemoCommit[] {
  const result: DemoCommit[] = [],
    seen = new Set<string>();
  let commit = resolveDemoCommit(repo, reference);
  while (commit && !seen.has(commit.hash)) {
    result.push(commit);
    seen.add(commit.hash);
    const parent = commit.parent.split(/\s+/)[0];
    commit = repo.commits.find((entry) => entry.hash === parent);
  }
  return result;
}

export const DEMO_EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
export function demoRevisionTree(repo: DemoRepository, reference: string): DemoFiles | undefined {
  if (reference === DEMO_EMPTY_TREE) return {};
  const commit = resolveDemoCommit(repo, reference);
  if (commit) return commit.files || {};
  const parent = /^(.*)(?:\^1?|~1)$/.exec(reference);
  if (parent && resolveDemoCommit(repo, parent[1])?.parent === '') return {};
}

/** Compare saved trees, including deterministic exact-content renames. */
export function demoCommitChanges(repo: DemoRepository, commit: DemoCommit): DemoCommitChange[] {
  const before = repo.commits.find((entry) => entry.hash === commit.parent.split(/\s+/)[0])?.files || {},
    after = commit.files || {};
  return demoTreeChanges(before, after);
}
export function demoTreeChanges(before: DemoFiles, after: DemoFiles): DemoCommitChange[] {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort((a, b) => a.localeCompare(b));
  const changes: DemoCommitChange[] = paths
    .filter((path) => !sameDemoBlob(getDemoBlob(before, path), getDemoBlob(after, path)))
    .map((path) => ({
      path,
      status: getDemoBlob(before, path) === undefined ? 'A' : getDemoBlob(after, path) === undefined ? 'D' : 'M',
    }));
  const consumed = new Set<string>();
  for (const added of changes.filter((change) => change.status === 'A')) {
    const removed = changes.find(
      (change) => change.status === 'D' && !consumed.has(change.path) && sameDemoBlob(getDemoBlob(before, change.path), getDemoBlob(after, added.path)),
    );
    if (removed) {
      added.status = 'R';
      added.previousPath = removed.path;
      consumed.add(removed.path);
    }
  }
  return changes.filter((change) => !consumed.has(change.path));
}

export function demoCommitStats(repo: DemoRepository, commit: DemoCommit): CommitStatsDto {
  const before = repo.commits.find((entry) => entry.hash === commit.parent.split(/\s+/)[0])?.files || {},
    after = commit.files || {};
  const changes = demoCommitChanges(repo, commit);
  let additions = 0,
    deletions = 0;
  for (const change of changes) {
    const oldText = demoGitText(getDemoBlob(before, change.previousPath || change.path)),
      newText = demoGitText(getDemoBlob(after, change.path));
    if (oldText?.includes('\0') || newText?.includes('\0')) continue;
    for (const edit of demoLineEdits(demoTextLines(oldText), demoTextLines(newText))) {
      if (edit.kind === '+') additions++;
      else if (edit.kind === '-') deletions++;
    }
  }
  return { files: changes.length, additions, deletions };
}

const historyEntry = (commit: DemoCommit, path: string): GitFileHistoryEntryDto => ({
  hash: commit.hash,
  abbrevHash: commit.hash.slice(0, 7),
  author: demoCommitAuthor(commit),
  date: commit.date,
  subject: commit.subject,
  path,
});
function fileHistoryTo(repo: DemoRepository, path: string, reference: string): GitFileHistoryEntryDto[] {
  type Node = { commit: DemoCommit; entry?: GitFileHistoryEntryDto; parents: string[] };
  const nodes = new Map<string, Node>();
  function collect(commit: DemoCommit, filePath: string): string {
    const key = commit.hash + '\0' + filePath;
    if (nodes.has(key)) return key;
    const node: Node = { commit, parents: [] };
    nodes.set(key, node);
    const parents = commit.parent.split(/\s+/).flatMap((hash) => repo.commits.filter((entry) => entry.hash === hash));
    if (parents.length > 1) {
      // The app uses log --follow: a joining commit is not a separate file
      // entry. TREESAME follows one matching parent; otherwise retain both.
      const matching = parents.find((parent) => sameDemoBlob(getDemoBlob(parent.files || {}, filePath), getDemoBlob(commit.files || {}, filePath)));
      node.parents = (matching ? [matching] : parents).map((parent) => {
        const renamed = demoTreeChanges(parent.files || {}, commit.files || {}).find((change) => change.path === filePath && change.status === 'R');
        return collect(parent, renamed?.previousPath || filePath);
      });
    } else {
      const parent = parents[0];
      const change = demoTreeChanges(parent?.files || {}, commit.files || {}).find((change) => change.path === filePath);
      if (change) node.entry = historyEntry(commit, filePath);
      if (parent && change?.status !== 'A') node.parents = [collect(parent, change?.previousPath || filePath)];
    }
    return key;
  }
  const tip = resolveDemoCommit(repo, reference);
  if (!tip) return [];
  collect(tip, path);
  const children = new Map([...nodes.keys()].map((key) => [key, 0]));
  for (const node of nodes.values()) for (const parent of node.parents) children.set(parent, children.get(parent)! + 1);
  const ready = [...nodes.keys()].filter((key) => !children.get(key)),
    result: GitFileHistoryEntryDto[] = [];
  let visited = 0;
  while (ready.length) {
    const node = nodes.get(ready.shift()!)!;
    visited++;
    if (node.entry) result.push(node.entry);
    const previous = node.parents.filter((parent) => {
      const count = children.get(parent)! - 1;
      children.set(parent, count);
      return count === 0;
    });
    // Finish a branch before interleaving another, while retaining all child
    // dependencies. Newer branch tips precede their older sibling tips.
    previous.reverse().sort((left, right) => Date.parse(nodes.get(right)!.commit.date) - Date.parse(nodes.get(left)!.commit.date));
    ready.unshift(...previous);
  }
  if (visited !== nodes.size) throw new Error('Cyclic practice history cannot provide file history.');
  return result;
}

/** A deletion ends the lineage even if a later commit reuses its pathname. */
export function demoFileHistory(
  repo: DemoRepository,
  path: string,
  reference = 'HEAD',
  limit = 100,
  options: FileHistoryOptionsDto = {},
): GitFileHistoryEntryDto[] {
  const anchor = resolveDemoCommit(repo, reference);
  if (!anchor) return [];
  let tip = anchor;
  if (options.includeFuture && getDemoBlob(anchor.files || {}, path) !== undefined) {
    const descendants = reachableDemoCommits(repo, [repo.commits[0]?.hash || '']).reverse();
    const anchorIndex = descendants.findIndex((commit) => commit.hash === anchor.hash);
    for (const commit of anchorIndex < 0 ? [] : descendants.slice(anchorIndex + 1)) {
      const change = demoCommitChanges(repo, commit).find((change) => change.path === path || (change.status === 'R' && change.previousPath === path));
      tip = commit;
      if (change?.status === 'R') path = change.path;
      if (change?.status === 'D') break;
    }
  }
  const offset = Number.isFinite(options.offset) ? Math.max(0, Math.floor(options.offset!)) : 0;
  const count = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 100;
  return fileHistoryTo(repo, path, tip.hash).slice(offset, offset + count);
}

type BlameSnapshot = { text: ReturnType<typeof demoTextLines>; lines: GitFileBlameLineDto[] };
function annotateBlame(
  files: DemoFiles,
  path: string,
  commit: DemoCommit | undefined,
  parents: readonly BlameSnapshot[],
  source: 'unstaged' | 'staged',
): BlameSnapshot {
  const content = demoGitText(getDemoBlob(files, path));
  if (content?.includes('\0')) throw new Error('Binary practice files do not provide line blame.');
  const text = demoTextLines(content);
  const lines = text.map((line, index) => ({
    commitHash: commit?.hash || '0'.repeat(40),
    abbrevHash: commit?.hash.slice(0, 7) || '0000000',
    author: commit ? demoCommitAuthor(commit) : 'Not Committed Yet',
    authorTime: commit ? String(Date.parse(commit.date) / 1_000) : '0',
    summary: commit?.subject || (source === 'staged' ? 'Staged changes' : 'Working tree changes'),
    content: line.text,
    lineNumber: index + 1,
  }));
  const inherited = new Set<number>();
  for (const parent of parents) {
    let oldIndex = 0,
      currentIndex = 0;
    for (const edit of demoLineEdits(parent.text, text)) {
      if (edit.kind === '-') {
        oldIndex++;
        continue;
      }
      if (edit.kind === ' ') {
        const previous = parent.lines[oldIndex++];
        if (previous && !inherited.has(currentIndex)) {
          lines[currentIndex] = { ...previous, lineNumber: currentIndex + 1 };
          inherited.add(currentIndex);
        }
      }
      currentIndex++;
    }
  }
  return { text, lines };
}

/** Follow each unchanged line through either merge parent, including renames. */
export function demoFileBlame(repo: DemoRepository, path: string, reference?: string, source: 'unstaged' | 'staged' = 'unstaged'): GitFileBlameLineDto[] {
  const memo = new Map<string, BlameSnapshot>(),
    active = new Set<string>();
  function saved(commit: DemoCommit, filePath: string): BlameSnapshot {
    const key = commit.hash + '\0' + filePath;
    const cached = memo.get(key);
    if (cached) return cached;
    if (active.has(key)) throw new Error('Cyclic practice history cannot provide line blame.');
    active.add(key);
    const parents = commit.parent.split(/\s+/).flatMap((hash) => {
      const parent = repo.commits.find((entry) => entry.hash === hash);
      if (!parent) return [];
      const renamed = demoTreeChanges(parent.files || {}, commit.files || {}).find((change) => change.path === filePath && change.status === 'R');
      return [{ commit: parent, path: renamed?.previousPath || filePath }];
    });
    const matching = parents.find((parent) => sameDemoBlob(getDemoBlob(parent.commit.files || {}, parent.path), getDemoBlob(commit.files || {}, filePath)));
    const result = matching
      ? saved(matching.commit, matching.path)
      : annotateBlame(
          commit.files || {},
          filePath,
          commit,
          parents.map((parent) => saved(parent.commit, parent.path)),
          source,
        );
    active.delete(key);
    memo.set(key, result);
    return result;
  }
  const selected = reference ? resolveDemoCommit(repo, reference) : repo.commits[0];
  const head = selected ? saved(selected, path) : { text: [], lines: [] };
  return reference ? head.lines : annotateBlame(source === 'staged' ? repo.indexFiles : repo.files, path, undefined, [head], source).lines;
}
