import type { GitMergeMode } from '@/types/git';
import type { DemoFiles } from './demoBlob';
import type { DemoMergeConflict } from './demoMergeTrees';

/** Pending operation is separate from the remaining unresolved index paths. */
export type DemoMergeState = {
  operation?: 'cherry-pick' | 'rebase';
  mode: GitMergeMode;
  source: string;
  sourceHash: string;
  targetHash: string;
  targetBranch: string;
  originalIndex: DemoFiles;
  conflicts: Map<string, DemoMergeConflict>;
};
