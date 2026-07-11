import type { FileChangeType } from './gitStatusSnapshot';

export type SnapshotFile = {
  path: string;
  /** Previous pathname when this snapshot entry represents a rename/copy. */
  originalPath?: string;
  changeType: FileChangeType;
  additions: number;
  deletions: number;
  isBinary: boolean;
  preview: string;
  keyChanges: string[];
  groupKey: string;
  hydrated: boolean;
};

export type CommitMessage = {
  title: string;
  description: string;
};

export type AiCommit = {
  hash: string;
  subject: string;
};

export type StagePathsCapable = {
  stagePaths: (paths: string[]) => Promise<string>;
};

export type CommitForPathsCapable = {
  commitWithMessageForPaths: (message: CommitMessage, paths: string[]) => Promise<string>;
};

export type CommitAtPathCapable = {
  getRepoPath: () => string | null;
  commitWithMessageAtPath: (repoPath: string, message: CommitMessage, paths?: string[]) => Promise<string>;
};

export type CommitMessageCapable = {
  commitWithMessage: (message: CommitMessage) => Promise<string>;
};

export type ProgressPhase = 'snapshot' | 'grouping' | 'committing' | 'retry' | 'fallback' | 'done' | 'failed';
export type ProgressMode = 'normal' | 'retry' | 'fallback';
export type AutoCommitStrategy = 'standard' | 'large-hybrid';

export type AiProgressUpdate = {
  phase: ProgressPhase;
  message: string;
  progress?: number;
  details?: Record<string, unknown>;
};

export type AiAutoCommitResult = {
  commits: AiCommit[];
  summary: string;
  turns: number;
  modeTransitions: string[];
  processedFiles: number;
  remainingFiles: number;
  commitPlanStats: {
    groupCount: number;
    retries: number;
    fallbackCommits: number;
    totalCommits: number;
    totalFilesProcessed: number;
  };
  warnings: string[];
  diagnostics: string[];
};

export type ReleaseCommitInput = {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  htmlUrl?: string | null;
};

export type ReleaseVersionBump = 'major' | 'minor' | 'patch';

export type GeneratedReleaseNotes = {
  markdown: string;
  source: 'ai' | 'fallback';
  warning?: string;
};
