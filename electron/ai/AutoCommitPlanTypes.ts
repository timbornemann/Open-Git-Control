import type { CommitMessage } from './aiServiceTypes';

export type ChangeSource = 'staged' | 'worktree';

export type AutoCommitChange = {
  id: string;
  source: ChangeSource;
  path: string;
  originalPath?: string;
  status: string;
  oldBlob: string;
  newBlob: string;
  oldMode: string;
  newMode: string;
  additions: number;
  deletions: number;
  binary: boolean;
};

export type AutoCommitSnapshot = {
  head: string | null;
  branch: string | null;
  headTree: string;
  stagedTree: string;
  worktreeTree: string;
  stagedIndexPath: string;
  worktreeIndexPath: string;
  changes: AutoCommitChange[];
  skippedPaths: string[];
};

export type ChangeContext = AutoCommitChange & {
  hunks: string[];
  symbols: string[];
  references: string[];
  imports: string[];
  summary?: string;
};

export type ChangeRelationship = {
  from: string;
  to: string;
  reason: string;
  strong: boolean;
};

export type AutoCommitContext = {
  changes: ChangeContext[];
  relationships: ChangeRelationship[];
  relatedCode: Array<{ path: string; excerpt: string }>;
};

export type AutoCommitGroup = CommitMessage & {
  id: string;
  source: ChangeSource;
  changeIds: string[];
  rationale: string;
  messageSource: 'ai' | 'fallback';
};

export type AutoCommitGroupResult = AutoCommitGroup & {
  paths: string[];
  status: 'pending' | 'committed';
  hash?: string;
};

export type AutoCommitMetrics = {
  snapshotMs: number;
  contextMs: number;
  aiMs: number;
  gitMs: number;
  providerCalls: number;
  contextCacheHits: number;
  contextBytes: number;
};
