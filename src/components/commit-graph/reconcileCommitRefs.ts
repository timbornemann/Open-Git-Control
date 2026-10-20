import type { GitCommit } from '@/utils/gitParsing';

export type GraphRefSnapshot = Record<string, string[]>;

/** Decorations are mutable even though the commit object itself is immutable. */
export function reconcileCommitRefs(commits: GitCommit[], refs?: GraphRefSnapshot): GitCommit[] {
  if (!refs) return commits;
  return commits.map((commit) => {
    const current = refs[commit.hash] ?? [];
    return current.length === commit.refs.length && current.every((ref, index) => ref === commit.refs[index]) ? commit : { ...commit, refs: current };
  });
}

export function retainReachableCommits(commits: GitCommit[], fresh: GitCommit[], refs: GraphRefSnapshot, scope: 'head' | 'all'): GitCommit[] {
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  // The log page and the ref read are separate Git reads. Always retain the
  // fresh page if refs moved between them; the next sync will reconcile it.
  const pending = fresh.map((commit) => commit.hash);
  for (const [hash, labels] of Object.entries(refs)) {
    if (scope === 'all' || labels.some((ref) => ref === 'HEAD' || ref.startsWith('HEAD ->'))) pending.push(hash);
  }
  const reachable = new Set<string>();
  while (pending.length) {
    const hash = pending.pop()!;
    if (reachable.has(hash)) continue;
    reachable.add(hash);
    const commit = byHash.get(hash);
    if (commit) pending.push(...commit.parentHashes);
  }
  return commits.filter((commit) => reachable.has(commit.hash));
}
