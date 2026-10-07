/** Counts refer to the current commit pass; other phases have no known total. */
export interface SecretScanProgressDto {
  phase: 'preparing' | 'staged' | 'history' | 'tags' | 'lfs' | 'verifying' | 'complete';
  checkedLines: number;
  processedCommits?: number;
  totalCommits?: number;
}

export interface ScanPushSecretsRequestDto {
  repoPath: string;
  includeTags?: boolean;
  pushArgs?: string[];
  /** Correlates progress only; it is never used to authorize a push. */
  progressId?: string;
}
