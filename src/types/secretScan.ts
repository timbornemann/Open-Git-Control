export interface SecretScanPushScopeDto {
  mode: 'incremental' | 'full' | 'mixed';
  endpointCount: number;
  totalCommits: number;
  fallbackReasons: string[];
}

/** Counts refer to the current commit pass; other phases have no known total. */
export interface SecretScanProgressDto {
  phase: 'preparing' | 'staged' | 'history' | 'tags' | 'lfs' | 'verifying' | 'complete';
  checkedLines: number;
  processedCommits?: number;
  totalCommits?: number;
  pushScope?: SecretScanPushScopeDto;
}

export interface ScanPushSecretsRequestDto {
  repoPath: string;
  includeTags?: boolean;
  pushArgs?: string[];
  /** Correlates progress only; it is never used to authorize a push. */
  progressId?: string;
}
