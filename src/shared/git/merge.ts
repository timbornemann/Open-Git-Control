import type { GitMergeMode } from '../../types/git';

export const MERGE_MODES: readonly GitMergeMode[] = ['default', 'noFf', 'squash', 'ffOnly'];

export type MergeIntoBranchRequest = {
  sourceBranch: string;
  targetBranch: string;
  mode: GitMergeMode;
  sourceOid: string;
  targetOid: string;
};

export function mergeModeFlags(mode: GitMergeMode): string[] {
  if (mode === 'noFf') return ['--no-ff'];
  if (mode === 'squash') return ['--squash'];
  if (mode === 'ffOnly') return ['--ff-only'];
  return [];
}
