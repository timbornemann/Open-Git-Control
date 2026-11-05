import type { DemoRepository } from './demoRepository';
export type ProjectState = Pick<
  DemoRepository,
  | 'branch'
  | 'branches'
  | 'tags'
  | 'tagRefs'
  | 'files'
  | 'submodules'
  | 'headFiles'
  | 'indexFiles'
  | 'fileVersions'
  | 'directories'
  | 'staged'
  | 'modified'
  | 'untracked'
  | 'tracked'
  | 'conflicted'
  | 'mergeState'
  | 'rebaseState'
  | 'commits'
  | 'stashes'
  | 'branchHeads'
  | 'remoteHeads'
  | 'branchUpstreams'
  | 'branchProtectionPatterns'
  | 'stashSnapshots'
  | 'parkedChanges'
  | 'messageEditBackups'
  | 'reflog'
>;
/** Each simulated project owns its files, empty directories, index and versions. */
export const captureDemoProject = (repo: DemoRepository): ProjectState =>
  structuredClone({
    branch: repo.branch,
    branches: repo.branches,
    branchHeads: repo.branchHeads,
    remoteHeads: repo.remoteHeads,
    branchUpstreams: repo.branchUpstreams,
    branchProtectionPatterns: repo.branchProtectionPatterns,
    tags: repo.tags,
    tagRefs: repo.tagRefs,
    files: repo.files,
    submodules: repo.submodules,
    headFiles: repo.headFiles,
    indexFiles: repo.indexFiles,
    fileVersions: repo.fileVersions,
    directories: repo.directories,
    staged: repo.staged,
    modified: repo.modified,
    untracked: repo.untracked,
    tracked: repo.tracked,
    conflicted: repo.conflicted,
    mergeState: repo.mergeState,
    rebaseState: repo.rebaseState,
    commits: repo.commits,
    stashes: repo.stashes,
    stashSnapshots: repo.stashSnapshots,
    parkedChanges: repo.parkedChanges,
    messageEditBackups: repo.messageEditBackups,
    reflog: repo.reflog,
  });
