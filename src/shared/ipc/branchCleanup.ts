import type { IpcResult } from '../../types/ipc';
import type { HostedRepositoryRef } from '../../types/hostingDtos';

export type BranchCleanupReasonCode =
  | 'merged'
  | 'merged-request'
  | 'upstream-gone'
  | 'remote-removed'
  | 'inactive'
  | 'not-candidate'
  | 'current'
  | 'worktree'
  | 'protected'
  | 'open-request'
  | 'operation'
  | 'incomplete-history'
  | 'missing-target'
  | 'remote-unavailable'
  | 'unknown-protection'
  | 'endpoint-isolation'
  | 'local-work';
export type BranchCleanupReason = { code: BranchCleanupReasonCode; detail?: string };
export type BranchCleanupTarget = { id: string; comparisonId: string; name: string; oid: string };
export type BranchCleanupComparison = { id: string; label: string; targetId: string | null };
export type BranchCleanupCandidate = {
  id: string;
  kind: 'local' | 'server';
  name: string;
  ref: string;
  oid: string;
  comparisonId: string;
  targetId: string | null;
  remoteName?: string;
  endpoint?: string;
  upstream?: string;
  lastCommitAt: number | null;
  unmergedCommitCount: number | null;
  classification: 'merged' | 'orphaned' | 'other';
  reasons: BranchCleanupReason[];
  blocks: BranchCleanupReason[];
  worktrees: string[];
  requiresForce: boolean;
  selectedByDefault: boolean;
  linkedLocalIds: string[];
};
export type BranchCleanupInspection = {
  id: string;
  repoPath: string;
  createdAt: number;
  expiresAt: number;
  targets: BranchCleanupTarget[];
  comparisons: BranchCleanupComparison[];
  candidates: BranchCleanupCandidate[];
  warnings: string[];
  protectedPatterns: string[];
};
export type InspectBranchCleanupRequest = {
  repoPath: string;
  operationId: string;
  targetOverrides?: Record<string, string>;
};
export type ExecuteBranchCleanupRequest = {
  repoPath: string;
  operationId: string;
  planId: string;
  selectedIds: string[];
  confirmedUnmergedIds: string[];
};
export type BranchCleanupOutcome = {
  id: string;
  name: string;
  kind: 'local' | 'server';
  endpoint?: string;
  status: 'deleted' | 'skipped' | 'failed' | 'unknown';
  message: string;
};
export type BranchCleanupResult = { outcomes: BranchCleanupOutcome[]; cancelled: boolean };
export type BranchCleanupPreferences = { protectedPatterns: string[] };
export interface BranchCleanupApi {
  inspectBranchCleanup(request: InspectBranchCleanupRequest): Promise<IpcResult<BranchCleanupInspection>>;
  executeBranchCleanup(request: ExecuteBranchCleanupRequest): Promise<IpcResult<BranchCleanupResult>>;
  cancelBranchCleanup(operationId: string): Promise<boolean>;
  getBranchCleanupPreferences(repoPath: string): Promise<IpcResult<BranchCleanupPreferences>>;
  saveBranchCleanupPreferences(repoPath: string, preferences: BranchCleanupPreferences): Promise<IpcResult<BranchCleanupPreferences>>;
}

/** Only complete, live protection/open-request inventories authorize server deletion. */
export type BranchCleanupHostingMetadata = {
  repository: HostedRepositoryRef;
  defaultBranch: string;
  branches: Array<{ name: string; oid: string; protected: boolean | null }>;
  openRequests: Array<{ number: string; sourceRepository: string; sourceBranch: string; targetRepository: string; targetBranch: string }>;
  mergedRequests: Array<{ number: string; sourceRepository: string; sourceBranch: string; targetBranch: string; headSha: string; mergeSha: string }>;
  complete: boolean;
  problem?: string;
};
