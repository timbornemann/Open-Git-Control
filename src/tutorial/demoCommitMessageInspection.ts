import type { CommitMessageEditInspection, CommitMessageEditBlock } from '@/shared/ipc/commitMessageEdit';
import type { DemoRepository, DemoCommit } from './demoRepository';
import { reachableDemoCommits } from './demoBranchRefs';
export type DemoMessageInspection = { inspection: CommitMessageEditInspection; commits: DemoCommit[] };
export function inspectDemoMessageEdit(repo: DemoRepository, hash: string): DemoMessageInspection {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(hash)) throw new Error('Invalid full practice commit hash.');
  const selected = repo.commits.find((commit) => commit.hash === hash);
  if (!selected) throw new Error('The requested practice commit does not exist.');
  const base: CommitMessageEditInspection = {
    commitHash: hash,
    title: selected.subject,
    description: selected.body || '',
    expectedHead: '',
    expectedBranch: '',
    commitCount: 0,
    signedCommitCount: 0,
    blockReason: null,
    blockDetail: '',
  };
  const blocked = (blockReason: CommitMessageEditBlock, detail = ''): DemoMessageInspection => ({
    inspection: { ...base, blockReason, blockDetail: 'Commit message edit blocked (' + blockReason + ')' + (detail ? ': ' + detail : '.') },
    commits: [],
  });
  if (repo.rebaseState || repo.mergeState || repo.conflicted) return blocked('operation');
  if (!repo.branch) return blocked('detached');
  if (repo.changeCount()) return blocked('dirty');
  const head = repo.commits[0];
  if (!head || repo.branchHeads.get(repo.branch) !== head.hash) return blocked('incomplete');
  const path: DemoCommit[] = [],
    seen = new Set<string>();
  let current: DemoCommit | undefined = head;
  while (current && !seen.has(current.hash)) {
    path.push(current);
    seen.add(current.hash);
    if (current.hash === hash) break;
    current = repo.commits.find((commit) => commit.hash === current!.parent.split(/\s+/)[0]);
  }
  if (path.at(-1)?.hash !== hash) return blocked(reachableDemoCommits(repo, [head.hash]).some((commit) => commit.hash === hash) ? 'merge' : 'not-on-branch');
  if (path.some((commit) => commit.parent.split(/\s+/).filter(Boolean).length > 1)) return blocked('merge');
  const refs: [string, string][] = [
    ...[...repo.branchHeads].map(([name, target]): [string, string] => ['refs/heads/' + name, target]),
    ...[...repo.remoteHeads].map(([name, target]): [string, string] => ['refs/remotes/' + name, target]),
    ...[...repo.tagRefs].map(([name, tag]): [string, string] => ['refs/tags/' + name, tag.target]),
    ...repo.stashes.map((stash): [string, string] => ['refs/stash', stash.hash]),
  ];
  for (const [ref, target] of refs.sort(([a], [b]) => a.localeCompare(b))) {
    if (ref === 'refs/heads/' + repo.branch) continue;
    if (!repo.commits.some((commit) => commit.hash === target)) return blocked('incomplete', ref);
    if (reachableDemoCommits(repo, [target]).some((commit) => commit.hash === hash))
      return blocked(ref.startsWith('refs/remotes/') ? 'published' : 'referenced', ref);
  }
  const commits = path.reverse();
  return { inspection: { ...base, expectedHead: head.hash, expectedBranch: 'refs/heads/' + repo.branch, commitCount: commits.length }, commits };
}
