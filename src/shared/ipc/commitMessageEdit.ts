export type CommitMessageEditRequest = { repoPath: string; commitHash: string };

export type CommitMessageEditBlock =
  'bare' | 'shallow' | 'detached' | 'operation' | 'dirty' | 'not-on-branch' | 'merge' | 'published' | 'referenced' | 'worktree' | 'incomplete';

export type CommitMessageEditInspection = {
  commitHash: string;
  title: string;
  description: string;
  expectedHead: string;
  expectedBranch: string;
  commitCount: number;
  signedCommitCount: number;
  blockReason: CommitMessageEditBlock | null;
  blockDetail: string;
};

export type RewordCommitMessageRequest = CommitMessageEditRequest & {
  operationId: string;
  expectedHead: string;
  expectedBranch: string;
  title: string;
  description: string;
};

export type CommitMessageEditResult = {
  changed: boolean;
  oldHead: string;
  newHead: string;
  hashMapping: Record<string, string>;
  backupRef: string | null;
};

export type CommitMessageEditBackup = {
  ref: string;
  hash: string;
  branch: string;
  createdAt: number;
};

export type CommitMessageEditPhase = 'checking' | 'remotes' | 'rewriting' | 'verifying' | 'publishing' | 'cleanup';
