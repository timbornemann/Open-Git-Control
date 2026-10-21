import type { PlannerBranchReference, PlannerChangeRequestReference, PlannerItem } from './projectPlanner';
import type { HostedRepository } from './hostingDtos';

export type PlannerWorkRequest = { repoPath: string; itemId: string; workflowId?: string };
export type PlannerWorkGetRequest = PlannerWorkRequest & { listRecoveries?: boolean };
export type PlannerWorkBase = { ref: string; sha: string };
export type PlannerWorktree = { branch: string; path: string };
export type PlannerWorkInspection = {
  planId: string;
  item: PlannerItem;
  suggestedName: string;
  bases: PlannerWorkBase[];
  defaultBase: string;
  changes: string[];
  worktrees: PlannerWorktree[];
  existing?: PlannerBranchReference;
  recoveryId?: string;
};
export type PlannerStartWorkRequest = PlannerWorkRequest & { planId: string; branchName: string; baseRef: string; acceptChanges: boolean };
export type PlannerStartWorkResult = { branch: string; item?: PlannerItem; recoveryId?: string; error?: string };
export type PlannerCommitReference = { sha: string; subject: string; timestamp: number; state: 'current' | 'replaced' | 'unavailable' };
export type PlannerWorkChangeRequest = PlannerChangeRequestReference & {
  state: 'open' | 'closed' | 'merged';
  title: string;
  headSha: string;
  sourceBranch: string;
  targetBranch: string;
  createdAt?: number;
};
export type PlannerWorkDetails = {
  itemId: string;
  revision?: string;
  workflowId?: string;
  hostingRepository?: HostedRepository;
  headSha?: string;
  branchMissing?: boolean;
  historyIncomplete?: boolean;
  completion?: 'ready' | 'new-work' | 'branch-missing' | 'incomplete-history' | 'ambiguous' | 'already-processed';
  commits: PlannerCommitReference[];
  requests: PlannerWorkChangeRequest[];
  checkedAt?: number;
  remoteCheckedAt?: number;
  error?: string;
  truncated?: boolean;
  recoveries?: Array<{ recoveryId: string; item: PlannerItem }>;
};
export type PlannerUpdateWorkRequest = PlannerWorkRequest & { expectedRevision: string } & (
    | { action: 'automation'; paused: boolean }
    | { action: 'attach-pr'; reference: PlannerChangeRequestReference }
    | { action: 'detach-pr'; id: string }
    | { action: 'archive' }
    | { action: 'assign-branch'; branchName: string }
    | { action: 'recover'; recoveryId: string }
  );
