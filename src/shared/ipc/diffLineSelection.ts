export type ApplyDiffLineSelectionRequest = {
  repoPath: string;
  path: string;
  source: 'staged' | 'unstaged';
  expectedDiff: string;
  selectedUnitIds: string[];
};
export type ApplyDiffLineSelectionResult =
  { status: 'applied' } | { status: 'stale' } | { status: 'unsupported'; reason: 'binary' | 'unsupported' | 'noChanges' | 'conflict' | 'lineEndingDependency' };
export const DIFF_SELECTION_MAX_BYTES = 2 * 1024 * 1024;
export const DIFF_SELECTION_MAX_LINES = 5000;
