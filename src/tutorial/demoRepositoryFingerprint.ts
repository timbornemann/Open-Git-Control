import type { DemoRepository } from './demoRepository';

/** Read receipts and simulated presentation settings do not change Git proofs. */
export const demoRepositoryFingerprint = (repo: DemoRepository) =>
  JSON.stringify({
    contextVersion: repo.contextVersion,
    repo: repo.activeRepo,
    branch: repo.branch,
    head: repo.commits[0]?.hash,
    commits: repo.commits.map((commit) => [commit.hash, commit.parent]),
    heads: [...repo.branchHeads],
    remotes: [...repo.remoteHeads],
    upstreams: [...repo.branchUpstreams],
    patterns: repo.branchProtectionPatterns,
    tags: repo.tags,
    tagRefs: [...repo.tagRefs],
    conflicted: repo.conflicted,
    rebaseState: repo.rebaseState,
    mergeState: repo.mergeState ? { ...repo.mergeState, conflicts: [...repo.mergeState.conflicts] } : null,
    files: repo.files,
    submodules: [...repo.submodules],
    index: repo.indexFiles,
    headFiles: repo.headFiles,
    stashes: repo.stashes,
    savedChanges: [...repo.stashSnapshots],
    reflog: repo.reflog,
    parkedChanges: repo.parkedChanges,
  });
