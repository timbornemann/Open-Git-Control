import type { IpcResult } from '../../types/ipc';

export type BranchChangeTarget =
  { kind: 'existing'; branch: string } | { kind: 'create'; branch: string; startPoint: string; tracking?: boolean } | { kind: 'detached'; ref: string };
export type BranchChangeFile = { path: string; previousPath?: string; index: string; worktree: string; binary: boolean };
export type BranchChangeMode = 'carry' | 'park';
export type BranchChangeProgress = {
  phase: 'repository' | 'files' | 'safety' | 'target' | 'stash' | 'checkout' | 'restore' | 'cleanup';
  processedFiles?: number;
  totalFiles?: number;
  path?: string;
};
export type BranchChangePhase = 'preparing' | 'stashed' | 'switched' | 'applying' | 'conflict' | 'applied';
export type ParkedBranchChange = {
  id: string;
  name: string;
  sourceBranch: string;
  sourceHead: string;
  targetBranch: string;
  worktree: string;
  createdAt: number;
  phase: BranchChangePhase;
  stashOid?: string;
  error?: string;
  currentBranch?: string;
  currentHead?: string;
  currentWorktree?: boolean;
};
export type BranchChangeInspection = {
  planId: string;
  repoPath: string;
  sourceBranch: string;
  sourceHead: string;
  target?: BranchChangeTarget;
  targetSha: string;
  files: BranchChangeFile[];
  blocks: string[];
  conflicts?: string[];
  occupiedWorktree?: string;
  suggestedName: string;
  session?: ParkedBranchChange;
  stashParents?: { base: string; index: string; untracked: string };
  recoveryReviewed?: boolean;
};
export type InspectBranchChangeRequest = { repoPath: string; target?: BranchChangeTarget; sessionId?: string; reviewedRecovery?: boolean; progressId?: string };
export type ExecuteBranchChangeRequest = { repoPath: string; planId: string; mode: BranchChangeMode; name: string; progressId?: string };
export type RestoreBranchChangeRequest = { repoPath: string; planId: string; progressId?: string };
export type BranchChangeResult = { switched: boolean; restored: boolean; session?: ParkedBranchChange; error?: string; conflicts: string[] };
export interface BranchChangeApi {
  inspectBranchChange(request: InspectBranchChangeRequest): Promise<IpcResult<BranchChangeInspection>>;
  executeBranchChange(request: ExecuteBranchChangeRequest): Promise<IpcResult<BranchChangeResult>>;
  listParkedBranchChanges(repoPath: string): Promise<IpcResult<ParkedBranchChange[]>>;
  restoreBranchChange(request: RestoreBranchChangeRequest): Promise<IpcResult<BranchChangeResult>>;
  cancelBranchChange(repoPath: string): Promise<boolean>;
}
